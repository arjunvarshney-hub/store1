# Database migration guide

Your screenshot showed an existing `public.orders` table with UUID `id` and legacy columns (`status`, `total`, etc.). The previous SQL expected `order_number`, `order_status`, `payment_status`, and `user_id`, causing the `user_id does not exist` failure.

This version adds missing order columns using `ADD COLUMN IF NOT EXISTS`, backfills an order number for existing rows, maps old `status` into `order_status`, and preserves existing order rows. It does not drop/recreate `public.orders`.

Before running:
1. Take a Supabase database backup.
2. Test on a staging/branch project if possible.
3. Run the complete `supabase.sql` script.
4. If any error occurs, stop and share the exact error; do not keep running partial snippets.
5. After success, verify table columns and test a COD order before enabling online payment.

Important: the migration cannot be live-verified from this package. If your existing products table exists with a different ID type or incompatible columns, the migration may need a targeted adjustment. Inspect your actual schema first.
