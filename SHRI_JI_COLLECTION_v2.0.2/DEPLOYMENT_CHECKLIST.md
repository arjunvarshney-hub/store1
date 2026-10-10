# SHRI JI COLLECTION deployment checklist

## Before Preview

- [ ] Verify the repository, branch, Vercel project, root directory and production domain are the intended ones.
- [ ] Ensure the current production commit and database backup/recovery path are recorded.
- [ ] Review `git diff` and ensure no `.env`, service-role key, OpenAI key, Razorpay secret, customer data or unrelated changes are included.
- [ ] Run `npm test` and `git diff --check`.
- [ ] Confirm the assistant route reuses `/api/site` and does not add a new top-level Vercel function.
- [ ] Configure only Preview AI environment variables if live AI testing is intended; never paste keys into chat or commit them.

## Supabase reviews migration — separate from code deployment

- [ ] Back up the database before migration.
- [ ] Inspect actual `public.products.id` type, primary/unique key, current `product_reviews` table, existing functions and RLS policies.
- [ ] Confirm the review migration foreign key type matches the actual products key.
- [ ] Inspect `migrations/20261010_product_reviews.sql` and its rollback considerations.
- [ ] Prefer a separate staging database. Do not run the full `supabase.sql` against an existing production database just to activate reviews.
- [ ] Do not apply the migration automatically. Apply only after schema compatibility and backup are confirmed.

## Preview acceptance checks

- [ ] Homepage: header/search, both collection cards, real product cards, no broken images and no horizontal overflow.
- [ ] Product page: current product data, Add to Cart and review form do not overlap the assistant; no fake rating when there are no approved reviews.
- [ ] Review submission creates a pending review; only approved reviews are public and included in aggregate rating.
- [ ] Admin can approve/reject reviews through server-authorized moderation.
- [ ] Assistant appears on home/shop/category/product pages, not on cart/checkout/account/admin.
- [ ] Assistant product cards use real catalogue prices and stock and link to actual product URLs.
- [ ] In catalogue-only mode, UI clearly says live AI is not configured; do not claim AI mode.
- [ ] With Preview credentials, test English, Hindi and Hinglish; budget filters; out-of-stock questions; unknown return/delivery policy; long/empty messages; provider timeout/failure; repeated requests; attempted prompt injection.
- [ ] Inspect Network responses/source for secret leakage.
- [ ] Confirm assistant cannot change orders, prices, stock or payment status.
- [ ] Test widths 360, 390, 430, 768 and 1280px using browser tools if available.
- [ ] Run E2E browser tests if Chromium/Playwright are installed; otherwise report `NOT TESTABLE` with the reason.
- [ ] Verify Razorpay/COD code remains unchanged and Paytm has not been activated.

## Production release gate

- [ ] Owner explicitly approves this release.
- [ ] Correct Vercel project's latest Production deployment is identified; a Preview `Ready` status is not proof of Production deployment.
- [ ] Any approved schema migration is complete and its success verified separately.
- [ ] Required environment variables are present in the right Vercel environment scope.
- [ ] Production build is Ready; runtime logs have been checked without exposing secrets or customer data.
- [ ] Smoke-test homepage, a product page, cart, checkout display (without placing a real order), review status, assistant status, `/robots.txt` and `/sitemap.xml`.
- [ ] Verify admin access and customer data isolation.
- [ ] Monitor errors after release and stop/rollback if checkout, auth, product loading or privacy are degraded.

## Rollback

1. In Vercel, identify the known-good Production deployment and use the platform's rollback/promote-previous-deployment flow if available.
2. Revert faulty code using a new Git commit or the repository's Revert action; avoid rewriting history.
3. Code rollback does **not** automatically roll back database migrations. Restore database only using a rehearsed and compatible database backup/rollback plan.
4. If the assistant causes unexpected cost/abuse, set `AI_ASSISTANT_ENABLED=false` in the relevant Vercel environment and redeploy.
5. If a credential is exposed, rotate it at the provider and Vercel; do not only delete it from the latest file.
