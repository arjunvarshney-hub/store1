import { route, requireAdmin, admin, jsonBody, HttpError } from "../_lib.js";
import { orderNumber, text } from "../_validate.js";

const STATUSES = ["pending", "confirmed", "packed", "shipped", "delivered", "cancelled"];
const PAYMENTS = ["pending", "paid", "failed", "cancelled"];
const RPC_ERRORS = {
  NOT_FOUND: [404, "Order not found."],
  CANCELLED_LOCKED: [409, "A cancelled order cannot be re-opened (its stock was released). Ask the customer to place a new order."],
  PAYMENT_PENDING: [409, "This online order is not paid yet, so it cannot move forward."],
  INVALID_STATUS: [400, "Invalid status."],
};

export default route(["GET", "PATCH"], async (req, res) => {
  await requireAdmin(req, res);
  const db = await admin();
  if (req.method === "GET") {
    const q = req.query || {};
    let qb = db.from("orders").select("*", { count: "exact" }).order("created_at", { ascending: false });
    if (STATUSES.includes(q.status)) qb = qb.eq("order_status", q.status);
    if (PAYMENTS.includes(q.payment)) qb = qb.eq("payment_status", q.payment);
    if (["COD", "ONLINE"].includes(q.method)) qb = qb.eq("payment_method", q.method);
    const s = String(q.search || "").replace(/[^\p{L}\p{N} -]/gu, " ").trim().slice(0, 50);
    if (s) qb = qb.or(`order_number.ilike.%${s}%,customer_name.ilike.%${s}%,phone.ilike.%${s}%,email.ilike.%${s}%`);
    const page = Math.max(Number(q.page) || 1, 1), size = 50;
    const { data, error, count } = await qb.range((page - 1) * size, page * size - 1);
    if (error) throw error;
    return res.json({ orders: data || [], total: count ?? 0, page, pageSize: size });
  }
  const b = jsonBody(req);
  const num = orderNumber(b.orderNumber);
  let order;
  if (b.status !== undefined) {
    const { data, error } = await db.rpc("set_order_status", { p_order_number: num, p_status: String(b.status), p_user: null });
    if (error) {
      const k = Object.keys(RPC_ERRORS).find((x) => error.message.includes(x));
      if (k) throw new HttpError(RPC_ERRORS[k][0], RPC_ERRORS[k][1]);
      throw error;
    }
    order = data;
  }
  if (b.note !== undefined) {
    const { data, error } = await db.from("orders").update({ admin_note: text(b.note, "Note", { max: 500 }) || null, updated_at: new Date().toISOString() }).eq("order_number", num).select().single();
    if (error) throw error;
    order = data;
  }
  if (!order) throw new HttpError(400, "Nothing to update.");
  res.json({ order });
});
