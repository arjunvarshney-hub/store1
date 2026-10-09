# SHRI JI COLLECTION — Hardening follow-up audit

## Changes implemented
- Atomic database order creation now locks product rows, re-checks active state, current price, valid size, aggregate quantities and stock, writes the order and decrements stock in one transaction.
- Idempotency key is persisted with a unique index and the same request key returns the existing order instead of creating a second one.
- Cancellation restocking is done through a database transaction and cannot run twice. Paid online orders cannot be cancelled from admin until a refund is processed manually in Razorpay.
- Razorpay checkout verification checks signature, payment/order linkage, amount, currency and captured status. Added a raw-body, HMAC-verified webhook endpoint for payment-captured/order-paid events.
- Added HttpOnly access/refresh cookies, refresh-token flow, logout clearing both cookies, safer signup errors and input validation.
- Image uploads now validate strict base64, maximum size, declared type and JPEG/PNG/WebP binary signatures.
- Vercel build glob includes nested API files and baseline security headers are configured.
- Checkout persists an idempotency key during retries and reuses an existing order instead of making a duplicate.

## Automated checks actually run
- `node --check` for API JavaScript files: PASS.
- Inline JavaScript syntax in storefront, account and admin HTML: PASS.
- `package.json` and `vercel.json` JSON parse: PASS.
- `npm test` static security smoke tests: PASS (7 tests).
- ZIP creation/integrity: to be checked on final artifact.

## Not testable in this workspace
- Live Supabase SQL execution and RPC behavior: NOT TESTABLE (no connected project credentials/database).
- Supabase RLS/storage policies in deployed project: NOT TESTABLE.
- Real Razorpay checkout, webhook delivery/replay, refunds and settlement: NOT TESTABLE.
- Browser end-to-end checkout, concurrent live stock race, Android browser UX: NOT TESTABLE.
- Deployed Vercel routing/environment variables: NOT TESTABLE.

## Required before launch
1. Run the updated `supabase.sql` in the intended Supabase project; confirm the functions and unique index exist.
2. Configure Vercel variables from `.env.example`, including `RAZORPAY_WEBHOOK_SECRET`; never expose the service-role key.
3. Register Razorpay webhook URL `/api/webhooks/razorpay` for `payment.captured` and `order.paid` and use the same webhook secret in Razorpay and Vercel.
4. Run test-mode COD and Razorpay payments, replay webhook events, try duplicate checkout requests, and test two concurrent requests for the last unit.
5. Guest orders are not linked to an account unless the customer is signed in during checkout; guest customers should keep the order number.
6. Pending online orders can reserve stock while payment remains pending; monitor pending orders and reconcile them manually. Automated expiry/release of abandoned payment reservations and late-capture recovery are not implemented.
7. Automatic refunds are not implemented. Process refunds in Razorpay before marking a paid online order cancelled.
8. Replace `YOUR-DOMAIN` in sitemap/robots after configuring the production domain.
