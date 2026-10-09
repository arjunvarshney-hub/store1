# SHRI JI COLLECTION — Admin setup and login recovery

## Why the admin page may reject a successful login
The admin API deliberately checks `public.admin_users`. Creating a normal customer account does **not** automatically grant admin rights. Sign in to the store admin page with the intended admin account first; then add that account to the allow-list using the SQL below.

## Grant admin access to one account
1. Create the account at `/account.html` (or use an existing account).
2. Confirm the email if Supabase email confirmation is enabled.
3. Open Supabase Dashboard → SQL Editor.
4. Replace `YOUR_ADMIN_EMAIL@example.com` in the SQL with the exact email address of the account you control, then run it:

```sql
insert into public.admin_users (user_id)
select id
from auth.users
where lower(email) = lower('YOUR_ADMIN_EMAIL@example.com')
on conflict (user_id) do nothing;

-- Verify that the account was added:
select u.email, a.user_id, a.created_at
from public.admin_users a
join auth.users u on u.id = a.user_id
where lower(u.email) = lower('YOUR_ADMIN_EMAIL@example.com');
```

If the verification query returns no row, confirm that the account exists in Supabase Authentication → Users and that the email is spelled correctly. Never insert a random UUID. Do not add a public “make me admin” button or expose the service-role key.

## Vercel environment variables
The server needs `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or `SUPABASE_PUBLISHABLE_KEY`) and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key must only exist in Vercel server environment variables; never put it in HTML, GitHub, or a browser screenshot. After changing environment variables, redeploy the project.

## Image uploads
The `product-images` Supabase Storage bucket must exist. The included `supabase.sql` creates it if missing. Product photos must be JPG, PNG or WebP and no larger than 4 MB each.

## User login checklist
- Use the exact email and password used during sign-up.
- If email confirmation is enabled, open the Supabase confirmation email before login.
- If login says credentials are invalid, verify the user exists under Supabase → Authentication → Users and reset/confirm the account in Supabase as appropriate.
- Keep customer accounts and admin privileges separate.

## Deploying these files
Replace `public/admin.html`, `public/account.html`, and `api/auth/login.js` in the existing `sjc_audit` folder with the versions in this bundle, and add this `ADMIN_SETUP.md`. Commit the changes to `main`, then wait for Vercel to deploy that new commit. Ensure the deployment you want is assigned to Production before testing the production domain.

This bundle improves the UI and error handling, but it cannot verify your live Supabase project or grant admin access by itself. The SQL allow-list step and live login/product/order tests are required.
