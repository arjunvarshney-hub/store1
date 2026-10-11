import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mockReq, mockRes, fake, cookieFor } from "./helpers.mjs";
import { generatePaytmSignature, verifyPaytmSignature } from "../api/_paytm-checksum.js";

const KEY = "1234567890123456";
const MID = "MID_TEST_123";
const GATEWAY_ORDER = "SJC00000009TESTORDER123456";
const USER = { id: "11111111-1111-1111-1111-111111111111", email: "customer@example.com", user_metadata: {} };
const ORDER = {
  id: 9, order_number: "SJC-260101-AB12C", user_id: USER.id,
  customer_name: "Ram Kumar", phone: "9927892667", email: "customer@example.com",
  address: "House 4, Tirth Mandir road", city: "Sambhal", state: "Uttar Pradesh", pincode: "244303",
  total: "1598.00", subtotal: "1558.00", shipping: "40.00", payment_method: "ONLINE",
  payment_provider: "PAYTM", payment_status: "pending", order_status: "pending", created_at: "2026-10-10T10:00:00Z",
};
const ATTEMPT = { id: 21, order_id: ORDER.id, payment_provider: "PAYTM", gateway_order_id: GATEWAY_ORDER, amount: "1598.00", status: "pending" };
const load = async (p) => (await import(p)).default;
const call = async (h, opts) => { const res = mockRes(); await h(mockReq(opts), res); return res; };

beforeEach(() => {
  process.env.PAYTM_ENVIRONMENT = "staging";
  process.env.PAYTM_MID = MID;
  process.env.PAYTM_MERCHANT_KEY = KEY;
  delete process.env.PAYTM_WEBSITE_NAME;
  process.env.RAZORPAY_KEY_ID = "rzp_test_abc";
  process.env.RAZORPAY_KEY_SECRET = "sec";
  fake.users = { tokUser: USER };
  fake.rpcCalls = [];
  fake.resolve = () => ({ data: null, error: null });
  fake.rpcImpl = async () => ({ data: null, error: null });
});

async function signedPaytmResponse(body) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ body, head: { signature: await generatePaytmSignature(JSON.stringify(body), KEY) } }),
  };
}

function signedStatusFetch(body) {
  return async (url, init) => {
    assert.match(String(url), /^https:\/\/securestage\.paytmpayments\.com\/v3\/order\/status$/);
    const req = JSON.parse(init.body);
    assert.equal(req.body.mid, MID);
    assert.equal(req.body.orderId, GATEWAY_ORDER);
    assert.ok(verifyPaytmSignature(JSON.stringify(req.body), KEY, req.head.signature), "status API request checksum is valid");
    return signedPaytmResponse(body);
  };
}

const validCustomer = { name: "Ram Kumar", phone: "9927892667", email: "customer@example.com", address: "House 4, Tirth Mandir road", city: "Sambhal", state: "Uttar Pradesh", pincode: "244303" };

test("Paytm checksum validates signed JSON and form payloads; tampered signatures fail", async () => {
  const data = { mid: MID, orderId: GATEWAY_ORDER, amount: "1598.00" };
  const signature = await generatePaytmSignature(JSON.stringify(data), KEY);
  assert.equal(verifyPaytmSignature(JSON.stringify(data), KEY, signature), true);
  assert.equal(verifyPaytmSignature(JSON.stringify({ ...data, amount: "1.00" }), KEY, signature), false);
  const form = { MID, ORDERID: GATEWAY_ORDER, STATUS: "TXN_SUCCESS", TXNAMOUNT: "1598.00" };
  const formSignature = await generatePaytmSignature(form, KEY);
  assert.equal(verifyPaytmSignature(form, KEY, formSignature), true);
  assert.equal(verifyPaytmSignature(form, KEY, "not-a-real-checksum"), false);
});

test("creating a Paytm checkout signs the official initiation request and returns no merchant key", async () => {
  const h = await load("../api/_routes/orders/create.js");
  const originalFetch = globalThis.fetch;
  let sentUrl, sentBody;
  globalThis.fetch = async (url, init) => {
    sentUrl = String(url); sentBody = JSON.parse(init.body);
    assert.ok(verifyPaytmSignature(JSON.stringify(sentBody.body), KEY, sentBody.head.signature));
    return signedPaytmResponse({ resultInfo: { resultStatus: "S", resultCode: "0000" }, txnToken: "short-lived-test-token" });
  };
  fake.rpcImpl = async (name, args) => {
    if (name === "create_order") return { data: { existing: false, order: { ...ORDER, payment_provider: null } }, error: null };
    if (name === "begin_paytm_attempt") return { data: { order: ORDER }, error: null };
    return { data: null, error: null };
  };
  try {
    const res = await call(h, {
      method: "POST",
      headers: { host: "shop.test", origin: "https://shop.test", ...cookieFor("tokUser") },
      body: { customer: validCustomer, items: [{ productId: 3, qty: 2 }], paymentMethod: "PAYTM", idempotencyKey: "abcdefgh-1234" },
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.paytm.amount, "1598.00");
    assert.equal(res.body.paytm.txnToken, "short-lived-test-token");
    assert.equal(res.body.razorpay, undefined);
    assert.equal(sentUrl, `https://securestage.paytmpayments.com/theia/api/v1/initiateTransaction?mid=${MID}&orderId=${res.body.paytm.orderId}`);
    assert.equal(sentBody.body.websiteName, "WEBSTAGING");
    assert.equal(sentBody.body.txnAmount.currency, "INR");
    assert.ok(!JSON.stringify(res.body).includes(KEY), "merchant key is not returned to the browser");
    assert.ok(fake.rpcCalls.some(([name, args]) => name === "create_order" && args.p_method === "ONLINE"));
    assert.ok(fake.rpcCalls.some(([name]) => name === "begin_paytm_attempt"));
  } finally { globalThis.fetch = originalFetch; }
});

test("invalid checksum on Paytm initiation response does not return checkout token", async () => {
  const h = await load("../api/_routes/orders/create.js");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ body: { resultInfo: { resultStatus: "S" }, txnToken: "should-not-be-returned" }, head: { signature: "tampered" } }) });
  fake.rpcImpl = async (name) => {
    if (name === "create_order") return { data: { existing: false, order: ORDER }, error: null };
    if (name === "begin_paytm_attempt") return { data: { order: ORDER }, error: null };
    return { data: null, error: null };
  };
  try {
    const res = await call(h, { method: "POST", headers: { origin: "https://shop.test", host: "shop.test", ...cookieFor("tokUser") }, body: { customer: validCustomer, items: [{ productId: 3, qty: 2 }], paymentMethod: "PAYTM", idempotencyKey: "abcdefgh-1234" } });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.paytm, undefined);
    assert.match(res.body.paymentError, /authentication failed/i);
  } finally { globalThis.fetch = originalFetch; }
});

test("Paytm customer verify is authenticated and blocks cross-origin writes", async () => {
  const h = await load("../api/paytm.js");
  const denied = await call(h, { method: "POST", query: { action: "verify" }, headers: { origin: "https://evil.example", host: "shop.test", ...cookieFor("tokUser") }, body: { orderNumber: ORDER.order_number } });
  assert.equal(denied.statusCode, 403);
  const anonymous = await call(h, { method: "POST", query: { action: "verify" }, headers: { origin: "https://shop.test", host: "shop.test" }, body: { orderNumber: ORDER.order_number } });
  assert.equal(anonymous.statusCode, 401);
});

test("Paytm callback rejects invalid checksum before contacting Paytm", async () => {
  const h = await load("../api/paytm.js");
  const originalFetch = globalThis.fetch; let fetchCalls = 0;
  globalThis.fetch = async () => { fetchCalls++; throw new Error("should not fetch"); };
  try {
    const res = await call(h, { method: "POST", query: { action: "callback" }, body: { MID, ORDERID: GATEWAY_ORDER, STATUS: "TXN_SUCCESS", CHECKSUMHASH: "invalid" } });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /checksum/i);
    assert.equal(fetchCalls, 0);
    assert.equal(fake.rpcCalls.length, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("Paytm successful callback is reconciled only after server-side status and amount verification; repeated callback stays idempotent", async () => {
  const h = await load("../api/paytm.js");
  const originalFetch = globalThis.fetch;
  const statusBody = { mid: MID, orderId: GATEWAY_ORDER, txnAmount: "1598.00", txnId: "PAYTM-TXN-123", resultInfo: { resultStatus: "TXN_SUCCESS", resultCode: "01" } };
  globalThis.fetch = signedStatusFetch(statusBody);
  fake.resolve = (table) => table === "payment_attempts" ? { data: ATTEMPT, error: null }
    : table === "orders" ? { data: ORDER, error: null } : { data: null, error: null };
  fake.rpcImpl = async (name) => name === "reconcile_paytm_payment"
    ? { data: { ...ORDER, payment_status: "paid", payment_provider: "PAYTM" }, error: null }
    : { data: null, error: null };
  const unsigned = { MID, ORDERID: GATEWAY_ORDER, STATUS: "TXN_SUCCESS", TXNID: "PAYTM-TXN-123", TXNAMOUNT: "1598.00" };
  const payload = { ...unsigned, CHECKSUMHASH: await generatePaytmSignature(unsigned, KEY) };
  try {
    for (let i = 0; i < 2; i++) {
      const res = await call(h, { method: "POST", query: { action: "callback" }, body: payload });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.status, "paid");
    }
    assert.equal(fake.rpcCalls.filter(([name]) => name === "reconcile_paytm_payment").length, 2,
      "repeat callbacks rely on the transactionally idempotent reconciliation RPC");
  } finally { globalThis.fetch = originalFetch; }
});

test("Paytm incorrect server-reported amount is rejected and never reconciled as paid", async () => {
  const h = await load("../api/paytm.js");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = signedStatusFetch({ mid: MID, orderId: GATEWAY_ORDER, txnAmount: "1.00", txnId: "PAYTM-TXN-123", resultInfo: { resultStatus: "TXN_SUCCESS", resultCode: "01" } });
  fake.resolve = (table) => table === "payment_attempts" ? { data: ATTEMPT, error: null } : { data: null, error: null };
  const unsigned = { MID, ORDERID: GATEWAY_ORDER, STATUS: "TXN_SUCCESS", TXNID: "PAYTM-TXN-123", TXNAMOUNT: "1598.00" };
  const payload = { ...unsigned, CHECKSUMHASH: await generatePaytmSignature(unsigned, KEY) };
  try {
    const res = await call(h, { method: "POST", query: { action: "callback" }, body: payload });
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /amount/i);
    assert.equal(fake.rpcCalls.some(([name]) => name === "reconcile_paytm_payment"), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("Paytm pending result is not marked paid", async () => {
  const h = await load("../api/paytm.js");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = signedStatusFetch({ mid: MID, orderId: GATEWAY_ORDER, txnAmount: "1598.00", resultInfo: { resultStatus: "PENDING", resultCode: "400" } });
  fake.resolve = (table) => table === "payment_attempts" ? { data: ATTEMPT, error: null } : { data: null, error: null };
  fake.rpcImpl = async (name) => name === "reconcile_paytm_payment" ? { data: { ...ORDER, payment_status: "pending" }, error: null } : { data: null, error: null };
  const unsigned = { MID, ORDERID: GATEWAY_ORDER, STATUS: "PENDING" };
  const payload = { ...unsigned, CHECKSUMHASH: await generatePaytmSignature(unsigned, KEY) };
  try {
    const res = await call(h, { method: "POST", query: { action: "callback" }, body: payload });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "pending");
    assert.equal(fake.rpcCalls.find(([name]) => name === "reconcile_paytm_payment")[1].p_txn_status, "PENDING");
  } finally { globalThis.fetch = originalFetch; }
});


test("Paytm failed status is recorded as failed, never paid", async () => {
  const h = await load("../api/paytm.js");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = signedStatusFetch({ mid: MID, orderId: GATEWAY_ORDER, txnAmount: "1598.00", txnId: "PAYTM-TXN-FAIL", resultInfo: { resultStatus: "TXN_FAILURE", resultCode: "227" } });
  fake.resolve = (table) => table === "payment_attempts" ? { data: ATTEMPT, error: null } : { data: null, error: null };
  fake.rpcImpl = async (name) => name === "reconcile_paytm_payment" ? { data: { ...ORDER, payment_status: "failed" }, error: null } : { data: null, error: null };
  const unsigned = { MID, ORDERID: GATEWAY_ORDER, STATUS: "TXN_FAILURE", TXNID: "PAYTM-TXN-FAIL", TXNAMOUNT: "1598.00" };
  const payload = { ...unsigned, CHECKSUMHASH: await generatePaytmSignature(unsigned, KEY) };
  try {
    const res = await call(h, { method: "POST", query: { action: "callback" }, body: payload });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, "failed");
    assert.equal(fake.rpcCalls.find(([name]) => name === "reconcile_paytm_payment")[1].p_txn_status, "TXN_FAILURE");
  } finally { globalThis.fetch = originalFetch; }
});

test("duplicate Paytm order-create replay does not start a second gateway attempt", async () => {
  const h = await load("../api/_routes/orders/create.js");
  fake.rpcImpl = async (name) => name === "create_order" ? { data: { existing: true, order: ORDER }, error: null } : { data: null, error: null };
  const res = await call(h, { method: "POST", headers: { host: "shop.test", origin: "https://shop.test", ...cookieFor("tokUser") }, body: { customer: validCustomer, items: [{ productId: 3, qty: 2 }], paymentMethod: "PAYTM", idempotencyKey: "abcdefgh-1234" } });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.paytm, undefined);
  assert.match(res.body.paymentError, /already exists/i);
  assert.equal(fake.rpcCalls.filter(([name]) => name === "begin_paytm_attempt").length, 0);
});
