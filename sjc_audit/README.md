# SHRI JI COLLECTION — Hardened Store (database-compatible update)

IMPORTANT: This bundle now includes a compatibility migration for an existing legacy `public.orders` table whose primary key is UUID. It adds required columns and backfills legacy order numbers/statuses instead of dropping the table. Back up the database first and review the migration before running it.

## Install
1. Back up the Supabase project.
2. Open `supabase.sql`, review it, then run the whole script in Supabase SQL Editor. It is intended to be re-runnable, but always test on a backup/staging project first.
3. Configure Vercel environment variables using `.env.example` as a checklist. Never commit secrets.
4. Deploy the `sjc_audit` directory as the Vercel project root (the directory containing `package.json` and `vercel.json`).
5. Create a customer account, then add its auth UUID to `public.admin_users(user_id)` to grant admin access.
6. Test COD first, then Razorpay test mode and webhook delivery before production.

## Environment variables
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never expose to browser/GitHub)
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET` (server only)
- `PUBLIC_RAZORPAY_KEY_ID`
- `RAZORPAY_WEBHOOK_SECRET`

## Tests
Run `npm test` after installing dependencies. Automated source-level tests do not replace a live Supabase/Razorpay integration test.

## Known limitations / launch blockers
- SQL migration has not been run against your live Supabase project from this environment. Review/backup and test on a staging project first.
- No real Razorpay payment was performed here.
- Online pending-payment timeout and automatic stock release are not implemented.
- Online refund is manual; captured online orders are blocked from cancellation until refunded.
- Customer account history only includes orders placed while authenticated; guest order lookup is not implemented.
- Set the real production domain in `public/sitemap.xml` and `public/robots.txt`.
- Perform browser-based end-to-end tests and a live security review before launch.


## Admin panel setup
See [ADMIN_SETUP.md](ADMIN_SETUP.md) for admin login, allow-list setup, and user login troubleshooting.


## Important recovery notes (October 2026)
- The SQL migration now creates `public.orders` if it is absent and preserves an existing table. Take a Supabase backup before running it.
- Vercel static routing points to `/index.html` and root-level static assets rather than `/public/...`.
- Do not put service-role or Razorpay secret keys in browser files or GitHub. Configure them only in Vercel Environment Variables.
- After deploying, run the checks in `LAUNCH_AUDIT.md`; deployment status alone does not prove auth, product uploads, orders, or payments work.
