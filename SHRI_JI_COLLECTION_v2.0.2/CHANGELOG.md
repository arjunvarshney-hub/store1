# Changelog

## 4.0.0 (catalogue upgrade; database upgrade REQUIRED, see migrations/20261012_catalog_v4.sql)
Added
- **Thakur Ji Poshak first**: new home page (hero, 10 category tiles, new arrivals, then Ladies Wear), menu and footer list Thakur Ji first.
- **Categories managed in admin** (new table `categories`): add, rename, sort, switch on/off, delete only when empty, move/archive products of removed categories, "Others" in the product form. Mala + Necklace merged into "Mala and Necklace". Fall and Astar, Maxi, Gown, Dress Material removed from the shop (records kept, switched off, products hidden until reassigned or archived).
- **Delivery charges** (server + database + cart + checkout): below Rs 499 = Rs 50; Rs 499 to 999.99 = Rs 40; Rs 1,000+ = free; exact "Add Rs X more" hint. The old SHIPPING_FLAT / FREE_SHIPPING_ABOVE variables are no longer used.
- **Variants** (Colour, Size, Material, Design, Pack Size) with own SKU, price, sale price, stock, pack quantity and availability; **minimum order quantity**; **pack size** (stock is counted in single pieces: 1 x Pack of 3 removes 3 pieces).
- **Product details**: SKU, brand, subcategory, short description, **rich-text description** (sanitised on the server), **specifications**, weight, dimensions, low-stock alert, **cost price (admin only; blocked at database level)**, status active/inactive/archived, **per-product return policy** shown on product page, cart and checkout.
- **Swipe gallery** with 1/5 counter, thumbnails and tap-to-zoom; admin photo reordering (move / make main / remove) with upload progress.
- **Admin**: product list with server-side search (name, SKU, ID, category, variant SKU), filters, sorting and pages; duplicate / archive / activate / out-of-stock / quick price+stock; delete refused when a product is in any order; admin audit log table (`admin_audit`).
Changed
- `create_order()` now takes `p_tiers` (old 7-argument version is dropped by the migration). Order snapshots now carry variant, SKU, pack quantity, pieces and the return policy.
- Customer rating line on cards is shown only when real approved reviews exist.
- Auth sign-in uses a fresh session-less client; rate limits on login/sign-up/reset/review.
Tests: 70 unit/API tests and 53 browser checks.
NOT included yet (see docs/NEXT_PHASE_PROMPTS.md): admin + customer emails, return-request workflow, order timeline/tracking, orders dashboard extras.

## 3.0.0: SHRI JI Assistant + review hardening
* **New: SHRI JI Assistant** (chat). Server-side only, read-only, English/Hindi/Hinglish, real products only, works without an AI key ("store answers" mode), optional live AI through `ANTHROPIC_API_KEY`. Owner can switch it off and write FAQ answers in admin → Site. No new serverless function, no new table. See `AI_ASSISTANT_SETUP.md`.
* **Reviews:** added spam controls (burst limit, 3 per hour and 1 per product per day per visitor; one-way visitor hash), "not purchase-verified" label, and the additive migration `migrations/20261011_review_abuse_controls.sql`.
* Tests: 50 unit/API tests (was 34), 127 browser checks (was 90).
* New docs: `CURRENT_AUDIT.md`, `AI_ASSISTANT_SETUP.md`, `DEPLOYMENT_CHECKLIST.md`, `.env.example`, `.gitignore`.
* Changed files: `api/_assistant.js` (new), `api/_routes/site/chat.js` (new), `api/site.js`, `api/_lib.js`, `api/_validate.js`, `api/_catalog.js`, `api/_layout.js`, `api/products.js`, `api/_routes/admin/settings.js`, `vercel.json`, `public/js/chat.js` (new), `public/js/admin.js`, `public/style.css`, `migrations/20261011_review_abuse_controls.sql` (new), tests.

## 2.0.0: full rebuild on the existing Supabase + Vercel + Razorpay architecture

### 2.0.1
* Vercel Hobby deploy failed ("No more than 12 Serverless Functions"): 19 API files merged into 9 functions via dispatchers + rewrites. URLs unchanged. A test now fails if the count exceeds 12.
* `engines.node` pinned to `24.x` (Vercel discontinued 20.x) (removes the auto-upgrade warning).

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

## 4.0.1 — Existing Supabase schema compatibility (2026-10-13)
- Updated admin and storefront category queries to use the existing `public.product_categories` table instead of the absent `public.categories` table.
- Category creation explicitly sets `is_legacy = false`.
- Added `migrations/20261013_fix_existing_catalog.sql` to safely create the missing `product_variants` table and public read policy without dropping existing tables or changing existing product/order rows.
- Updated unit tests to match the actual category table name.
- Verification: `node --test tests/*.test.mjs` — 70 passed, 0 failed.
