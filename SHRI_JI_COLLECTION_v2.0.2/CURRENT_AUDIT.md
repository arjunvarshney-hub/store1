# CURRENT AUDIT (evidence-based)

**Scope of this audit:** the repository ZIP `store1-main` supplied by the owner (project folder `SHRI_JI_COLLECTION_v2.0.2`). 
**Not accessed:** GitHub (no repo access), Vercel (no dashboard/logs), the live Supabase database, live Razorpay. Everything marked `NOT TESTABLE` could not be verified for that reason.
**Facts about the ZIP:** it has no `.git` folder, so the branch and last commit are unknown. The project sits inside the sub-folder `SHRI_JI_COLLECTION_v2.0.2/` (not the repo root). The reviews PR code (`api/_routes/admin/reviews.js`, review API in `api/products.js`, `migrations/20261010_product_reviews.sql`) **is present** in this ZIP. Whether it is live and whether the migration was applied in Supabase is **unknown**.

Status words: `PASS`, `FAIL`, `PARTIALLY IMPLEMENTED`, `NOT TESTABLE`, `NOT IMPLEMENTED`.

| Area | Observed (evidence) | Status | Risk | Action taken / proposed | Files | DB change | Deploy impact |
|---|---|---|---|---|---|---|---|
| Repo layout | Project is inside `SHRI_JI_COLLECTION_v2.0.2/`; `vercel.json` is in that folder | NOT TESTABLE (Vercel Root Directory unknown) | Wrong root = build fails | Documented in `DEPLOYMENT_CHECKLIST.md` | none | none | Root Directory must equal the folder name |
| `.gitignore` / `.env.example` | Both were missing in the ZIP | FAIL (fixed) | A real `.env` could be committed | Added both (placeholders only) | `.gitignore`, `.env.example` | none | none |
| Function count | 9 deployable files under `api/` (auth, admin, orders, site, products, page, upload-image, razorpay-webhook, cron). Test `Vercel Hobby limit` asserts ≤ 12. Chat reuses `api/site.js` | PASS (static count) | Hobby limit 12 | No new function added | `api/site.js` | none | none |
| Reviews: storage + moderation | Table, RLS (public sees approved only), summary function, admin approve/reject/delete, honeypot, validation, pending-by-default; 7 pre-existing tests pass | PASS (code + fake DB) / NOT TESTABLE (live DB) | Migration may not be applied | Verified, not rewritten | `api/products.js`, `api/_routes/admin/reviews.js` | existing migration | none |
| Reviews: abuse control | Only a honeypot existed. No rate limit | FAIL (fixed) | Spam flood | In-memory burst limit + DB limits (3/hour, 1 per product/day per hashed visitor), graceful if column missing | `api/products.js`, `api/_lib.js` | **additive** `20261011_review_abuse_controls.sql` | none |
| Reviews: honesty/XSS/SEO | Comments escaped; no stars without data; JSON-LD only with approved data; "not purchase-verified" label was missing | PASS (label added) | Misleading trust | Label added; tests for escaping and aggregates | `api/_layout.js` | none | none |
| Reviews: admin UI + public form | Verified in a real browser (Chromium, 360 px): submit → pending → admin approve → public with escaped text, real average | PASS (fake DB) | – | Browser tests added | `tests/e2e/run.py` | none | none |
| AI assistant | Did not exist | PASS (implemented; fallback mode tested) / **NOT TESTABLE (live AI: no API key)** | Cost, prompt injection, privacy | See `AI_ASSISTANT_SETUP.md`. Read-only, server-side key, rate limits, untrusted-data handling, owner FAQ + on/off | `api/_assistant.js`, `api/_routes/site/chat.js`, `public/js/chat.js`, `api/_validate.js`, `api/_catalog.js`, `public/js/admin.js` | none (uses `site_settings`) | env vars optional |
| Secure order tracking via chat | No safe verification flow exists in the app | PARTIALLY IMPLEMENTED | Data leak if done carelessly | Bot never reads orders; sends customer to login → My Orders (tested: orders table never touched) | `api/_assistant.js` | none | none |
| Orders / stock / prices | Server-side validation, atomic reservation SQL function, idempotency key (unchanged from v2) | PASS (fake DB + JS mirror) / NOT TESTABLE (real SQL) | SQL never run here | Re-ran full suite | – | – | – |
| Razorpay + COD | Server-created orders, signature verification, webhook, idempotent `mark_order_paid`; COD never marked paid at creation | PASS (unit, stubbed gateway) / NOT TESTABLE (real gateway) | Live behaviour unverified | Preserved, not changed | `api/_razorpay.js`, `api/_routes/orders/*` | none | test keys on Preview first |
| Paytm | No code | NOT IMPLEMENTED | – | Deliberately not added (no merchant account/docs access; owner approval needed) | – | – | – |
| Admin auth | Server-side `requireAdmin` on every admin route; customers get 403 (tests) | PASS | – | Unchanged; new settings fields use same guard | `api/_routes/admin/settings.js` | none | none |
| Product admin extras | Add/edit/delete/active, sale price, sizes, multi-photo upload with preview, make-cover exist. **Missing:** featured toggle, SKU, colours/variants with own price/stock, photo re-order beyond "make cover", low-stock list | PARTIALLY IMPLEMENTED | Owner convenience | Not changed in this release (scope) | – | would need migration | – |
| Order admin extras | Search, filters, detail, status update exist. **Missing:** status audit trail, CSV export | PARTIALLY IMPLEMENTED | – | Not changed | – | audit table needed | – |
| Layout / UX | Previous releases: light theme, drawer menu, desktop header, category strip, logo/hero editable. **Not done from the design brief:** filter drawer + applied chips, sticky mobile buy bar, rating distribution, before/after screenshot set | PARTIALLY IMPLEMENTED | Subjective | Chat UI built to the same design tokens; checked at 360 px and 1280 px | `public/style.css` | none | none |
| Mobile overflow | Checked on 360 px and 320 px in Chromium for all main pages and the open chat | PASS | – | Part of E2E | `tests/e2e/run.py` | – | – |
| SEO | Sitemap, robots, canonical, Product JSON-LD (rating only when real) | PASS (code) | – | unchanged | – | – | – |
| Performance (Core Web Vitals) | Not measured | NOT TESTABLE | – | Chat script is a small separate module; not loaded on cart/checkout/admin | – | – | – |
| Vercel Preview / Production / logs / domains | No access | NOT TESTABLE | – | `DEPLOYMENT_CHECKLIST.md` (Preview first, rollback steps) | – | – | – |
| Live Supabase (RLS, storage) | No access | NOT TESTABLE | – | Migrations are additive; preflight/rollback in checklist | – | – | – |

## Test evidence (run in this environment)
* `npm test`: 50 tests, 50 pass (34 existing + 16 new: assistant, review limits).
* `npm run test:e2e`: 127 browser checks (Chromium, phone 360 px / 320 px, desktop 1280 px), 127 pass, run twice. Uses an in-memory fake of Supabase and a stubbed Razorpay/AI provider. It proves UI + API logic, **not** the real SQL, real Supabase or real providers.
