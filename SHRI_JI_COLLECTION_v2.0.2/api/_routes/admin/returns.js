// Admin return queue and decisions; every request requires admin membership re-check.
import { route, requireAdmin, admin, jsonBody, HttpError } from "../../_lib.js";
import { signReturnPhotos } from "../orders/returns.js";
import { text } from "../../_validate.js";

const STATUSES = new Set(["requested", "approved", "rejected", "pickup_scheduled", "in_transit", "returned", "refund_processing", "refunded", "closed"]);
const NEXT = {
  requested: new Set(["approved", "rejected", "closed"]),
  approved: new Set(["pickup_scheduled", "in_transit", "returned", "refund_processing", "closed"]),
  rejected: new Set(["closed"]),
  pickup_scheduled: new Set(["in_transit", "closed"]),
  in_transit: new Set(["returned", "closed"]),
  returned: new Set(["refund_processing", "refunded", "closed"]),
  refund_processing: new Set(["refunded", "closed"]),
  refunded: new Set(["closed"]), closed: new Set(),
};
export default route(["GET", "PATCH"], async (req, res) => {
  const adminUser = await requireAdmin(req, res), db = await admin();
  if (req.method === "GET") {
    const q = req.query || {};
    let qb = db.from("order_returns").select("*").order("created_at", { ascending: false }).limit(200);
    if (q.status && STATUSES.has(String(q.status))) qb = qb.eq("status", String(q.status));
    if (q.search) {
      const search = String(q.search).replace(/[^A-Za-z0-9 -]/g, " ").trim().slice(0, 50);
      if (search) qb = qb.or(`order_number.ilike.%${search}%,reason.ilike.%${search}%`);
    }
    const { data, error } = await qb;
    if (error) throw error;
    const rows = await Promise.all((data || []).map(async r => ({ ...r, photos: await signReturnPhotos(db, r.photo_urls) })));
    return res.json({ returns: rows });
  }
  const b = jsonBody(req), id = Number(b.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Invalid return request.");
  const { data: current, error: e0 } = await db.from("order_returns").select("*").eq("id", id).maybeSingle();
  if (e0) throw e0;
  if (!current) throw new HttpError(404, "Return request not found.");
  const status = String(b.status || "");
  if (!STATUSES.has(status)) throw new HttpError(400, "Choose a valid return status.");
  if (!NEXT[current.status]?.has(status) && status !== current.status) throw new HttpError(409, `Invalid return transition: ${current.status} → ${status}.`);
  const decision_reason = b.decision_reason === undefined ? current.decision_reason : (text(b.decision_reason, "Decision reason", { max: 1000 }) || null);
  if (["rejected", "approved"].includes(status) && !decision_reason) throw new HttpError(400, "Record a reason for the decision.");
  let refund_amount = current.refund_amount;
  if (b.refund_amount !== undefined) {
    refund_amount = Number(b.refund_amount);
    const item = current.item_snapshot || {}, max = Math.max(0, Number(item.unit_price || item.price || 0) * Number(item.qty || 1));
    if (!Number.isFinite(refund_amount) || refund_amount < 0 || refund_amount > max) throw new HttpError(400, `Refund amount must be between ₹0 and ${max.toFixed(2)} for this item.`);
  }
  const refund_status = b.refund_status === undefined ? current.refund_status : String(b.refund_status);
  if (!["not_started", "processing", "refunded", "rejected"].includes(refund_status)) throw new HttpError(400, "Invalid refund status.");
  const { data: updated, error } = await db.from("order_returns").update({ status, decision_reason, decided_by: ["approved", "rejected"].includes(status) ? adminUser.id : current.decided_by, decided_at: ["approved", "rejected"].includes(status) ? new Date().toISOString() : current.decided_at, refund_amount, refund_status, updated_at: new Date().toISOString() }).eq("id", id).eq("status", current.status).select().maybeSingle();
  if (error) throw error;
  if (!updated) throw new HttpError(409, "This return request changed in another session. Refresh and try again.");
  const { error: logError } = await db.from("order_return_events").insert({ return_id: id, order_id: current.order_id, event_type: "status_changed", old_status: current.status, new_status: status, actor_user_id: adminUser.id, note: decision_reason });
  if (logError) throw logError;
  res.json({ returnRequest: { ...updated, photos: await signReturnPhotos(db, updated.photo_urls) } });
});
