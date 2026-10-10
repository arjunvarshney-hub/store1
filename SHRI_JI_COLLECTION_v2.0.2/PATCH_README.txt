SHRI JI COLLECTION — MOBILE LAYOUT FIX PATCH

This patch targets the EXISTING project after PR #2 (Premium Layout + AI Assistant) was merged.
It is not pushed to GitHub and is not deployed to Vercel yet.

FILES (relative to the SHRI_JI_COLLECTION_v2.0.2 project root)
- public/style.css
- tests/mobile-layout.test.mjs
- CHANGELOG.md
- MOBILE_LAYOUT_FIX.md

APPLY FROM GITHUB WEB UI
1. Open https://github.com/arjunvarshney-hub/store1
2. Create a new branch from the latest main, e.g. fix/mobile-layout.
3. Navigate to SHRI_JI_COLLECTION_v2.0.2 on that branch.
4. Click Add file > Upload files.
5. Extract this ZIP. Upload the public folder, tests folder, CHANGELOG.md and
   MOBILE_LAYOUT_FIX.md into the SHRI_JI_COLLECTION_v2.0.2 folder so paths remain
   exactly as listed above. Do not upload the README itself into the project unless wanted.
6. Commit on fix/mobile-layout, not directly on main.
7. Wait for Vercel PREVIEW. Test actual product pictures and assistant chat at
   320, 360, 390 and 430 CSS-pixel widths, landscape and desktop.
8. If Preview looks correct, then create a pull request into main and merge.

FIXES
- Stack hero action buttons on phones so their labels no longer squeeze into narrow columns.
- Tighten 320–359px header sizing while leaving drawer search available.
- Preserve full department garment/poshak images rather than cropping them.
- Make the AI assistant button compact on phone screens and keep its chat panel within the viewport.
- Improve product card spacing on phones; preserve original wider-screen layout.

LOCAL VALIDATION
- Unit/API and targeted layout tests: 44 passed, 0 failed.
- Headless Chromium CSS/layout mock tested at 320x700, 360x780, 390x844,
  430x932, 844x390 landscape, 768x1024 and 1280x900.
- The document did not horizontally overflow at those tested viewport widths.
- These checks used a local server-rendered mock catalogue, not the live Vercel site or
  a physical Android device. Please verify the real Preview before merging.

No database, product/order data, payment, API route or Vercel configuration is changed.
No GitHub commit, Supabase migration or production deployment was performed by this patch.
