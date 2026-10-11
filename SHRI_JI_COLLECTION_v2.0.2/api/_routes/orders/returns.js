// Customer return/issue requests are owner-scoped and validated against the order's item snapshot.
import { route, requireUser, admin, jsonBody, HttpError } from "../../_lib.js";
import { orderNumber, text } from "../../_validate.js";

const ISSUE_REASONS = new Set(["damaged", "defective", "wrong_item", "not_as_described"]);
const ALL_REASONS = new Set([...ISSUE_REASONS, "changed_mind", "other"]);
const ACTIVE = ["requested", "approved", "pickup_scheduled", "in_transit", "returned", "refund_processing", "refunded"];
export async function signReturnPhotos(db, paths = []) {
  const out = [];
  for (const path of (Array.isArray(paths) ? paths : []).slice(0, 4)) {
    if (typeof path !== "string" || !path || path.length > 260) continue;
    const { data } = await db.storage.from("return-photos").createSignedUrl(path, 3600);
    if (data?.signedUrl) out.push({ path, url: data.signedUrl });
  }
  return out;
}
function deliveredAtOf(order, events) {
  if (order.delivered_at) return order.delivered_at;
  const e = (events || []).filter(x => x.new_status === "delivered" || x.event_type === "order_delivered").sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  return e?.created_at || null;
}
export default route(["GET", "POST"], async (req, res) => {
  const user = await requireUser(req, res), db = await admin();
  if (req.method === "GET") {
    let q = db.from("order_returns").select("id,order_id,order_number,item_index,item_snapshot,reason,details,photo_urls,status,decision_reason,refund_amount,refund_status,delivered_at,return_deadline,legal_issue,created_at,updated_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    const n = req.query?.number ? orderNumber(String(req.query.number)) : null;
    if (n) q = q.eq("order_number", n);
    const { data, error } = await q;
    if (error) throw error;
    const rows = await Promise.all((data || []).map(async r => ({ ...r, photos: await signReturnPhotos(db, r.photo_urls), photo_urls: undefined })));
    return res.json({ returns: rows });
  }
  const b = jsonBody(req);
  if (b.action !== "request") throw new HttpError(400, "Unknown return action.");
  const num = orderNumber(b.orderNumber), itemIndex = Number(b.itemIndex);
  if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex > 19) throw new HttpError(400, "Invalid order item.");
  const reason = String(b.reason || "");
  if (!ALL_REASONS.has(reason)) throw new HttpError(400, "Choose a valid return or issue reason.");
  const details = text(b.details, "Details", { max: 1500 });
  const paths = Array.isArray(b.photoPaths) ? b.photoPaths : [];
  if (paths.length > 4 || paths.some(p => typeof p !== "string" || !p.startsWith(`${user.id}/`) || !/^[a-f0-9-]{20,80}\.(jpg|png|webp)$/.test(p.split("/").at(-1) || ""))) throw new HttpError(400, "Invalid return photo attachment.");
  const { data: order, error: orderError } = await db.from("orders").select("id,order_number,user_id,order_status,delivered_at,updated_at,items,created_at").eq("user_id", user.id).eq("order_number", num).maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new HttpError(404, "Order not found.");
  if (order.order_status !== "delivered") throw new HttpError(409, "Return requests are available after the order is marked delivered.");
  const items = Array.isArray(order.items) ? order.items : [], item = items[itemIndex];
  if (!item) throw new HttpError(400, "This item was not found in the order.");
  const itemDbIndex = Number(item.item_index) || itemIndex + 1;
  const eligible = item.return_eligible === true;
  const legalIssue = ISSUE_REASONS.has(reason);
  if (!ALL_REASONS.has(reason)) throw new HttpError(400, "Choose a valid reason.");
  if (!eligible && !legalIssue) throw new HttpError(409, "This item is marked non-returnable. You can still report a damaged, defective, incorrect or not-as-described item.");
  const { data: statusEvents, error: eventsError } = await db.from("order_events").select("new_status,event_type,created_at").eq("order_id", order.id).order("created_at", { ascending: false }).limit(50);
  if (eventsError && eventsError.code !== "42P01") throw eventsError;
  const deliveredAt = deliveredAtOf(order, statusEvents || []);
  // A normal return requires a verifiable delivery timestamp. A protected issue report is still accepted
  // when historical delivery metadata is missing; no deadline is fabricated in that case.
  if (!deliveredAt && !legalIssue) throw new HttpError(409, "We could not verify the delivery date. Please contact the shop so the return deadline is not guessed.");
  const windowDays = Math.max(0, Math.min(90, Number(item.return_window_days) || 0));
  const deadlineMs = deliveredAt ? Date.parse(deliveredAt) + windowDays * 86400000 : 0;
  const deadline = deliveredAt && windowDays > 0 ? new Date(deadlineMs).toISOString() : null;
  if (!legalIssue && (!eligible || windowDays < 1 || Date.now() > deadlineMs)) throw new HttpError(409, "The configured return window has expired or is not enabled for this item.");
  const { data: existing, error: existingError } = await db.from("order_returns").select("id,status").eq("order_id", order.id).eq("item_index", itemDbIndex).in("status", ACTIVE).limit(1);
  if (existingError) throw existingError;
  if (existing?.length) throw new HttpError(409, "A return/issue request is already open for this item.");
  const row = { order_id: order.id, order_number: order.order_number, user_id: user.id, product_id: Number(item.product_id), item_index: itemDbIndex, item_snapshot: item, reason, details: details || null, photo_urls: paths, status: "requested", delivered_at: deliveredAt, return_deadline: deadline, legal_issue: legalIssue };
  const { data: created, error } = await db.from("order_returns").insert(row).select("id,order_id,order_number,item_index,item_snapshot,reason,details,status,refund_status,delivered_at,return_deadline,legal_issue,created_at").single();
  if (error?.code === "23505") throw new HttpError(409, "A request already exists for this item.");
  if (error) throw error;
  await db.from("order_return_events").insert({ return_id: created.id, order_id: order.id, event_type: "request_created", old_status: null, new_status: "requested", actor_user_id: user.id, note: legalIssue ? "Customer reported a product issue" : "Customer requested a return" });
  res.status(201).json({ ok: true, returnRequest: created, message: "Your request has been submitted for shop review." });
});
