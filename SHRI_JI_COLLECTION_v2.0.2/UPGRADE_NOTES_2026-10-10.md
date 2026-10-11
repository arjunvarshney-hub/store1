# SHRI JI COLLECTION — local upgrade notes (2026-10-10)

## Implemented in this package
- Homepage headline and primary CTA prioritize Thakur Ji Poshak & Shringar.
- Customer-facing category navigation and catalogue hide retired Ladies Wear categories: Dress Material, Maxi, Gown, Fall and Astar, and Saree.
- Existing legacy category records remain in the database and remain editable in Admin; they are not deleted. Reassign these products to a public category before they can appear in the customer catalogue again.
- Added Other Thakur Ji Accessories.
- Delivery: subtotal below ₹499 = ₹50; ₹499–₹999.99 = ₹40; ₹1,000+ = free. Client estimates and database order creation use the same tiers.
- Admin product list supports combined search, category/visibility/stock/sale filters, sorting, and clear filters.
- A product referenced by historical order item JSON is archived rather than hard-deleted.
- Mobile CSS regression checks and delivery/category unit tests.

## Verification
- `npm test`: 41 passed, 0 failed.
- `node --check` for all JS files: passed.
- `vercel.json` JSON parse: passed.
- Live Supabase, Vercel, Razorpay, email delivery, and browser E2E were not tested.

## Existing Supabase project
1. Back up the database.
2. Run `migrations/20261010_delivery_tiers.sql` in Supabase SQL Editor.
3. Deploy this code after the migration succeeds.
4. Check test-mode checkout and confirm saved `orders.shipping` and `orders.total` at subtotals ₹498, ₹499, ₹999, and ₹1,000.

## Not yet implemented from the full requested scope
This package does not yet include the full per-variant inventory/pricing model, rich-text editor with server-side sanitization, product-specific returns workflow, category CRUD, transactional admin emails, or full customer tracking timeline. Do not treat these as live features until a further implementation and live validation are completed.
