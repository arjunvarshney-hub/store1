// A signed-in customer's OWN orders only (always filtered by the verified user id).
import { route, requireUser, admin, jsonBody, HttpError } from "../_lib.js";
import { orderNumber } from "../_validate.js";

const COLS = "order_number,created_at,customer_name,phone,email,address,city,state,pincode,payment_method,payment_status,order_status,items,subtotal,shipping,total";

export default route(["GET", "POST"], async (req, res) => {
  const user = await requireUser(req, res);
  const db = await admin();
  if (req.method === "GET") {
    const num = req.query?.number;
    if (num) {
      const { data, error } = await db.from("orders").select(COLS).eq("user_id", user.id).eq("order_number", orderNumber(num)).maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "Order not found.");
      return res.json({ order: data });
    }
    const { data, error } = await db.from("orders").select(COLS).eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return res.json({ orders: data || [] });
  }
  const b = jsonBody(req);
  if (b.action !== "cancel") throw new HttpError(400, "Unknown action.");
  const { data, error } = await db.rpc("set_order_status", { p_order_number: orderNumber(b.orderNumber), p_status: "cancelled", p_user: user.id });
  if (error) {
    if (/NOT_FOUND/.test(error.message)) throw new HttpError(404, "Order not found.");
    if (/NOT_ALLOWED/.test(error.message)) throw new HttpError(409, "This order can no longer be cancelled online. Please call the shop.");
    throw error;
  }
  res.json({ ok: true, order_status: data.order_status, payment_status: data.payment_status });
});
