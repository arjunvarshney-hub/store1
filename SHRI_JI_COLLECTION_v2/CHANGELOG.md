# Changelog

## 2.0.0: full rebuild on the existing Supabase + Vercel + Razorpay architecture

### Fixed (critical)
* Storefront never showed products (`public/products.js` was empty; the API was never called). Pages now read the database.
* Order prices came from the browser. The server now recalculates everything from the database.
* No stock handling. Stock is reserved atomically in the database (row locks) and released on cancel/expiry.
* Payment verification: authenticated, ownership-checked, idempotent; webhook added.
* `vercel.json` did not build nested API folders (`api/admin`, `api/auth`, `api/orders`). Replaced with zero-config routing.
* Supabase client was created at import with possibly-undefined env, crashing every function. Now lazy.
* Login cookie expired after 1 h with no refresh. Refresh-token support added; `Secure` flag on HTTPS.
* Admin/storefront used `innerHTML` with unescaped data (stored XSS). All output is escaped; CSP added.
* Admin product API inserted the raw request body (mass assignment). Whitelist validation added.
* Upload accepted any file, any name. Now magic-byte checked, 3 MB cap, server-chosen name.
* Order statuses (`new`/`confirmed`) were inconsistent with the requested six. Constrained in the database.

### Added
* Premium mobile-first design (maroon / cream / white / gold), no external fonts.
* 18 categories in 2 groups; category pages, search, sorting, pagination (server-rendered).
* Product pages: gallery, sizes, quantity, sale price, JSON-LD, canonical, breadcrumbs.
* Cart (server-priced), checkout (COD / Razorpay), idempotent order creation, My Orders + detail, cancel, retry payment.
* Admin: product CRUD, visible switch, sale price, multi-photo upload from phone with preview/remove/cover, order search/filter/detail/status/notes.
* Password reset, email-confirmation handling, friendly auth errors.
* SEO: sitemap.xml, robots.txt, titles/descriptions, Open Graph, LocalBusiness + Product + Breadcrumb data.
* Security headers + CSP, CSRF (Origin) check, stricter RLS and column grants, storage bucket limits.
* Tests: 24 unit/API tests, 77 browser checks.

### Not done / needs live verification
* `supabase.sql` has never been executed against a real PostgreSQL (none available here); run it and re-test.
* Real Supabase Auth, Storage and Razorpay were not reachable; all were simulated (see AUDIT.md).
* `vercel build` / deployment not run. Nothing was deployed.
* No rate limiting beyond Supabase Auth's own limits.
* Shipping policy, returns policy and GST invoice are not built (business decisions needed).
* No real product photos exist in the uploaded project; products show a neutral "Photo coming soon" tile until you upload photos in /admin.
* Existing v1 products with free-text categories / external image URLs must be re-saved once in /admin (the form validates them).
