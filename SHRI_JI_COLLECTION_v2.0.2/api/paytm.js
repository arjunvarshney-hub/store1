// Paytm payment dispatcher. Kept as ONE top-level Vercel function to stay within
// the existing Vercel Hobby serverless-function limit. Routes are selected via ?action=.
import { admin, HttpError, jsonBody, readRaw, requireUser, route, sameOrigin } from "./_lib.js";
import { orderNumber } from "./_validate.js";
import {
  notificationOrderId, paytmPublicConfig, paytmConfigured, paytmStatusFromOrder,
  reconcilePaytmStatus, recordPaytmEvent, verifyPaytmNotification,
} from "./_paytm.js";

export const config = { api: { bodyParser: false } };

const noStore = (res) => res.setHeader("Cache-Control", "no-store");
const publicConfig = route(["GET"], async (_req, res) => res.json(paytmPublicConfig()));

const verifyForCustomer = route(["POST"], async (req, res) => {
  const user = await requireUser(req, res);
  const b = jsonBody(req);
  const number = orderNumber(b.orderNumber);
  const db = await admin();
  const { data: order, error } = await db.from("orders").select("*").eq("order_number", number).eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  if (!order) throw new HttpError(404, "Order not found.");
  if (order.payment_status === "paid") return res.json({ status: "paid", orderNumber: order.order_number, paymentProvider: order.payment_provider || "RAZORPAY" });
  if (order.payment_method !== "ONLINE") throw new HttpError(409, "This order does not have an online payment.");
  const { data: attempt, error: e } = await db.from("payment_attempts").select("gateway_order_id")
    .eq("payment_provider", "PAYTM").eq("order_id", order.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (e) throw e;
  if (!attempt?.gateway_order_id) return res.json({ status: paytmStatusFromOrder(order), orderNumber: order.order_number });
  const reconciled = await reconcilePaytmStatus(attempt.gateway_order_id);
  const latest = await db.from("orders").select("payment_status,payment_provider,order_number").eq("id", order.id).maybeSingle();
  const status = latest.data?.payment_status === "paid" ? "paid" : reconciled.status;
  res.json({ status, orderNumber: order.order_number, paymentProvider: latest.data?.payment_provider || "PAYTM" });
});

async function readIncomingBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = req.body != null ? (Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body))) : await readRaw(req, 256 * 1024);
  const text = raw.toString("utf8");
  const contentType = String(req.headers["content-type"] || "").toLowerCase();
  if (contentType.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(text));
  try { return JSON.parse(text); } catch { return Object.fromEntries(new URLSearchParams(text)); }
}

async function processNotification(req, res, type) {
  noStore(res);
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  if (!paytmConfigured()) return res.status(503).json({ error: "Paytm callback is not configured." });
  try {
    const fields = await readIncomingBody(req);
    if (!verifyPaytmNotification(fields)) return res.status(400).json({ error: "Invalid Paytm checksum." });
    const gatewayOrderId = notificationOrderId(fields, req.query || {});
    const body = fields?.body && typeof fields.body === "object" ? fields.body : fields;
    if (!gatewayOrderId || String(body.MID || body.mid || "") !== String(process.env.PAYTM_MID)) {
      return res.status(400).json({ error: "Paytm merchant/order details are invalid." });
    }
    // Check known attempt before spending a status-API call; callback payload alone never marks paid.
    const db = await admin();
    const { data: attempt, error } = await db.from("payment_attempts").select("gateway_order_id")
      .eq("payment_provider", "PAYTM").eq("gateway_order_id", gatewayOrderId).maybeSingle();
    if (error) throw error;
    if (!attempt) return res.status(404).json({ error: "Paytm payment attempt not found." });

    const result = await reconcilePaytmStatus(gatewayOrderId);
    const transactionId = String(body.TXNID || body.txnId || body.TRANSACTIONID || "none");
    const eventId = `paytm:${gatewayOrderId}:${transactionId}:${String(body.STATUS || body.txnStatus || body.resultInfo?.resultStatus || result.status)}`;
    await recordPaytmEvent(eventId, type);
    return res.json({ ok: true, status: result.status });
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error(`[paytm-${type}]`, e?.message || e);
    return res.status(500).json({ error: "Paytm notification processing failed." });
  }
}

async function handler(req, res) {
  noStore(res);
  const action = String(req.query?.action || new URL(req.url || "/api/paytm", "http://localhost").searchParams.get("action") || "");
  if (action === "config") return publicConfig(req, res);
  if (action === "verify") {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
    if (!sameOrigin(req)) return res.status(403).json({ error: "Blocked cross-site request." });
    return verifyForCustomer(req, res);
  }
  if (action === "callback") return processNotification(req, res, "callback");
  if (action === "webhook") return processNotification(req, res, "webhook");
  return res.status(404).json({ error: "Not found" });
}

export default async function paytmDispatcher(req, res) {
  try {
    if (req.method === "POST" && !req.body) req.body = await readIncomingBody(req);
    return await handler(req, res);
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error("[paytm-dispatcher]", e?.message || e);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
