// Paytm JS Checkout server integration using Paytm's documented Initiate Transaction
// and Transaction Status APIs. Only PAYTM_MID, PAYTM_MERCHANT_KEY, and environment
// configuration are server-side; the browser receives only MID, short-lived txnToken,
// amount, and the environment host needed by Paytm's CheckoutJS.
import crypto from "node:crypto";
import { admin, HttpError, siteUrl } from "./_lib.js";
import { generatePaytmSignature, verifyPaytmSignature } from "./_paytm-checksum.js";

const ENV = () => String(process.env.PAYTM_ENVIRONMENT || "staging").trim().toLowerCase();
export const paytmHost = () => ENV() === "production" ? "https://secure.paytmpayments.com" : "https://securestage.paytmpayments.com";
export const paytmConfigured = () => Boolean(
  process.env.PAYTM_MID && process.env.PAYTM_MERCHANT_KEY &&
  ["staging", "production"].includes(ENV()) && Buffer.byteLength(process.env.PAYTM_MERCHANT_KEY || "", "utf8") === 16
);

function paytmConfigError() {
  if (!process.env.PAYTM_MID) return "PAYTM_MID";
  if (!process.env.PAYTM_MERCHANT_KEY) return "PAYTM_MERCHANT_KEY";
  if (Buffer.byteLength(process.env.PAYTM_MERCHANT_KEY || "", "utf8") !== 16) return "PAYTM_MERCHANT_KEY (must be 16 bytes)";
  if (!["staging", "production"].includes(ENV())) return "PAYTM_ENVIRONMENT (staging or production)";
  return null;
}

export const paytmPublicConfig = () => ({ enabled: paytmConfigured() });
const paise = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};
const amountString = (v) => (Number(v) / 1).toFixed(2);
const normalStatus = (s) => {
  const v = String(s || "").toUpperCase();
  if (v === "TXN_SUCCESS" || v === "SUCCESS") return "TXN_SUCCESS";
  if (v === "TXN_FAILURE" || v === "FAILURE" || v === "FAILED") return "TXN_FAILURE";
  return "PENDING";
};
const rand = () => crypto.randomBytes(6).toString("hex").toUpperCase();

async function postPaytm(path, body) {
  const missing = paytmConfigError();
  if (missing) throw new HttpError(503, `Paytm payments are not configured (${missing}). Please choose Razorpay or Cash on Delivery.`);
  // Sign exactly the serialized body bytes used in the outgoing request, per Paytm docs.
  const bodyJson = JSON.stringify(body);
  const signature = await generatePaytmSignature(bodyJson, process.env.PAYTM_MERCHANT_KEY);
  const requestJson = `{"body":${bodyJson},"head":{"signature":${JSON.stringify(signature)}}}`;
  let response;
  try {
    response = await fetch(`${paytmHost()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: requestJson,
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new HttpError(502, "Could not reach Paytm. Your order is saved; check My Orders before retrying.");
  }
  let data;
  try { data = await response.json(); } catch { throw new HttpError(502, "Paytm returned an unreadable response."); }
  if (!response.ok || !data?.body || !data?.head?.signature) {
    console.error("Paytm API returned an error status", response.status);
    throw new HttpError(502, "Paytm could not process the request. Please try again from My Orders.");
  }
  if (!verifyPaytmSignature(JSON.stringify(data.body), process.env.PAYTM_MERCHANT_KEY, data.head.signature)) {
    throw new HttpError(502, "Paytm response authentication failed. Do not retry payment immediately; check My Orders first.");
  }
  return data;
}

async function markAttemptInitFailure(gatewayOrderId) {
  try {
    const db = await admin();
    await db.from("payment_attempts").update({ status: "failed", result_code: "INIT_FAILED", updated_at: new Date().toISOString() })
      .eq("payment_provider", "PAYTM").eq("gateway_order_id", gatewayOrderId).eq("status", "initiating");
  } catch (e) {
    console.error("Could not update Paytm attempt status", e?.message || e);
  }
}

/** Creates an auditable unique Paytm attempt for an existing online order, then requests txnToken. */
export async function preparePaytmPayment(order, user, req) {
  const missing = paytmConfigError();
  if (missing) throw new HttpError(503, `Paytm payments are not configured (${missing}). Please choose Razorpay or Cash on Delivery.`);
  if (!order || order.payment_method !== "ONLINE" || order.order_status !== "pending" || order.payment_status === "paid") {
    throw new HttpError(409, "This order is not eligible for Paytm payment.");
  }
  const gatewayOrderId = `SJC${String(order.id).padStart(8, "0")}${Date.now().toString(36).toUpperCase()}${rand()}`.slice(0, 50);
  const amount = Number(order.total);
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, "Order total is invalid.");

  const db = await admin();
  const { error: beginError } = await db.rpc("begin_paytm_attempt", {
    p_order_id: order.id, p_user: user.id, p_gateway_order_id: gatewayOrderId, p_amount: amount,
  });
  if (beginError) {
    if (/NOT_FOUND/.test(beginError.message || "")) throw new HttpError(404, "Order not found.");
    if (/PAYMENT_COMPLETE/.test(beginError.message || "")) throw new HttpError(409, "This order has already been paid.");
    if (/AMOUNT_MISMATCH/.test(beginError.message || "")) throw new HttpError(409, "Order total changed. Refresh My Orders and try again.");
    if (/ORDER_NOT_PAYABLE/.test(beginError.message || "")) throw new HttpError(409, "This order is no longer payable.");
    throw beginError;
  }

  const customerName = String(order.customer_name || "Customer").trim().split(/\s+/);
  const body = {
    requestType: "Payment",
    mid: process.env.PAYTM_MID,
    websiteName: String(process.env.PAYTM_WEBSITE_NAME || (ENV() === "production" ? "DEFAULT" : "WEBSTAGING")),
    orderId: gatewayOrderId,
    txnAmount: { value: amountString(amount), currency: "INR" },
    userInfo: {
      custId: String(user.id),
      mobile: String(order.phone || "").replace(/\D/g, "").slice(-10),
      ...(order.email ? { email: String(order.email).slice(0, 120) } : {}),
      firstName: customerName[0].slice(0, 50),
    },
    callbackUrl: `${siteUrl(req)}/api/paytm?action=callback`,
  };
  let response;
  try {
    response = await postPaytm(`/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(process.env.PAYTM_MID)}&orderId=${encodeURIComponent(gatewayOrderId)}`, body);
  } catch (e) {
    await markAttemptInitFailure(gatewayOrderId);
    throw e;
  }
  const result = response.body?.resultInfo;
  if (result?.resultStatus !== "S" || !response.body?.txnToken) {
    await markAttemptInitFailure(gatewayOrderId);
    console.error("Paytm transaction initialization returned non-success", String(result?.resultCode || "unknown"));
    throw new HttpError(502, "Paytm could not start checkout. Your order is saved; try again from My Orders.");
  }
  await db.from("payment_attempts").update({ status: "pending", updated_at: new Date().toISOString(), result_code: String(result?.resultCode || "0000") })
    .eq("payment_provider", "PAYTM").eq("gateway_order_id", gatewayOrderId).eq("status", "initiating");

  return {
    mid: process.env.PAYTM_MID,
    host: paytmHost(),
    orderId: gatewayOrderId,
    txnToken: response.body.txnToken,
    amount: amountString(amount),
    currency: "INR",
  };
}

export async function queryPaytmStatus(gatewayOrderId) {
  const response = await postPaytm("/v3/order/status", { mid: process.env.PAYTM_MID, orderId: gatewayOrderId });
  const b = response.body;
  if (String(b.mid || "") !== String(process.env.PAYTM_MID) || String(b.orderId || "") !== String(gatewayOrderId)) {
    throw new HttpError(502, "Paytm transaction details did not match this order.");
  }
  return {
    gatewayOrderId,
    mid: String(b.mid || ""),
    amount: b.txnAmount == null ? null : String(b.txnAmount),
    transactionId: b.txnId == null ? null : String(b.txnId),
    status: normalStatus(b.resultInfo?.resultStatus),
    resultCode: String(b.resultInfo?.resultCode || ""),
  };
}

/** Verify amount/status with Paytm's server before asking the database to update the order. */
export async function reconcilePaytmStatus(gatewayOrderId) {
  const db = await admin();
  const { data: attempt, error: attemptError } = await db.from("payment_attempts").select("*")
    .eq("payment_provider", "PAYTM").eq("gateway_order_id", gatewayOrderId).maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt) throw new HttpError(404, "Paytm payment attempt not found.");

  const status = await queryPaytmStatus(gatewayOrderId);
  const hasAmount = status.amount != null && String(status.amount).trim() !== "";
  if (hasAmount && paise(status.amount) !== paise(attempt.amount)) throw new HttpError(409, "Paytm payment amount does not match the saved order.");
  // A successful payment must always carry an exact gateway-reported amount.
  if (status.status === "TXN_SUCCESS" && !hasAmount) throw new HttpError(502, "Paytm reported success without a transaction amount.");
  if (status.status === "TXN_SUCCESS" && !status.transactionId) throw new HttpError(502, "Paytm reported success without a transaction ID.");

  const { data, error } = await db.rpc("reconcile_paytm_payment", {
    p_gateway_order_id: gatewayOrderId,
    p_transaction_id: status.transactionId,
    // For pending/failure responses with no amount, the saved amount is only used so the
    // database can record a non-success status; such a response can never mark the order paid.
    p_amount: hasAmount ? status.amount : attempt.amount,
    p_txn_status: status.status,
    p_result_code: status.resultCode,
  });
  if (error) {
    if (/AMOUNT_MISMATCH/.test(error.message || "")) throw new HttpError(409, "Paytm payment amount does not match the saved order.");
    if (/NOT_FOUND/.test(error.message || "")) throw new HttpError(404, "Paytm payment attempt not found.");
    throw error;
  }
  return { status: data?.payment_status === "paid" ? "paid" : status.status === "TXN_SUCCESS" ? "duplicate_paid" : status.status === "TXN_FAILURE" ? "failed" : "pending", order: data };
}

export function verifyPaytmNotification(fields) {
  if (!paytmConfigured() || !fields || typeof fields !== "object") return false;
  const body = fields.body && typeof fields.body === "object" ? fields.body : fields;
  const signature = fields.head?.signature || fields.CHECKSUMHASH || fields.checksumHash;
  const data = fields.body && typeof fields.body === "object"
    ? JSON.stringify(fields.body)
    : { ...body };
  if (data && typeof data === "object") {
    delete data.CHECKSUMHASH;
    delete data.checksumHash;
  }
  return verifyPaytmSignature(data, process.env.PAYTM_MERCHANT_KEY, signature);
}

export function notificationOrderId(fields, query = {}) {
  const b = fields?.body && typeof fields.body === "object" ? fields.body : fields || {};
  return String(b.ORDERID || b.orderId || b.orderID || query.ORDER_ID || query.orderId || "").trim();
}

export async function recordPaytmEvent(eventId, event) {
  if (!eventId) return;
  try {
    const db = await admin();
    await db.from("payment_events").upsert({ event_id: eventId.slice(0, 250), event: `paytm:${String(event || "status").slice(0, 80)}` }, { onConflict: "event_id", ignoreDuplicates: true });
  } catch (e) {
    // Payment status was reconciled through an idempotent DB function; event-log failures are retriable.
    console.error("Paytm event log write failed", e?.message || e);
  }
}

export function paytmStatusFromOrder(order) {
  if (order?.payment_status === "paid") return "paid";
  if (order?.payment_status === "failed" || order?.payment_status === "cancelled") return "failed";
  return "pending";
}
