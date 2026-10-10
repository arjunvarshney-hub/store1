# Deployment checklist (simple English)

## 0. Know your repo layout
Your GitHub repo `store1` keeps the project **inside the folder `SHRI_JI_COLLECTION_v2.0.2/`**.
In Vercel → Project → Settings → General → **Root Directory** must be `SHRI_JI_COLLECTION_v2.0.2` (this could not be checked from here; please confirm). Production Branch should be `main`.

## 1. Before you upload (Preview first)
1. In GitHub, create a new **branch** (for example `assistant-update`) instead of changing `main` directly.
2. Upload / replace the changed files in that branch (see CHANGELOG for the file list).
3. Vercel automatically builds a **Preview** link for the branch (Deployments tab). Open it and test.
4. Only when everything is good: open a Pull Request and **Merge** to `main`. That is the production release. Do this only when you decide to go live.

## 2. Database (Supabase SQL Editor), in this order, once each
| File | Needed for | Safe to re-run |
|---|---|---|
| `supabase.sql` | base tables | yes |
| `migrations/20261010_product_reviews.sql` | customer reviews | yes |
| `migrations/20261011_review_abuse_controls.sql` | review spam limits | yes |
Before running anything: Supabase → Database → **Backups** (or Project Settings → Backups) and make sure a recent backup exists. These migrations only ADD things; they never delete or change products, orders or customers.
Preflight check (read only): `select count(*) from public.products; select count(*) from public.orders;` Note the numbers, run the migration, run the same lines again; they must be equal.
Rollback: the abuse-control file ends with a commented rollback. Code rollback does not undo database changes; the added column is harmless to old code.

## 3. Environment variables (Vercel)
See `.env.example`. Nothing new is required. `ANTHROPIC_API_KEY` is optional (assistant works without it).

## 4. Preview smoke test (do on your phone)
1. Home loads; categories strip; New arrivals; logo/picture from admin appear.
2. Open a product: gallery, size, Add to cart works; the round **Ask us** button hides while Add to cart is visible.
3. Cart → Checkout with COD (use a test order) → appears in My Orders and in /admin → Orders.
4. Product page: write a review → shows "sent for approval". /admin → **Reviews** → Approve → it appears with stars.
5. Chat: ask "kurti dikhao". Check the answer and product cards.
6. /admin → Site → Assistant: add one FAQ line, save, ask it in chat.
7. Razorpay: use **test keys** only on Preview.

## 5. Production release gate (needs YOUR approval)
* Do not use live Razorpay keys until test payments work on Preview.
* Paytm is **not** implemented. Do not announce it.
* After merging: watch Deployments until **Ready**, open the live site, repeat steps 1 to 6 quickly.

## 6. Rollback (if the live site breaks)
1. Vercel → Deployments → find the last deployment that worked → ⋯ → **Promote to Production** (instant).
2. Then, in GitHub, revert the faulty pull request (button **Revert** on the merged PR).
3. Database changes stay (they are additive and harmless).
