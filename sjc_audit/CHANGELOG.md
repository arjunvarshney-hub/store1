# Changelog

## Signature storefront redesign
- Reworked the customer storefront into a distinct editorial premium shopping experience for SHRI JI COLLECTION rather than copying a marketplace's visual identity.
- Kept the deep-maroon, cream and subtle-gold brand palette with more whitespace, refined typography and restrained decorative details.
- Added responsive category discovery, product search, sorting, product quick view, image gallery, local wishlist, bag drawer, and mobile bottom navigation.
- Improved checkout field labels, mobile validation feedback, loading/error states and order status messaging while preserving the existing `/api/products`, `/api/orders`, and `/api/verify-payment` integration contracts.
- Refined admin panel styling while preserving existing product/order management code.
- Note: this is a UI/UX enhancement, not a claim that live payment, database or end-to-end production tests have passed.


## 2026-10-09 follow-up hardening
- Fixed checkout validation to allow the same product in multiple cart lines (for example, different sizes) while checking combined stock demand.
- Added sale-price handling to public product API, storefront pricing/sorting, and server-side order totals.
- Tightened India mobile number validation in order creation.
- Made relevant Supabase policy creation idempotent and added a safe `sale_price` column migration.

## 2026-10-09 — Storefront, admin usability and security pass
- Added product quantity selection and visible stock availability to product details; out-of-stock products cannot be added from the product card/detail view.
- Added cart quantity guardrails against the stock currently returned by the product API and fixed size changes to target the correct cart line.
- Improved admin overview metrics, product search/category-free stock filters, low-stock and inactive product filters, order search/status filters, collapsible order item details, and image previews before upload.
- Improved account-page output escaping for account email and order fields.
- Strengthened payment verification by checking the payment against Razorpay's server API, including Razorpay order ID, amount, currency, and captured status before marking an order paid.
- Added responsive admin metrics/filter styling and clearer product visibility controls.
- Updated README with the latest verified checks and remaining production blockers.


## Production-hardening follow-up
- Added database-side atomic stock validation/decrement, idempotency key uniqueness, and atomic cancellation restocking RPCs.
- Added Razorpay webhook signature validation and captured-payment reconciliation endpoint.
- Added access-token refresh using HttpOnly refresh cookie, hardened auth input handling, image magic-byte checks, Vercel nested API build coverage, and baseline security headers.
- Paid online order cancellation now requires a refund to be handled in Razorpay first; automatic refunds are not implemented.
