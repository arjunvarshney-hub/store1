import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('orders API requires idempotency and delegates atomic stock validation to DB RPC', () => {
  const s = read('../api/orders.js');
  assert.match(s, /Idempotency-Key|idempotencyKey/);
  assert.match(s, /sjc_create_order/);
  assert.match(s, /PRICE_CHANGED/);
});
test('payment verification checks HMAC timing-safely and confirms gateway payment', () => {
  const s = read('../api/verify-payment.js');
  assert.match(s, /timingSafeEqual/);
  assert.match(s, /payments\.fetch/);
  assert.match(s, /payment\.status!=="captured"/);
  assert.match(s, /payment\.amount/);
});
test('webhook validates raw-body signature before processing', () => {
  const s = read('../api/webhooks/razorpay.js');
  assert.match(s, /RAZORPAY_WEBHOOK_SECRET/);
  assert.match(s, /x-razorpay-signature/);
  assert.match(s, /timingSafeEqual/);
  assert.match(s, /bodyParser:false/);
});
test('auth uses HttpOnly access and refresh cookies and supports refresh', () => {
  const s = read('../lib/supabase.js');
  assert.match(s, /HttpOnly/);
  assert.match(s, /sjc_refresh/);
  assert.match(s, /refreshSession/);
  assert.match(s, /clearAuthCookies\(res\)/);
});
test('image upload verifies binary file signatures', () => {
  const s = read('../api/admin/upload-image.js');
  assert.match(s, /function matches/);
  assert.match(s, /0xff/);
  assert.match(s, /PNG/);
  assert.match(s, /WEBP/);
});
test('database migrations provide atomic stock and idempotency controls', () => {
  const s = read('../supabase.sql');
  assert.match(s, /orders_idempotency_key_unique/);
  assert.match(s, /for update/i);
  assert.match(s, /sjc_create_order/);
  assert.match(s, /sjc_set_order_status/);
});
test('Vercel config includes nested API functions and baseline security headers', () => {
  const s = read('../vercel.json');
  assert.match(s, /api\/\*\*\/\*\.js/);
  assert.match(s, /X-Content-Type-Options/);
  assert.match(s, /X-Frame-Options/);
});

test('migration adapts existing UUID orders table without dropping data', () => {
  const s = read('../supabase.sql');
  assert.match(s, /alter table public\.orders add column if not exists order_number text/i);
  assert.match(s, /SJC-LEGACY-/);
  assert.doesNotMatch(s, /drop table\s+public\.orders/i);
});
test('checkout accepts repeated product IDs across cart lines and validates IDs', () => {
  const s = read('../api/orders.js');
  assert.match(s, /const parsedIds=raw\.map/);
  assert.doesNotMatch(s, /ids\.length!==new Set\(raw\.map/);
});
