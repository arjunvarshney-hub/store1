// Browser reports "payment done" -> we verify Razorpay's signature server-side before marking anything paid.
import { route, requireUser, admin, jsonBody, HttpError } from "../../_lib.js";
import { verifyCheckoutSignature, fetchRazorpayPayment } from "../../_razorpay.js";

export default route(["POST"], async (req, res) => {
  const user = await requireUser(req, res);
  const b = jsonBody(req);
  const orderId = String(b.razorpay_order_id || ""), paymentId = String(b.razorpay_payment_id || ""), sig = String(b.razorpay_signature || "");
  if (!/^order_\w{6,40}$/.test(orderId) || !/^pay_\w{6,40}$/.test(paymentId)) throw new HttpError(400, "Invalid payment details.");
  if (!verifyCheckoutSignature(orderId, paymentId, sig, process.env.RAZORPAY_KEY_SECRET)) throw new HttpError(400, "Payment could not be verified.");
  const db = await admin();
  // Ownership check: the Razorpay order must belong to the logged-in customer.
  const { data: o, error: orderError } = await db.from("orders").select("id,order_number,user_id,total,payment_status").eq("razorpay_order_id", orderId).maybeSingle();
  if (orderError) throw orderError;
  if (!o || o.user_id !== user.id) throw new HttpError(404, "Order not found.");
  const payment = await fetchRazorpayPayment(paymentId);
  const expectedPaise = Math.round(Number(o.total) * 100);
  if (payment.order_id !== orderId || payment.currency !== "INR" || Number(payment.amount) !== expectedPaise) {
    throw new HttpError(409, "Razorpay payment amount or order does not match. Do not pay again; contact the shop if money was deducted.");
  }
  if (payment.status !== "captured" || payment.captured === false) {
    // Authorized/pending is not a settled payment. The captured webhook or a later retry can reconcile it.
    throw new HttpError(409, "Razorpay has not confirmed a captured payment yet. Do not pay again; check My Orders shortly.");
  }
  const { data, error } = await db.rpc("mark_order_paid", { p_razorpay_order_id: orderId, p_payment_id: paymentId, p_amount_paise: Number(payment.amount) }); // amount validated from Razorpay API

  if (error) throw error;
  res.json({ ok: true, orderNumber: data.order_number, payment_status: data.payment_status });
});
