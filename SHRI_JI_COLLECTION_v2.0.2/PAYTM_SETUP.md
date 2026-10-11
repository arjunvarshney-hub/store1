# Paytm Payment Gateway setup — SHRI JI COLLECTION

This project adds Paytm as an additional provider. Razorpay and Cash on Delivery remain available. This guide covers **staging first**; production should be enabled only after the Paytm merchant account is activated and the sandbox checklist passes.

## 1. Supabase migration

1. Back up the target database and confirm that `public.orders` exists with the existing order/Razorpay columns expected by this project.
2. Open **Supabase → SQL Editor**.
3. Open `migrations/20261010_paytm_payment_gateway.sql`, review it, and run it once.
4. Verify that `orders` now has `payment_provider`, `paytm_order_id`, `paytm_transaction_id`, and that `payment_attempts` exists. Do not run the entire `supabase.sql` on an existing production database as a shortcut.

This migration is additive to the existing schema, creates a Paytm attempt ledger and service-role-only RPCs, and preserves existing order and inventory rows. It also updates `mark_order_paid` with the same signature used by current Razorpay routes so duplicate cross-provider payments can be flagged. Since live schemas can drift, verify against a backup/staging database before production.

## 2. Create staging credentials

1. Open the Paytm Payment Gateway Dashboard: https://dashboard.paytmpayments.com/ .
2. Go to **Developer Settings → API Keys** and generate/view the **Test API Details**. Paytm's dashboard labels and navigation can change; use the current Payment Gateway API-key page if the wording differs.
3. Keep the MID and merchant key private. Do not paste the merchant key into a chat, issue, frontend file, or GitHub.
4. In the Vercel project, open **Settings → Environment Variables** and add the following to **Preview** first:

   - `PAYTM_ENVIRONMENT` = `staging`
   - `PAYTM_MID` = the staging MID
   - `PAYTM_MERCHANT_KEY` = the staging merchant key (the key must be 16 UTF-8 bytes for this checksum implementation)
   - `PAYTM_WEBSITE_NAME` = `WEBSTAGING` (optional; this is the staging default)

   Keep the existing `SUPABASE_*`, `RAZORPAY_*`, `SITE_URL`, and other variables intact.

5. Redeploy the Preview deployment so the new environment variables are loaded.

## 3. Callback and notification URLs

The Paytm Initiate Transaction request sends the callback URL dynamically as:

`https://YOUR_PREVIEW_OR_PRODUCTION_DOMAIN/api/paytm?action=callback`

If the merchant dashboard provides **Payment Status Webhook** configuration, use:

`https://YOUR_PRODUCTION_DOMAIN/api/paytm?action=webhook`

Use HTTPS and your actual Vercel domain/custom domain. Do not enter the literal placeholder. The callback/webhook payload is checksum-verified, matched to the configured MID and a known local attempt, then the server independently calls Paytm's Transaction Status API before an order can be marked paid.

## 4. Staging test sequence

Use test credentials and Paytm-provided test instruments/payment modes listed for the staging merchant account. Which UPI/card/netbanking modes appear depends on merchant configuration and the currently supported test modes.

- [ ] Open Preview checkout and confirm Paytm appears only when `PAYTM_*` staging configuration is valid.
- [ ] Create one low-value test order and confirm the server-supplied amount matches the order total including delivery.
- [ ] Complete one success scenario using Paytm's current staging test instructions; verify the order becomes paid only after server-side status reconciliation.
- [ ] Run failure and pending scenarios; verify neither is marked paid.
- [ ] Close the checkout before returning, then inspect My Orders; do not retry blindly while status is pending. Validate callback/webhook reconciliation through server logs and the payment-attempt row.
- [ ] Replay a callback/webhook in staging where possible; confirm the order is not double-confirmed and stock is unchanged.
- [ ] Try a browser amount change / invalid checksum in controlled API tests; it must not mark an order paid.
- [ ] Test payment retry from My Orders after failure.
- [ ] Independently test Razorpay success/failure/signature/webhook and COD placement, delivery charge, cancellation/restock.
- [ ] Test the checkout on real Android viewport sizes and examine Vercel function logs for errors without exposing payment credentials.

Automated test mocks are not a substitute for a completed staging transaction with Paytm credentials.

## 5. Production activation

After Paytm activates the merchant account and you have successfully completed the staging checklist, add production-only Vercel environment variables:

- `PAYTM_ENVIRONMENT` = `production`
- `PAYTM_MID` = production MID issued after activation
- `PAYTM_MERCHANT_KEY` = production merchant key (never committed to Git)
- `PAYTM_WEBSITE_NAME` = `DEFAULT` (optional; production default)

Re-check the production callback/webhook URLs and deploy. Do one controlled, low-value live transaction only after explicit merchant approval. Confirm settlement/payment in Paytm Dashboard and order/payment fields in Supabase. Production success was **not** tested as part of this code change.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `PAYTM_ENVIRONMENT` | Yes | `staging` or `production`; defaults to staging if omitted |
| `PAYTM_MID` | Yes | Merchant ID for the matching environment |
| `PAYTM_MERCHANT_KEY` | Yes | Server-only signing/checksum key; 16 bytes for this implementation |
| `PAYTM_WEBSITE_NAME` | No | Defaults to `WEBSTAGING` for staging and `DEFAULT` for production |

The customer browser receives the merchant MID, environment host, amount, order ID and short-lived transaction token needed by Paytm CheckoutJS; it never receives the merchant key.
