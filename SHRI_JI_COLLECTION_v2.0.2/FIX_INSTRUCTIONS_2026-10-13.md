# SHRI JI COLLECTION — Admin panel fix

## What was fixed in this package

- Category API queries now target the existing `public.product_categories` table instead of `public.categories`, which was returning 404 in Supabase.
- Category inserts set `is_legacy = false`.
- Added an additive SQL migration for the missing `public.product_variants` table.
- All 70 automated Node tests pass.

## Apply the fix

1. Keep a backup of your current GitHub repository.
2. Upload/replace the repository contents with this ZIP's project folder (`SHRI_JI_COLLECTION_v2.0.2`) and commit the changes.
3. In Supabase → SQL Editor, run `migrations/20261013_fix_existing_catalog.sql` once. This creates the variants table required by variant editing; it does not drop existing tables or rows.
4. Wait for Vercel to finish deploying the commit.
5. Open `/admin`, sign in, and check Products and Categories.

## Important

This patch fixes the confirmed category table-name mismatch and adds the missing variants table. It was tested locally with the project's automated tests, but it has not been connected to or tested against your live Supabase/Vercel environment. If another schema mismatch appears during product creation/editing, capture the response from the browser Network tab or Supabase logs so it can be corrected against the live schema. Do not paste secret keys into chat.
