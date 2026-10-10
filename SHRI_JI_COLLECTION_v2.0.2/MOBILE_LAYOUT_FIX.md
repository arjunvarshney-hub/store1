# SHRI JI COLLECTION — Mobile layout correction

## What was wrong

A local responsive-browser check of the merged layout showed the hero CTA buttons occupying two narrow columns at common Android widths. The labels wrapped to multiple lines (the “Shop Thakur Ji Poshak” label was especially cramped). The floating “Need help?” pill also occupied a wide area over the storefront while users scrolled product cards. Department artwork was using `object-fit: cover`, which could crop long garment/poshak photos inside the split cards. The narrowest tested header also needed a compact fallback.

## Changes in this patch

- On screens up to 599 CSS px, stacks the hero CTAs into two full-width buttons with consistent height and spacing.
- Keeps the existing desktop CTA layout unchanged.
- Reduces header pressure on 320–359px phones by tightening logo/actions and hiding only the redundant quick-search icon; search remains available inside the navigation drawer.
- Shows full department product art using `object-fit: contain`, rather than cropping garment/poshak edges.
- Tightens mobile department cards and product metadata without changing product/cart logic.
- Changes the mobile assistant launcher from a wide text pill to a compact 48px circular control; its existing `aria-label` remains available to assistive technologies.
- Gives the open assistant panel a better viewport/safe-area fit on Android, including landscape screens.

## Files changed

- `public/style.css`
- `tests/mobile-layout.test.mjs`
- `CHANGELOG.md`

No product/order data, Supabase schema, payments, API routes, or deployment configuration are changed by this layout-only patch.

## Validation evidence

Using the existing server-rendered layout and a local mock catalogue in headless Chromium, I checked 320×700, 360×780, 390×844, 430×932, 844×390 (landscape), 768×1024 and 1280×900 viewports. The document root and body widths matched the viewport at all seven sizes (no horizontal overflow). At 320, 360, 390 and 430px, both hero CTA controls measured the available content width and 48px height. The mobile assistant launcher measured 48×48px, the landscape launcher 44×44px, and the open assistant panel stayed within the 390×844 viewport. At 768 and 1280px the original wider layout remains. These are local mock checks, not a real-device or production deployment test.

## Apply safely

Apply this patch to a new branch from current `main`, preview the deployment, and verify actual product photos and the assistant panel at the phone widths above. Do not change production again until Preview looks correct. This patch does not configure the AI provider key or apply the product reviews database migration.
