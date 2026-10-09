# SHRI JI COLLECTION: online store

Thakur Ji Poshak & Ladies Wear, Sarai Tareen (Sambhal). Vercel (static pages + serverless API) · Supabase (Auth, Postgres, Storage) · Razorpay (UPI / Google Pay / cards) + Cash on Delivery.

The owner manages everything from **/admin** on a phone. No code editing is needed.

```
public/            static pages (cart, checkout, account, admin), CSS, browser JS
  js/              common.js, cart.js, checkout.js, account.js, admin.js, product.js
                   categories.js + render.js are shared by browser AND server
api/               Vercel serverless functions (files starting with _ are helpers, not routes)
  page.js          server-rendered home / shop / category / product pages (SEO)
  orders.js        create order (server prices, atomic stock reservation)
  verify-payment.js, pay.js, razorpay-webhook.js   payments
  admin/           products, orders, upload-image (admin only)
  auth/            signup, login, logout, me, reset-request, update-password
supabase.sql       full database schema, Row Level Security, order/payment functions, storage bucket
vercel.json        routing, security headers, daily clean-up cron
tests/             unit + API tests (npm test) and a browser E2E suite (npm run test:e2e)
```

## 1. Environment variables

**There are no public (browser) variables.** The website never receives a key; it calls `/api/*` only. (Razorpay's *Key ID* is public by design and is returned by the server at checkout time.)

### PRIVATE, server-side only (Vercel → Settings → Environment Variables)
| Name | Where to get it |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | same page → `service_role` key. **SECRET. Bypasses all security rules** |
| `SUPABASE_ANON_KEY` | same page → `anon` / publishable key |
| `RAZORPAY_KEY_ID` | Razorpay Dashboard → Settings → API Keys (`rzp_test_…` first, `rzp_live_…` later) |
| `RAZORPAY_KEY_SECRET` | same page. **SECRET** |
| `RAZORPAY_WEBHOOK_SECRET` | the secret *you type* when creating the webhook (step 4) |
| `CRON_SECRET` | any long random string (protects the nightly clean-up job) |
| `SITE_URL` | your final address, e.g. `https://www.shrijicollection.in` (no trailing `/`) |
| `SHIPPING_FLAT` *(optional)* | delivery charge in ₹ (default `0` = free) |
| `FREE_SHIPPING_ABOVE` *(optional)* | order value above which delivery is free |

Never commit a real `.env`; `.gitignore` already excludes it. See `.env.example`.

## 2. Supabase setup (one time)
1. Create a project at supabase.com (choose a region near India, e.g. Mumbai).
2. **SQL Editor → New query →** paste all of `supabase.sql` → **Run**. It is safe to run again; it also upgrades the old v1 schema.
3. **Authentication → Providers → Email:** enabled. Decide on **Confirm email**:
   * ON (recommended): customers must click the link in their email before logging in. The site shows the right messages.
   * OFF: customers are logged in immediately after signup.
4. **Authentication → URL Configuration:** *Site URL* = your `SITE_URL`; add `https://YOUR-DOMAIN/account` (and your `*.vercel.app` address while testing) to *Redirect URLs*. Without this, confirmation / reset-password links will not work.
5. **Authentication → SMTP:** Supabase's built-in email is limited to a few emails per hour. For real customers set up custom SMTP (Resend, Brevo, etc.).
6. Create **your own account** on the website (`/account` → Create account, confirm the email). Then in Supabase **Authentication → Users** copy your user's UUID and run:
   ```sql
   insert into public.admin_users(user_id) values ('PASTE-YOUR-USER-UUID');
   ```
   Only people in `admin_users` can open `/admin` or call admin APIs. Verify: Storage → bucket `product-images` exists and is **Public**.
7. Authentication → Policies/Rate limits: keep Supabase's defaults (they throttle login/signup attempts).

## 3. Razorpay setup
1. Create a Razorpay account. Start with **Test Mode** keys → put them in the variables above.
2. Dashboard → **Settings → Webhooks → Add**: URL `https://YOUR-DOMAIN/api/razorpay-webhook`, secret = `RAZORPAY_WEBHOOK_SECRET`, events: **`payment.captured`, `order.paid`, `payment.failed`**.
3. UPI and Google Pay appear inside Razorpay Checkout automatically **only if enabled for your merchant account** (Dashboard → Settings → Payment Methods). Live mode needs completed KYC.
4. Test with Razorpay's test cards / `success@razorpay` UPI ID, then swap in `rzp_live_` keys and redeploy.

How payment safety works: the server computes the amount from database prices and creates the Razorpay order; after payment the server verifies Razorpay's signature (and the webhook confirms independently) before the order is marked **paid**. The browser saying "success" never marks anything paid. Webhook events are de-duplicated. `payment_status` (pending / paid / failed / cancelled) is separate from `order_status`.

## 4. Deploy: GitHub → Vercel
1. **GitHub:** create a *private* repository. Upload this folder's contents (GitHub web → *Add file → Upload files*), or:
   ```bash
   git init && git add . && git commit -m "SHRI JI COLLECTION v2"
   git branch -M main && git remote add origin https://github.com/YOU/shri-ji-collection.git && git push -u origin main
   ```
2. **Vercel:** vercel.com → *Add New → Project* → import the GitHub repo. Framework preset: **Other**. Leave build command empty. Output directory is already `public` (from `vercel.json`).
3. **Environment variables:** *Settings → Environment Variables* → add every variable from section 1 for *Production* (and *Preview* if you want). Click **Deploy** (or *Redeploy* after adding variables).
4. **Custom domain:** Vercel → project → *Settings → Domains → Add* → follow the DNS instructions at your domain provider (an `A` record to `76.76.21.21` for the root domain and a `CNAME` to `cname.vercel-dns.com` for `www`; Vercel shows the exact values). Then set `SITE_URL` to the final address, redeploy, and update Supabase *Site URL / Redirect URLs* and the Razorpay webhook URL.
5. Region is set to Mumbai (`bom1`) in `vercel.json`, close to Supabase's Mumbai region.

## 5. Test the live site (checklist)
1. Open the site: home page lists categories; `/robots.txt` and `/sitemap.xml` open.
2. Sign up / log in / log out with a normal customer email.
3. `/admin` as customer → "Access denied". As owner → Products tab opens.
4. Add a product **from your Android phone** (camera or gallery photos) → it appears on the home page, its category page and `/shop` within about a minute.
5. Add to cart → checkout → **COD** order → appears in My Orders and in Admin → Orders.
6. Place an **online** order with Razorpay test credentials → status becomes *Paid / Confirmed*; check the webhook shows "delivered" in Razorpay dashboard.
7. In Admin → change an order to Packed → Shipped → Delivered; customer sees the status. Cancelling returns stock.
8. Run Google PageSpeed on a product page.

## 6. Google Search Console (after deployment)
1. search.google.com/search-console → **Add property → URL prefix** (or Domain) → your `SITE_URL`.
2. Verify: for Domain, add the DNS TXT record Google shows; for URL prefix, choose the HTML-tag method and ask to add the tag to the pages (or use DNS).
3. **Sitemaps →** submit `sitemap.xml`.
4. **URL Inspection →** paste your home page → *Request indexing*; repeat for a few category pages.
5. Create a free **Google Business Profile** for the shop (needed for "near me" / Sarai Tareen / Sambhal searches). Content on the site can't replace it.
6. Product structured data can be checked with Google's Rich Results Test. No ratings or reviews are published, and none are invented.
Ranking for "SHRI JI COLLECTION", "Thakur Ji Poshak" etc. takes weeks. Add real products with good names and photos regularly.

## 7. Everyday use (owner)
* **/admin → Products → + Add product:** pick category, price (and optional sale price), stock, sizes (tap the quick buttons), material, description, then choose photos. Photos are shrunk on the phone, previewed, and uploaded when you tap **Save**. First photo is the cover; "Make cover" changes it.
* **Visible switch** hides a product without deleting it. Stock 0 shows "Sold out".
* **Orders:** search by order no./name/phone, filter by status/payment, open an order to see address, items and payment; tap a status to update. COD orders become *paid* when marked Delivered.
* Unpaid online orders are cancelled automatically after 24 h and their stock is released (nightly job).

## 8. Local development
```bash
npm install
npm test            # unit + API tests, no network or database needed
npm run test:e2e    # browser tests with an in-memory fake database (needs Python Playwright + Chromium)
npx vercel dev      # run against your real Supabase (needs .env values)
```

## Known limitations
See `CHANGELOG.md` → "Not done / needs live verification" and `AUDIT.md`.
