// (Re)start payment for one of the customer's own unpaid online orders.
import { route, requireUser, admin, jsonBody, HttpError } from "../../_lib.js";
import { orderNumber } from "../../_validate.js";
import { preparePayment, razorpayConfigured } from "../../_razorpay.js";
import { preparePaytmPayment, paytmConfigured } from "../../_paytm.js";

export default route(["POST"], async (req, res) => {
  const user = await requireUser(req, res);
  const body = jsonBody(req);
  const num = orderNumber(body.orderNumber);
  const requested = String(body.paymentProvider || "").toUpperCase();
  const db = await admin();
  const { data: o, error } = await db.from("orders").select("*").eq("order_number", num).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!o) throw new HttpError(404, "Order not found.");
  if (o.payment_method !== "ONLINE" || !["pending", "failed"].includes(o.payment_status) || o.order_status !== "pending")
    throw new HttpError(409, "This order does not need a payment.");
  const provider = requested || String(o.payment_provider || "RAZORPAY").toUpperCase();
  if (provider === "PAYTM") {
    if (!paytmConfigured()) throw new HttpError(503, "Paytm is not configured right now. Please contact the shop or choose Razorpay if available.");
    res.json({ orderNumber: o.order_number, paytm: await preparePaytmPayment(o, user, req) });
    return;
  }
  if (provider !== "RAZORPAY") throw new HttpError(400, "Unsupported payment provider.");
  if (!razorpayConfigured()) throw new HttpError(503, "Razorpay is not configured right now.");
  const { error: updateError } = await db.from("orders").update({ payment_provider: "RAZORPAY" }).eq("id", o.id).neq("payment_status", "paid");
  if (updateError) throw updateError;
  res.json({ orderNumber: o.order_number, razorpay: await preparePayment(o) });
});
