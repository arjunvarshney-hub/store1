# SHRI JI COLLECTION — Paytm Integration Audit & Implementation Report

Date: 2026-10-10

## Scope and limitations

Paytm was added to the provided project ZIP without removing Razorpay or COD. Automated tests ran against mocked gateway APIs and fake Supabase handlers. No live Supabase credentials, Paytm staging merchant credentials, approved production credentials, or real payment instruments were available in this run. The migration has not been applied to a live database, Vercel has not been deployed from this workspace, and no real Paytm or Razorpay payment was attempted.

## Existing architecture found

- Frontend: static HTML and CSS with browser ES modules in `public/js/`; no React/Next/Vite build pipeline was present.
- Backend: Vercel Node.js serverless functions using ESM and Node 24.x, under `api/`.
- Data/auth: Supabase client and `public.orders`, products/inventory, `create_order`, `set_order_status`, `mark_order_paid`, and `payment_events` SQL functions/tables in `supabase.sql`.
- Existing gateway: Razorpay REST API order creation, browser checkout and signature verification (`api/_razorpay.js`, `api/_routes/orders/create.js`, `pay.js`, `verify.js`, `api/razorpay-webhook.js`).
- COD: the existing `create_order` RPC calculates price and delivery from database product rows and manages stock; COD remains mapped to `payment_method='COD'`. Existing status/cancellation code was not replaced.
- Vercel: the project uses a dispatcher pattern for APIs. Paytm was added as a single top-level `api/paytm.js` function; its helpers start with `_` and do not become extra route files under the project's existing convention.

## Payment/security changes

- Paytm uses the documented Initiate Transaction and Transaction Status APIs plus the Paytm checksum algorithm adapted with source attribution. The merchant key remains server-only.
- Paytm callbacks/webhooks are checksum-validated, must match the configured MID and a known stored attempt, and then trigger a server-to-server status query. Only `TXN_SUCCESS` with the exact stored/database amount and transaction ID can mark the order paid.
- Pending or failed status does not mark an order paid. Reconciliation is handled by locked/idempotent Supabase RPCs and a separate payment-attempt record. A later or cross-provider duplicate success is recorded for manual reconciliation/refund; it is not allowed to deduct stock a second time.
- Browser verify is authenticated, same-origin and order-owner scoped. Browser success alone cannot change payment status.
- Razorpay checkout verification was strengthened: after signature verification and owner/order association, the server now fetches the payment from Razorpay and checks `order_id`, INR currency, exact amount and `captured` status before invoking the DB paid RPC. Existing Razorpay callback/webhook entry points remain.
- The environment example contains placeholders only. The CSP allows the Paytm staging/production CheckoutJS hosts while retaining Razorpay hosts.

## Files created

- `api/_paytm-checksum.js` — Paytm checksum generation and verification.
- `api/_paytm.js` — Paytm configuration, initiate/status requests, attempt reconciliation helpers.
- `api/paytm.js` — one dispatcher for `config`, customer `verify`, `callback`, and `webhook` actions.
- `migrations/20261010_paytm_payment_gateway.sql` — backward-compatible columns/table/index/RPC migration.
- `tests/paytm.test.mjs` — mocked Paytm flow/security tests.
- `PAYTM_SETUP.md` — staging, callback/webhook, production and environment setup guide.
- `PAYTM_IMPLEMENTATION_REPORT.md` — this report.

## Files modified

- `.env.example`
- `DEPLOYMENT_CHECKLIST.md`
- `api/_razorpay.js`
- `api/_routes/orders/create.js`
- `api/_routes/orders/my.js`
- `api/_routes/orders/pay.js`
- `api/_routes/orders/verify.js`
- `public/js/account.js`
- `public/js/admin.js`
- `public/js/checkout.js`
- `public/js/common.js`
- `supabase.sql` (Paytm migration appended for a fresh schema setup; do not run the whole schema file on a live database to apply this change)
- `tests/api.test.mjs`
- `vercel.json`

No existing project file was deleted.

## Database change

For an existing database, run `migrations/20261010_paytm_payment_gateway.sql` once only after taking a backup and verifying the live `public.orders` schema matches the expected columns and key types. It adds Paytm provider/transaction fields, a `payment_attempts` ledger with RLS, uniqueness indexes, RPCs to begin/reconcile payment attempts and a compatible replacement for `mark_order_paid`. It does not delete order/product/inventory rows. **This migration was not executed against a live Supabase instance in this run.**

## Automated validation results

- `npm test`: **52 passed, 0 failed, 0 skipped**.
- `node --check` on 50 JavaScript/MJS files: **passed**.
- `package.json` and `vercel.json` JSON parsing: **passed**.
- Vercel serverless function-limit unit test: **passed** as part of `npm test`.
- `npm run test:e2e`: **not completed**. Playwright is installed, but the Chromium headless browser executable is not present in this environment, so the run stops before browser-based tests begin.
- Production build: **not run / no `build` script exists** in this project's `package.json`; it is an unbundled static frontend plus serverless functions.

The automated suite covers the pre-existing 41-test suite plus additional Paytm and Razorpay verification tests. The Paytm tests mock gateway responses and Supabase; they verify checksums, initiation signatures, invalid responses, authentication/origin protections, server-side status and amount checks, pending/failure behavior, callback idempotency, and duplicate order-create replay. They do **not** prove a real transaction can complete through Paytm.

## Not yet verified — required before production

- Apply and verify the migration against staging Supabase.
- Complete real Paytm sandbox success, failure, pending, retry, callback/webhook and browser-closed scenarios with merchant test credentials.
- Run browser E2E tests after installing the matching Playwright Chromium binary.
- Independently exercise Razorpay sandbox and COD through a deployed Preview URL.
- Confirm checkout, stock/cancellation restore, customer order history and admin order state against the actual database.
- Complete production test only after the merchant has been approved and production keys are present in Vercel Production environment.

## Official documentation references

- Paytm's Custom Checkout documentation describes server-side transaction initiation and configured payment sources: https://www.paytmpayments.com/docs/v1/custom-checkout/
- Paytm's JS Checkout invocation docs describe CheckoutJS host configuration: https://www.paytmpayments.com/docs/jscheckout-invoke-payment/
- Paytm's callback/webhook docs explain transaction notifications and webhook setup: https://www.paytmpayments.com/docs/callback-and-webhook/
- Paytm's Transaction Status API: https://www.paytmpayments.com/docs/api/transaction-status-api/
- Razorpay server integration docs: https://razorpay.com/docs/server-integration/python/test-app/
