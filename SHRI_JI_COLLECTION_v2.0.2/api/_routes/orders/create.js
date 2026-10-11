// Create an order. The server re-reads every product from the database; the browser only sends product ids,
// quantities and sizes. Prices, stock and the payable total can NOT be influenced by the client.
import { route, requireUser, admin, jsonBody, shippingRule, HttpError } from "../../_lib.js";
import * as v from "../../_validate.js";
import { preparePayment, razorpayConfigured } from "../../_razorpay.js";
import { preparePaytmPayment, paytmConfigured } from "../../_paytm.js";

const rpcMessage = (e) => String(e?.message || "");

export default route(["POST"], async (req, res) => {
  const user = await requireUser(req, res);
  const b = jsonBody(req);
  const requestedMethod = String(b.paymentMethod || "").toUpperCase();
  // Legacy "ONLINE" continues to mean Razorpay for old clients and sessions.
  const provider = requestedMethod === "COD" ? "COD"
    : requestedMethod === "PAYTM" ? "PAYTM"
    : requestedMethod === "RAZORPAY" || requestedMethod === "ONLINE" ? "RAZORPAY" : null;
  const method = provider === "COD" ? "COD" : "ONLINE";
  if (!provider) throw new HttpError(400, "Please choose a payment method.");
  if (provider === "RAZORPAY" && !razorpayConfigured()) throw new HttpError(503, "Razorpay is not configured right now. Please choose Paytm, if available, or Cash on Delivery.");
  if (provider === "PAYTM" && !paytmConfigured()) throw new HttpError(503, "Paytm is not configured right now. Please choose Razorpay or Cash on Delivery.");
  const cust = v.customer(b.customer);
  const items = v.orderItems(b.items);
  const key = v.idempotencyKey(b.idempotencyKey);

  const db = await admin();
  const ship = shippingRule();
  const { data, error } = await db.rpc("create_order", {
    p_user: user.id, p_customer: cust, p_items: items, p_method: method, p_key: key,
    p_shipping_under_499: ship.under499, p_shipping_499_999: ship.from499, p_free_above: ship.freeAbove,
  });
  let result = data;
  if (error) {
    const m = rpcMessage(error);
    if (error.code === "23505" && key) {            // double-tap race: same key already inserted
      const { data: ex } = await db.from("orders").select("*").eq("user_id", user.id).eq("idempotency_key", key).maybeSingle();
      if (ex) result = { existing: true, order: ex };
    }
    if (!result) {
      if (m.includes("OUT_OF_STOCK:")) throw new HttpError(409, `Sorry, "${m.split("OUT_OF_STOCK:")[1]}" does not have enough stock. Please reduce the quantity in your cart.`);
      if (m.includes("SIZE_REQUIRED:")) throw new HttpError(400, `Please choose a size for "${m.split("SIZE_REQUIRED:")[1]}".`);
      if (m.includes("UNAVAILABLE")) throw new HttpError(409, "One of the products in your cart is no longer available. Please review your cart.");
      if (m.includes("INVALID_ITEMS")) throw new HttpError(400, "Your cart has an invalid item.");
      throw error;
    }
  }
  const order = result.order;
  if (method === "COD" && order?.id) {
    // Metadata-only best effort. Legacy schema deployments still keep COD functional until migration is applied.
    const { error: providerError } = await db.from("orders").update({ payment_provider: "COD" }).eq("id", order.id);
    if (providerError && !/payment_provider|column/i.test(String(providerError.message || ""))) throw providerError;
  }
  const out = { orderNumber: order.order_number, total: Number(order.total), paymentMethod: order.payment_method, existing: !!result.existing };
  if (order.payment_method === "ONLINE" && order.payment_status !== "paid") {
    try {
      if (provider === "PAYTM" && result.existing) {
        out.paymentError = "This order already exists. Open My Orders to check its payment status before retrying.";
      } else if (provider === "PAYTM") {
        out.paytm = await preparePaytmPayment(order, user, req);
      } else {
        // Provider is internal metadata; payment_method stays ONLINE for backwards compatibility.
        await db.from("orders").update({ payment_provider: "RAZORPAY" }).eq("id", order.id).neq("payment_status", "paid");
        out.razorpay = await preparePayment(order);
      }
    } catch (e) { out.paymentError = e instanceof HttpError ? e.message : "Could not start the payment."; }
    // The order is saved if gateway startup fails; customer can safely retry from My Orders.
  }
  res.status(201).json(out);
});
