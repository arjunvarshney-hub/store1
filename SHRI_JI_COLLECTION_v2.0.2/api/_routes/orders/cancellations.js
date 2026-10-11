// Customer cancellation requests for orders that are beyond immediate self-cancellation.
import { route, requireUser, admin, jsonBody, HttpError } from "../../_lib.js";
import { orderNumber, text } from "../../_validate.js";
import { enqueueAdminNotification, processNotificationOutbox } from "../../_notifications.js";

export default route(["POST"], async (req, res) => {
  const user = await requireUser(req, res);
  const b = jsonBody(req);
  const number = orderNumber(b.orderNumber);
  const reason = text(b.reason, "Cancellation reason", { max: 1000 }) || "Customer requested cancellation";
  const db = await admin();
  const { data: order, error } = await db.from("orders").select("*").eq("user_id", user.id).eq("order_number", number).maybeSingle();
  if (error) throw error;
  if (!order) throw new HttpError(404, "Order not found.");
  if (!["confirmed", "processing", "packed"].includes(order.order_status)) {
    throw new HttpError(409, "A cancellation request is available only before shipping. If the order has shipped, contact the shop for help.");
  }
  const { data: prior, error: priorError } = await db.from("order_cancellation_requests").select("id,status,reason,created_at").eq("order_id", order.id).eq("status", "requested").maybeSingle();
  if (priorError && priorError.code !== "42P01") throw priorError;
  if (prior) return res.json({ request: prior, existing: true, message: "Your cancellation request is already waiting for review." });
  const { data: request, error: insertError } = await db.from("order_cancellation_requests").insert({
    order_id: order.id, order_number: order.order_number, user_id: user.id, reason,
    order_snapshot: { order_number: order.order_number, customer_name: order.customer_name, phone: order.phone, email: order.email, address: order.address, city: order.city, state: order.state, pincode: order.pincode, items: order.items, subtotal: order.subtotal, shipping: order.shipping, total: order.total, payment_method: order.payment_method, payment_status: order.payment_status, order_status: order.order_status },
    status: "requested"
  }).select("id,status,reason,created_at").single();
  if (insertError) {
    if (insertError.code === "23505") throw new HttpError(409, "A cancellation request already exists. Refresh the order page.");
    throw insertError;
  }
  try {
    await db.from("order_events").insert({ order_id: order.id, order_number: order.order_number, event_type: "cancellation_requested", old_status: order.order_status, new_status: order.order_status, actor_user_id: user.id, note: reason });
    await enqueueAdminNotification(db, order, "cancel_requested", { reason, dedupeSuffix: request.id });
    await processNotificationOutbox(db, { limit: 2 });
  } catch (e) { console.error("[cancellation-request] notification queue failed", String(e?.message || "error").slice(0,120)); }
  res.status(201).json({ request, message: "Cancellation request sent to the shop. Your order is not cancelled until the request is confirmed." });
});
