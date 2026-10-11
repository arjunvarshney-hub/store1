import "./helpers.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import * as v from "../api/_validate.js";
import { verifyCheckoutSignature, verifyWebhookSignature } from "../api/_razorpay.js";
import { esc, effPrice, safeUrl, cardHtml } from "../public/js/render.js";
import { CATEGORIES, LEGACY_CATEGORIES, GROUPS } from "../public/js/categories.js";
import { deliveryCharge } from "../api/_lib.js";
import { notificationPayload } from "../api/_notifications.js";
import { productPage, listingPage, homePage } from "../api/_layout.js";

const throwsStatus = (fn, status = 400) => assert.throws(fn, (e) => e.status === status);
const PFX = "https://abc.supabase.co/storage/v1/object/public/product-images/";
const goodCustomer = { name: "Ram Kumar", phone: "+91 99278 92667", email: "R@Example.com", address: "House 4, Tirth Mandir road", city: "Sambhal", state: "Uttar Pradesh", pincode: "244303" };

test("categories: primary taxonomy is visible and removed ladies categories remain legacy-only", () => {
  assert.equal(CATEGORIES.length, 14); assert.equal(GROUPS.length, 2);
  assert.equal(CATEGORIES.filter(c => c.group === "thakur-ji-poshak").length, 10);
  assert.equal(CATEGORIES.filter(c => c.group === "ladies-wear").length, 4);
  for (const n of ["Laddu Gopal Poshak", "Mukut", "Thakur Ji Shringar", "Mala and Necklace", "Kurti", "Suit", "Dupatta", "Plazo"]) assert.ok(CATEGORIES.some((c) => c.name === n), n);
  for (const n of ["Fall and Astar", "Maxi", "Gown", "Saree", "Dress Material"]) {
    assert.ok(!CATEGORIES.some(c => c.name === n), `${n} must be hidden from customer category lists`);
    assert.ok(LEGACY_CATEGORIES.some(c => c.name === n), `${n} must be preserved for admin reassignment`);
  }
});
test("server-side delivery policy has correct boundary values", () => {
  for (const [subtotal, expected] of [[0, 50], [300, 50], [498.99, 50], [499, 40], [799, 40], [999.99, 40], [1000, 0], [2000, 0]]) assert.equal(deliveryCharge(subtotal), expected, `subtotal ${subtotal}`);
});

 test("migration protects package stock, exact delivery tiers and expanded order stages", () => {
  const sql = fs.readFileSync(new URL("../migrations/20261011_catalog_delivery_variants.sql", import.meta.url), "utf8");
  assert.match(sql, /v_sub >= 1000 then 0 when v_sub >= 499 then 40 else 50/);
  assert.match(sql, /v_need_stock := v_qty \* v_pack/);
  assert.match(sql, /stock_restored then return/);
  assert.match(sql, /out_for_delivery/);
  assert.match(sql, /check \(order_status in \('pending','confirmed','processing','packed','shipped','out_for_delivery','delivered','cancelled'\)\) not valid/);
  assert.match(sql, /unique index if not exists order_returns_one_active_item/);
});

test("migration includes a separate audited cancellation-request flow and blocks paid-order cancellation without refund", () => {
  const sql = fs.readFileSync(new URL("../migrations/20261011_catalog_delivery_variants.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.order_cancellation_requests/);
  assert.match(sql, /order_cancellation_requests_one_pending/);
  assert.match(sql, /raise exception 'REFUND_REQUIRED'/);
  assert.match(sql, /Record verified Razorpay payment transitions in the order timeline/);
  assert.match(sql, /PAYMENT_ALREADY_USED/);
  assert.match(sql, /payment_received_after_cancellation/);
  assert.match(sql, /cancel_requested/);
  assert.match(sql, /order_status in \('pending','confirmed','processing','packed','shipped','out_for_delivery','delivered','cancelled'\)/);
  const email = notificationPayload({ id: 1, order_number: "SJC-1", customer_name: "<img src=x>", phone: "9000000000", items: [], total: 10 }, "cancel_requested", { reason: "<script>x</script>" });
  assert.match(email.subject, /cancellation requested/i);
  assert.ok(!email.html.includes("<script>x</script>") && email.html.includes("&lt;script&gt;x&lt;/script&gt;"));
  assert.ok(email.html.includes("&lt;img src=x&gt;"));
});

test("customer validation: normalises phone/email, rejects bad input", () => {
  const c = v.customer(goodCustomer);
  assert.equal(c.phone, "9927892667"); assert.equal(c.email, "r@example.com");
  throwsStatus(() => v.customer({ ...goodCustomer, phone: "12345" }));
  throwsStatus(() => v.customer({ ...goodCustomer, pincode: "0123" }));
  throwsStatus(() => v.customer({ ...goodCustomer, name: "A" }));
  throwsStatus(() => v.customer({ ...goodCustomer, address: "short" }));
  throwsStatus(() => v.customer({ ...goodCustomer, email: "not-an-email" }));
  throwsStatus(() => v.customer(null));
  throwsStatus(() => v.customer({ ...goodCustomer, name: { $ne: 1 } }));
});
test("order items: only ids/qty/size are accepted; qty bounds enforced", () => {
  assert.deepEqual(v.orderItems([{ productId: "5", qty: 2, size: "M", price: 1 }]), [{ productId: 5, qty: 2, size: "M" }]);   // client price is dropped
  throwsStatus(() => v.orderItems([])); throwsStatus(() => v.orderItems([{ productId: 1, qty: 0 }]));
  throwsStatus(() => v.orderItems([{ productId: 1, qty: 101 }])); throwsStatus(() => v.orderItems([{ productId: -1, qty: 1 }]));
  throwsStatus(() => v.orderItems([{ productId: 1, qty: 1.5 }])); throwsStatus(() => v.orderItems(Array(21).fill({ productId: 1, qty: 1 })));
});
test("product validation: whitelist, category, sale<price, image host", () => {
  const ok = { name: "Red Velvet Poshak", category: "laddu-gopal-poshak", price: 500, sale_price: 399, stock: 5, sizes: "1, 2, 3", image_urls: [PFX + "products/a.jpg"], active: "true", evil: "x", id: 99 };
  const p = v.product(ok, PFX);
  assert.deepEqual(p.sizes, ["1", "2", "3"]); assert.equal(p.evil, undefined); assert.equal(p.id, undefined); assert.equal(p.active, true);
  throwsStatus(() => v.product({ ...ok, category: "weapons" }, PFX));
  throwsStatus(() => v.product({ ...ok, sale_price: 600 }, PFX)); throwsStatus(() => v.product({ ...ok, price: 0 }, PFX));
  throwsStatus(() => v.product({ ...ok, price: -5 }, PFX)); throwsStatus(() => v.product({ ...ok, stock: -1 }, PFX));
  throwsStatus(() => v.product({ ...ok, image_urls: ["javascript:alert(1)"] }, PFX));
  throwsStatus(() => v.product({ ...ok, image_urls: ["https://evil.example/x.jpg"] }, PFX));
  throwsStatus(() => v.product({ ...ok, image_urls: Array(9).fill(PFX + "a.jpg") }, PFX));
});
test("rich text sanitization preserves allowed formatting and removes script/event attributes", () => {
  const html = v.sanitizeRichText('<h2>Highlights</h2><p><strong>Gold</strong> <em>finish</em></p><ul><li>Daily use</li></ul><img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:alert(1)" onclick="x()">bad link</a>');
  assert.match(html, /<h2>Highlights<\/h2>/); assert.match(html, /<strong>Gold<\/strong>/); assert.match(html, /<ul><li>Daily use<\/li><\/ul>/);
  assert.ok(!/script|onerror|onclick|javascript:/i.test(html));
});
test("product validator supports safe variants, pack quantities, specifications and item return policy", () => {
  const body = { name: "Laddu Gopal Necklace", category: "mala", price: 120, stock: 8, image_urls: [], active: true,
    variants: [{ id: "red-pack-3", label: "Red · Pack of 3", sku: "NK-RED-3", price: 120, sale_price: 100, stock: 6, pack_quantity: 3, min_order_qty: 2, attributes: { Colour: "Red", "Pack Size": "Pack of 3" }, active: true }],
    specifications: [{ label: "Colour", value: "Red" }], return_eligible: true, return_window_days: 7 };
  const p = v.product(body, PFX); assert.equal(p.stock, 6); assert.equal(p.variants[0].pack_quantity, 3); assert.equal(p.variants[0].min_order_qty, 2); assert.equal(p.specifications[0].label, "Colour"); assert.equal(p.return_eligible, true); assert.equal(p.return_window_days, 7);
  throwsStatus(() => v.product({ ...body, variants: [{ ...body.variants[0], sale_price: 130 }] }, PFX));
  throwsStatus(() => v.product({ ...body, variants: [{ ...body.variants[0], pack_quantity: 0 }] }, PFX));
});
test("image magic bytes: jpg/png/webp pass; svg/html/exe rejected", () => {
  assert.equal(v.imageKind(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)])).ext, "jpg");
  assert.equal(v.imageKind(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)])).ext, "png");
  assert.equal(v.imageKind(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(8)])).ext, "webp");
  assert.equal(v.imageKind(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')), null);
  assert.equal(v.imageKind(Buffer.from("<html><script>alert(1)</script></html>")), null);
});
test("razorpay signatures verify correctly and reject tampering", () => {
  const secret = "s3cret", sig = crypto.createHmac("sha256", secret).update("order_A1b2C3d4|pay_X9y8Z7w6").digest("hex");
  assert.ok(verifyCheckoutSignature("order_A1b2C3d4", "pay_X9y8Z7w6", sig, secret));
  assert.ok(!verifyCheckoutSignature("order_A1b2C3d4", "pay_OTHER00", sig, secret));
  assert.ok(!verifyCheckoutSignature("order_A1b2C3d4", "pay_X9y8Z7w6", sig.slice(0, -1) + "0", secret));
  assert.ok(!verifyCheckoutSignature("order_A1b2C3d4", "pay_X9y8Z7w6", "", secret));
  assert.ok(!verifyCheckoutSignature("order_A1b2C3d4", "pay_X9y8Z7w6", sig, ""));         // no secret configured => never valid
  const body = Buffer.from('{"event":"payment.captured"}'), ws = crypto.createHmac("sha256", "w").update(body).digest("hex");
  assert.ok(verifyWebhookSignature(body, ws, "w")); assert.ok(!verifyWebhookSignature(Buffer.from("{}"), ws, "w")); assert.ok(!verifyWebhookSignature(body, undefined, "w"));
});
test("render: escaping + safe URLs + price logic", () => {
  assert.equal(esc(`<img src=x onerror="a('b')">`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;");
  assert.equal(safeUrl("javascript:alert(1)"), ""); assert.equal(safeUrl("data:text/html,x"), ""); assert.equal(safeUrl("//evil.com/x"), ""); assert.equal(safeUrl("https://a.b/c.jpg"), "https://a.b/c.jpg");
  assert.equal(effPrice({ price: 500, sale_price: 399 }), 399); assert.equal(effPrice({ price: 500, sale_price: 600 }), 500); assert.equal(effPrice({ price: 500, sale_price: null }), 500);
});
const prod = { id: 7, slug: "red-poshak-7", name: `Red <script>alert(1)</script> Poshak`, category: "laddu-gopal-poshak", price: 500, sale_price: 400, description: "Soft velvet\n<b>x</b>", material: "Velvet", sizes: ["1", "2"], image_urls: ["https://abc.supabase.co/storage/v1/object/public/product-images/products/a.jpg", "javascript:alert(1)"], stock: 3 };
test("SSR product page: XSS escaped, JSON-LD valid, no invented ratings", () => {
  const html = productPage("https://shop.test", prod, [prod]);
  assert.ok(!html.includes("<script>alert(1)</script>")); assert.ok(!html.includes('src="javascript:'));
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const p = ld.find((x) => x["@type"] === "Product");
  assert.equal(p.offers.price, "400.00"); assert.equal(p.offers.priceCurrency, "INR"); assert.equal(p.offers.availability, "https://schema.org/InStock");
  assert.ok(!("aggregateRating" in p) && !("review" in p));
  assert.ok(html.includes('<link rel="canonical" href="https://shop.test/product/red-poshak-7">'));
  assert.match(html, /<title>.*Buy Online \| SHRI JI COLLECTION<\/title>/);
});
test("SSR listing/home: canonical, noindex on search, product links", () => {
  const l = listingPage("https://shop.test", { products: [prod], total: 1, page: 1, pageSize: 24, category: "kurti", q: "", sort: "new" });
  assert.ok(l.includes('href="https://shop.test/category/kurti"') && l.includes("/product/red-poshak-7") && l.includes('content="index,follow"'));
  const s = listingPage("https://shop.test", { products: [], total: 0, page: 1, pageSize: 24, q: `"><script>x</script>`, sort: "new" });
  assert.ok(s.includes('content="noindex,follow"') && !s.includes("<script>x</script>"));
  const h = homePage("https://shop.test", { products: [prod] });
  assert.ok(h.includes("ClothingStore") && h.includes("Sarai Tareen") && h.includes("244303"));
  assert.ok(cardHtml(prod).includes("/product/red-poshak-7"));
});

test("product ratings: real averages render on cards; no reviews are not fabricated", () => {
  const rated = cardHtml({ ...prod, review_count: 3, average_rating: 4.7 });
  assert.match(rated, /4\.7/); assert.match(rated, /3 reviews/); assert.match(rated, /★/);
  const unrated = cardHtml({ ...prod, reviews_enabled: true, review_count: 0, average_rating: null });
  assert.match(unrated, /No reviews yet/); assert.doesNotMatch(unrated, /0\.0/);
  assert.match(cardHtml({ ...prod, reviews_enabled: false, review_count: 0 }), /Ratings coming soon/);
});

test("SSR reviews: approved customer text is escaped and only real aggregates enter Product JSON-LD", () => {
  const reviews = [{ id: 1, product_id: 7, customer_name: "Neha <script>alert(1)</script>", rating: 5, comment: "Beautiful product <img src=x onerror=alert(1)>", created_at: "2026-10-09T10:00:00.000Z" }];
  const html = productPage("https://shop.test", prod, [], {}, { configured: true, reviews, summary: { count: 1, average: 5 } });
  assert.ok(html.includes("Ratings &amp; reviews")); assert.ok(html.includes("Write a review"));
  assert.ok(!html.includes("<script>alert(1)</script>")); assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  const ld = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]));
  const p = ld.find((x) => x["@type"] === "Product");
  assert.equal(p.aggregateRating.ratingValue, "5.0"); assert.equal(p.aggregateRating.reviewCount, "1");
  assert.equal(p.review[0].reviewRating.ratingValue, 5);
});
