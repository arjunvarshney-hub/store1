# Changelog

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

## 2.1.0 — local working-copy changes (not deployed)

### Added
* Added a SHRI JI Assistant storefront widget for the home, shop, category and product pages; intentionally hidden on cart, checkout, account and admin routes.
* Added a server-side `/api/assistant` action routed through the existing `/api/site` function. It reads active catalogue products, applies simple category/budget matching and optionally uses the OpenAI Responses API when both `OPENAI_API_KEY` and `OPENAI_MODEL` are configured.
* Added transparent catalogue-only fallback when live AI is not configured or the provider fails. Provider credentials are never included in browser files.
* Added responsive homepage collection cards for Thakur Ji Poshak and Ladies Wear, using current product images where available.
* Added `AI_ASSISTANT_SETUP.md`, `DEPLOYMENT_CHECKLIST.md`, `CURRENT_AUDIT.md`, a placeholder-only `.env.example` and `.gitignore`.
* Added tests for assistant readiness, catalogue fallback, invalid input, disabled state and rewrite routing.

### Limitations / not deployed
* Live AI provider behavior is not tested because no OpenAI API key/model was supplied. Configure/test in a Vercel Preview environment before Production.
* The in-memory assistant rate limit is best-effort and not distributed/durable; use approved platform/durable rate limiting before meaningful public traffic.
* Supabase review migration is not applied and must be matched to the live schema after backup/preflight.
* Visual browser/E2E, live Supabase, production deployment and real payment tests remain unverified. No GitHub push or production deployment was made by this work.


## 2026-10-10 — Mobile layout correction (prepared patch)

- Fixed mobile hero calls-to-action wrapping into narrow, multi-line buttons by stacking the two actions at phone widths.
- Tuned header spacing and logo sizing for narrow Android screens; hides only the redundant header search icon below 360px while search remains available in the menu.
- Preserved full product imagery in collection cards, tightened product-card spacing, and made rating metadata more compact on phones.
- Replaced the wide floating assistant pill with a compact, accessible circular launcher on mobile; adjusted the open chat panel for short viewports and safe areas.
- Added targeted responsive rules for widths up to 599px, very narrow 320–359px screens, and landscape phones.
- This patch was tested against a local server-rendered mock catalogue at 320, 360, 390, 430, 768, and 1280 CSS pixels. It has not been deployed to Vercel or tested on a physical Android device.
