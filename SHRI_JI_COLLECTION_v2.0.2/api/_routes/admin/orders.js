import { route, requireAdmin, admin, jsonBody, HttpError } from "../../_lib.js";
import { orderNumber, text } from "../../_validate.js";
import { enqueueAdminNotification, processNotificationOutbox } from "../../_notifications.js";

const STATUSES = ["pending", "confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"];
const PAYMENTS = ["pending", "paid", "failed", "cancelled", "refunded"];
const RPC_ERRORS = {
  NOT_FOUND: [404, "Order not found."],
  CANCELLED_LOCKED: [409, "A cancelled order cannot be re-opened (its stock was released). Ask the customer to place a new order."],
  PAYMENT_PENDING: [409, "This online order is not paid yet, so it cannot move forward."],
  INVALID_STATUS: [400, "Invalid status."],
  INVALID_TRANSITION: [409, "That order status transition is not allowed. Move the order through the required stages."],
  CANCEL_NOT_ALLOWED: [409, "Orders already shipped or delivered cannot be cancelled here. Contact the customer and courier to arrange a return or resolution."],
  REFUND_REQUIRED: [409, "This online payment has already been captured. Process and confirm the gateway refund first; the order has not been cancelled."],
};

export default route(["GET", "PATCH"], async (req, res) => {
  const adminUser = await requireAdmin(req, res);
  const db = await admin();
  if (req.method === "GET") {
    const q = req.query || {};
    let qb = db.from("orders").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (STATUSES.includes(q.status)) qb = qb.eq("order_status", q.status);
    if (PAYMENTS.includes(q.payment)) qb = qb.eq("payment_status", q.payment);
    if (["COD", "ONLINE"].includes(q.method)) qb = qb.eq("payment_method", q.method);
    if (q.delivery === "in_transit") qb = qb.in("order_status", ["shipped", "out_for_delivery"]);
    if (q.delivery === "delivered") qb = qb.eq("order_status", "delivered");
    if (q.delivery === "not_shipped") qb = qb.in("order_status", ["pending", "confirmed", "processing", "packed"]);
    if (q.from && /^\d{4}-\d{2}-\d{2}$/.test(String(q.from))) qb = qb.gte("created_at", `${q.from}T00:00:00.000+05:30`);
    if (q.to && /^\d{4}-\d{2}-\d{2}$/.test(String(q.to))) qb = qb.lte("created_at", `${q.to}T23:59:59.999+05:30`);
    if (q.minTotal !== undefined && q.minTotal !== "" && Number.isFinite(Number(q.minTotal)) && Number(q.minTotal) >= 0) qb = qb.gte("total", Number(q.minTotal));
    if (q.maxTotal !== undefined && q.maxTotal !== "" && Number.isFinite(Number(q.maxTotal)) && Number(q.maxTotal) >= 0) qb = qb.lte("total", Number(q.maxTotal));
    const s = String(q.search || "").replace(/[^\p{L}\p{N} -]/gu, " ").trim().slice(0, 50);
    if (s) qb = qb.or(`order_number.ilike.%${s}%,customer_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
    const page = Math.max(Number(q.page) || 1, 1), size = 50;
    const orderBy = ["total_asc", "total_desc"].includes(q.sort) ? "total" : "created_at";
    const ascending = q.sort === "oldest" || q.sort === "total_asc";
    const { data, error, count } = await qb.order(orderBy, { ascending }).range((page - 1) * size, page * size - 1);
    if (error) throw error;
    return res.json({ orders: data || [], total: count ?? 0, page, pageSize: size });
  }
  const b = jsonBody(req);
  const num = orderNumber(b.orderNumber);
  let order;
  if (b.status !== undefined) {
    if (String(b.status) === "cancelled") {
      const { data: current, error: currentError } = await db.from("orders").select("*").eq("order_number", num).maybeSingle();
      if (currentError) throw currentError;
      if (!current) throw new HttpError(404, "Order not found.");
      if (["shipped", "out_for_delivery", "delivered"].includes(current.order_status)) throw new HttpError(409, "An order that has shipped or been delivered cannot be cancelled here; use the return/support process.");
      if (current.payment_method === "ONLINE" && current.payment_status === "paid") {
        const refundReference = text(b.refund_reference, "Gateway refund reference", { min: 4, max: 120, required: true });
        const { data: refunded, error: refundError } = await db.from("orders").update({ payment_status: "refunded", admin_note: `${String(current.admin_note || "").trim()}${current.admin_note ? " | " : ""}Gateway refund manually confirmed: ${refundReference}`, updated_at: new Date().toISOString() }).eq("id", current.id).eq("payment_status", "paid").select("id").maybeSingle();
        if (refundError) throw refundError;
        if (!refunded) throw new HttpError(409, "Payment status changed while recording the refund. Refresh the order and retry.");
        const { error: eventError } = await db.from("order_events").insert({ order_id: current.id, order_number: current.order_number, event_type: "gateway_refund_manually_confirmed", old_status: current.order_status, new_status: current.order_status, actor_user_id: adminUser.id, note: `Refund reference: ${refundReference}` });
        if (eventError) throw eventError;
      }
    }
    const { data, error } = await db.rpc("set_order_status", { p_order_number: num, p_status: String(b.status), p_user: null });
    if (error) {
      const k = Object.keys(RPC_ERRORS).find((x) => error.message.includes(x));
      if (k) throw new HttpError(RPC_ERRORS[k][0], RPC_ERRORS[k][1]);
      throw error;
    }
    order = data;
    if (data.order_status === "cancelled") {
      try {
        const { data: withItems } = await db.from("orders").select("*").eq("order_number", num).maybeSingle();
        if (withItems) { await enqueueAdminNotification(db, withItems, "order_cancelled"); await processNotificationOutbox(db, { limit: 2 }); }
      } catch (e) { console.error("[order-notification] queue failed", String(e?.message || "error").slice(0,120)); }
    }
  }
  if (b.tracking_number !== undefined || b.tracking_url !== undefined) {
    const patch = { updated_at: new Date().toISOString() };
    if (b.tracking_number !== undefined) patch.tracking_number = text(b.tracking_number, "Tracking number", { max: 120 }) || null;
    if (b.tracking_url !== undefined) {
      const raw = text(b.tracking_url, "Tracking URL", { max: 500 });
      if (raw) { let u; try { u = new URL(raw); } catch { throw new HttpError(400, "Enter a valid HTTPS tracking URL."); } if (u.protocol !== "https:" || u.username || u.password) throw new HttpError(400, "Tracking links must use HTTPS and cannot include credentials."); }
      patch.tracking_url = raw || null;
    }
    const { data, error } = await db.from("orders").update(patch).eq("order_number", num).select().single();
    if (error) throw error; order = data;
  }
  if (b.note !== undefined) {
    const { data, error } = await db.from("orders").update({ admin_note: text(b.note, "Note", { max: 500 }) || null, updated_at: new Date().toISOString() }).eq("order_number", num).select().single();
    if (error) throw error;
    order = data;
  }
  if (!order) throw new HttpError(400, "Nothing to update.");
  res.json({ order });
});
