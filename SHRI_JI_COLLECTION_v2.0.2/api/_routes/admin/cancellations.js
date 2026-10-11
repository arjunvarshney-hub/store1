// Admin review of customer cancellation requests.
import { route, requireAdmin, admin, jsonBody, HttpError } from "../../_lib.js";
import { enqueueAdminNotification, processNotificationOutbox } from "../../_notifications.js";
import { text } from "../../_validate.js";

export default route(["GET", "PATCH"], async (req, res) => {
  const adminUser = await requireAdmin(req, res);
  const db = await admin();
  if (req.method === "GET") {
    const q = req.query || {};
    let qb = db.from("order_cancellation_requests").select("*").order("created_at", { ascending: false }).limit(200);
    if (["requested", "approved", "rejected"].includes(String(q.status || ""))) qb = qb.eq("status", String(q.status));
    const search = String(q.search || "").replace(/[^\p{L}\p{N} -]/gu, " ").trim().slice(0, 50);
    if (search) qb = qb.or(`order_number.ilike.%${search}%,reason.ilike.%${search}%`);
    const { data, error } = await qb;
    if (error) throw error;
    return res.json({ requests: data || [] });
  }
  const b = jsonBody(req), id = Number(b.id), status = String(b.status || "");
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Invalid cancellation request.");
  if (!["approved", "rejected"].includes(status)) throw new HttpError(400, "Choose approve or reject.");
  const { data: request, error: e0 } = await db.from("order_cancellation_requests").select("*").eq("id", id).maybeSingle();
  if (e0) throw e0;
  if (!request) throw new HttpError(404, "Cancellation request not found.");
  if (request.status !== "requested") throw new HttpError(409, "This request has already been reviewed.");
  const decision_reason = text(b.decision_reason, "Decision reason", { max: 1000 }) || (status === "approved" ? "Cancellation approved by shop" : "Cancellation request rejected by shop");
  let cancelledOrder = null;
  let refundReference = null;
  if (status === "approved") {
    const { data: current, error: eo } = await db.from("orders").select("*").eq("id", request.order_id).maybeSingle();
    if (eo) throw eo;
    if (!current) throw new HttpError(404, "Linked order not found.");
    if (["shipped", "out_for_delivery", "delivered"].includes(current.order_status)) throw new HttpError(409, "This order has shipped or been delivered. Handle it through the return/support process.");
    if (current.payment_method === "ONLINE" && current.payment_status === "paid") {
      refundReference = text(b.refund_reference, "Gateway refund reference", { min: 4, max: 120, required: true });
      const { data: refunded, error: refundError } = await db.from("orders").update({ payment_status: "refunded", admin_note: `${String(current.admin_note || "").trim()}${current.admin_note ? " | " : ""}Gateway refund manually confirmed: ${refundReference}`, updated_at: new Date().toISOString() }).eq("id", current.id).eq("payment_status", "paid").select("id").maybeSingle();
      if (refundError) throw refundError;
      if (!refunded) throw new HttpError(409, "Payment status changed while recording the refund. Refresh and retry.");
      const { error: eventError } = await db.from("order_events").insert({ order_id: current.id, order_number: current.order_number, event_type: "gateway_refund_manually_confirmed", old_status: current.order_status, new_status: current.order_status, actor_user_id: adminUser.id, note: `Refund reference: ${refundReference}` });
      if (eventError) throw eventError;
    }
    const { data: updated, error } = await db.rpc("set_order_status", { p_order_number: current.order_number, p_status: "cancelled", p_user: null });
    if (error) {
      if (error.message.includes("REFUND_REQUIRED")) throw new HttpError(409, "This online payment has already been captured. Process the gateway refund first; this request remains pending and the order has not been cancelled.");
      if (error.message.includes("CANCEL_NOT_ALLOWED")) throw new HttpError(409, "This order has already shipped or been delivered. Do not mark it cancelled; handle it through the return/support process.");
      if (error.message.includes("CANCELLED_LOCKED")) throw new HttpError(409, "This order is already cancelled.");
      throw error;
    }
    cancelledOrder = updated;
  }
  const { data: saved, error: saveError } = await db.from("order_cancellation_requests").update({ status, decision_reason, decided_at: new Date().toISOString(), decided_by: adminUser.id, refund_reference: refundReference, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "requested").select("*").maybeSingle();
  if (saveError) throw saveError;
  if (!saved) throw new HttpError(409, "This request changed in another session. Refresh and try again.");
  try {
    if (status === "approved" && cancelledOrder) {
      const { data: fullOrder } = await db.from("orders").select("*").eq("id", request.order_id).maybeSingle();
      if (fullOrder) { await enqueueAdminNotification(db, fullOrder, "order_cancelled", { reason: request.reason, dedupeSuffix: request.id }); await processNotificationOutbox(db, { limit: 2 }); }
    }
  } catch (e) { console.error("[cancellation-request] completion email queue failed", String(e?.message || "error").slice(0,120)); }
  res.json({ request: saved, order: cancelledOrder });
});
