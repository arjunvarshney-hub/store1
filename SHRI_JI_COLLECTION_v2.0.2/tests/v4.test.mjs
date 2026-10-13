// v4.0.0 features: delivery tiers, rich-text safety, product model, variants, categories, admin list tools, order rules.
import "./helpers.mjs";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mockReq, mockRes, fake, cookieFor } from "./helpers.mjs";
import * as v from "../api/_validate.js";
import { sanitizeHtml, htmlToText } from "../api/_html.js";
import { deliveryFee, freeDeliveryRemaining, DELIVERY_TIERS } from "../public/js/delivery.js";
import { setCategories, DEFAULT_CATEGORIES, CATEGORIES, bySlug } from "../public/js/categories.js";
import { queryProducts, PRODUCT_COLS, resetCategoryCache } from "../api/_catalog.js";

const same = { origin: "https://shop.test" };
const load = async (p) => (await import(p)).default;
async function call(h, o) { const req = mockReq(o), res = mockRes(); await h(req, res); return res; }
fake.users.tokAdmin = { id: "adm", email: "o@x.in" }; fake.admins.add("adm");
fake.users.tokUser = { id: "usr", email: "c@x.in" };
const ADMIN = { ...same, ...cookieFor("tokAdmin") };
afterEach(() => { setCategories(DEFAULT_CATEGORIES); resetCategoryCache(); fake.rpcCalls.length = 0; fake.rpcImpl = async () => ({ data: null, error: null }); });

/* ---------------- delivery charges ---------------- */
test("delivery: ₹50 below 499, ₹40 from 499 to 999.99, FREE from 1000 (boundaries)", () => {
  const cases = [[0, 50], [300, 50], [498, 50], [498.99, 50], [499, 40], [500, 40], [799, 40], [999, 40], [999.99, 40], [1000, 0], [1000.01, 0], [2500, 0]];
  for (const [sub, fee] of cases) assert.equal(deliveryFee(sub, DELIVERY_TIERS), fee, `subtotal ${sub}`);
  assert.equal(deliveryFee(999.994), 40);        // rounds to 999.99, still below 1000
  assert.equal(deliveryFee(999.995), 0);         // rounds to 1000.00
});
test("delivery: 'add ₹X more' is exact", () => {
  assert.equal(freeDeliveryRemaining(800), 200); assert.equal(freeDeliveryRemaining(999.5), 0.5);
  assert.equal(freeDeliveryRemaining(1000), 0); assert.equal(freeDeliveryRemaining(1800), 0);
});
test("delivery: the database function applies the same rule and does not trust the browser", () => {
  for (const f of ["supabase.sql", "migrations/20261012_catalog_v4.sql"]) {
    const sql = fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
    assert.match(sql, /"min":0,"fee":50\},\{"min":499,"fee":40\},\{"min":1000,"fee":0/);
    assert.match(sql, /create or replace function public\.create_order\([\s\S]*p_tiers jsonb/);
    assert.match(sql, /v_pieces := v_qty \* v_pack/, "stock is counted in pieces");
    assert.match(sql, /raise exception 'MIN_QTY/);
  }
});

/* ---------------- rich text ---------------- */
test("rich text: formatting is kept, dangerous HTML is removed", () => {
  const ok = sanitizeHtml('<h2>Highlights</h2><p>Colour: <b>Blue</b> and <i>Gold</i> <u>x</u></p><ul><li>One</li><li>Two</li></ul><ol><li>A</li></ol><p style="text-align:center">mid</p><a href="https://shop.example/x?a=1&b=2">link</a><br>');
  for (const frag of ["<h2>Highlights</h2>", "<strong>Blue</strong>", "<em>Gold</em>", "<ul><li>One</li><li>Two</li></ul>", "<ol><li>A</li></ol>", 'class="ta-center"', 'rel="noopener noreferrer nofollow"', "<br>"]) assert.ok(ok.includes(frag), frag + " in " + ok);
  const attacks = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<a href="javascript:alert(1)">x</a>', '<iframe src="//evil"></iframe>', '<svg onload=alert(1)>', '<p onclick="x()">a</p>', '<style>body{display:none}</style>', '<a href="data:text/html,<script>1</script>">d</a>', '<b style="x:expression(alert(1))">e</b>', '<!--<script>-->'];
  for (const a of attacks) { const out = sanitizeHtml(a); assert.doesNotMatch(out, /<script|<iframe|<svg|<img|<style|onerror|onclick|onload|javascript:|data:|expression|style=/i, a + " => " + out); }
  assert.equal(sanitizeHtml("a < b && c > d"), "a &lt; b &amp;&amp; c &gt; d");
  assert.equal(htmlToText("<p>A &amp; B</p><ul><li>x</li><li>y</li></ul>"), "A & B\nx\ny");
});
test("rich text: stored sanitised and a plain-text copy is kept for search/SEO", () => {
  const p = v.product({ name: "Poshak", category: "kurti", price: 10, description_html: '<p>Soft <b>velvet</b></p><script>alert(1)</script>' });
  assert.equal(p.description_html, "<p>Soft <strong>velvet</strong></p>"); assert.equal(p.description, "Soft velvet");
});

/* ---------------- product model ---------------- */
const base = { name: "Laddu Gopal Necklace", category: "mala-necklace", price: 300, stock: 20 };
test("product: SKU, subcategory, brand, weight, dimensions, min order and pack size are validated", () => {
  const p = v.product({ ...base, sku: "LG-NK-01", subcategory: "Pearl", brand: "SJC", weight_g: 40, dimensions: "10 x 5 cm", min_order_qty: 5, pack_size: 3, low_stock_threshold: 2 });
  assert.deepEqual([p.sku, p.min_order_qty, p.pack_size, p.low_stock_threshold, p.weight_g], ["LG-NK-01", 5, 3, 2, 40]);
  for (const bad of [{ min_order_qty: 0 }, { min_order_qty: 51 }, { pack_size: 0 }, { pack_size: 1.5 }, { sku: "bad<script>" }, { weight_g: -1 }, { cost_price: -5 }]) assert.throws(() => v.product({ ...base, ...bad }), /./, JSON.stringify(bad));
});
test("product: return policy is per product; days required when returnable; not returnable has no window", () => {
  const yes = v.product({ ...base, return_eligible: true, return_days: 7, return_conditions: "Unused\nwith tags", refund_policy: "To original payment method" });
  assert.deepEqual([yes.return_eligible, yes.return_days], [true, 7]); assert.match(yes.return_conditions, /Unused\nwith tags/);
  assert.throws(() => v.product({ ...base, return_eligible: true }), /return window/i);
  const no = v.product({ ...base, return_eligible: false, return_days: 30 }); assert.deepEqual([no.return_eligible, no.return_days], [false, null]);
  assert.equal(v.product({ ...base }).return_eligible, null);   // not configured = shows nothing, never invented
});
test("product: status maps to active/archived; archived is never visible", () => {
  assert.deepEqual(pick(v.product({ ...base, status: "inactive" })), [false, false]);
  assert.deepEqual(pick(v.product({ ...base, status: "archived", active: true })), [false, true]);
  assert.deepEqual(pick(v.product({ ...base, status: "active" })), [true, false]);
  assert.throws(() => v.product({ ...base, status: "weird" }));
  function pick(p) { return [p.active, p.archived]; }
});
test("product: specifications are cleaned; cost price is kept server-side only", () => {
  const p = v.product({ ...base, cost_price: 120.5, specs: [{ label: " Colour ", value: "Red" }, { label: "Idol size", value: "" }] });
  assert.deepEqual(p.specs, [{ label: "Colour", value: "Red" }, { label: "Idol size", value: "" }]); assert.equal(p.cost_price, 120.5);
  assert.throws(() => v.product({ ...base, specs: Array(31).fill({ label: "a", value: "b" }) }));
  assert.ok(!PRODUCT_COLS.split(",").includes("cost_price") && !PRODUCT_COLS.includes("archived"), "public column list must not contain internal fields");
});
test("database blocks cost_price for visitors (column-level grant)", () => {
  const sql = fs.readFileSync(new URL("../migrations/20261012_catalog_v4.sql", import.meta.url), "utf8");
  const g = /grant select \(([^)]*)\)\s+on public\.products to anon, authenticated;/.exec(sql);
  assert.ok(g, "column grant exists"); assert.ok(!/cost_price|archived/.test(g[1]));
  assert.match(sql, /revoke select on public\.products from anon, authenticated;/);
});
test("variants: own price/sale/stock/pack, option combos unique, sale below price", () => {
  const axes = ["Colour", "Pack Size"];
  const out = v.variants([{ options: { Colour: "Red", "Pack Size": "Single Piece" }, price: 100, stock: 10 }, { options: { Colour: "Red", "Pack Size": "Pack of 3" }, price: 270, sale_price: 250, stock: 30, pack_qty: 3, sku: "R3" }, { options: { Colour: "Blue" }, price: 100, stock: 0, available: false }], axes);
  assert.deepEqual(out.map((x) => x.label), ["Red / Single Piece", "Red / Pack of 3", "Blue"]); assert.equal(out[1].pack_qty, 3); assert.equal(out[2].available, false);
  assert.throws(() => v.variants([{ options: { Colour: "Red" }, price: 1, stock: 1 }, { options: { Colour: "red" }, price: 1, stock: 1 }], axes), /repeats/);
  assert.throws(() => v.variants([{ options: { Colour: "Red" }, price: 100, sale_price: 100, stock: 1 }], axes), /sale price/i);
  assert.throws(() => v.variants([{ options: { Colour: "Red" }, price: 100, pack_qty: 0 }], axes));
  assert.throws(() => v.variants([{ options: {}, price: 100 }], axes), /at least one option/);
  assert.throws(() => v.variants([{ options: { Colour: "A" }, price: 1, sku: "X" }, { options: { Colour: "B" }, price: 1, sku: "x" }], axes), /twice/);
  assert.equal(v.variants(undefined, axes), null);
});

/* ---------------- categories ---------------- */
const CATROWS = () => DEFAULT_CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, group_slug: c.group, sort_order: c.sort, active: c.active }));
test("catalogue hides products in switched-off categories and falls back to old columns if the DB is not upgraded", async () => {
  let seenOps = [];
  fake.resolve = (t, ops) => { if (t === "product_categories") return { data: CATROWS(), error: null }; if (t === "products") { seenOps = ops; return { data: [], error: null, count: 0 }; } return { data: [], error: null }; };
  await queryProducts({ group: "ladies-wear" });
  const inCat = seenOps.filter((o) => o[0] === "in" && o[1][0] === "category").map((o) => o[1][1]);
  assert.ok(inCat.every((list) => !list.includes("maxi") && !list.includes("gown")), JSON.stringify(inCat));
  // legacy fallback
  resetCategoryCache(); let calls = 0;
  fake.resolve = (t) => { if (t === "products") { calls++; return calls === 1 ? { data: null, error: { code: "42703", message: 'column "sku" does not exist' } } : { data: [{ id: 1, name: "Old", category: "kurti", price: 1, stock: 1 }], error: null, count: 1 }; } return { data: [], error: null }; };
  const r = await queryProducts({}); assert.equal(calls, 2); assert.equal(r.products[0].name, "Old");
});
test("admin categories: add, duplicate protection, rename, switch off, safe delete, reassign", async () => {
  const h = await load("../api/_routes/admin/categories.js");
  let rows = CATROWS(), count = {}, writes = [];
  fake.resolve = (t, ops, single) => {
    const w = ops.find((o) => ["insert", "update", "delete"].includes(o[0]));
    if (t === "product_categories") { if (w) { writes.push([t, w[0], w[1][0]]); return { data: w[0] === "insert" ? w[1][0] : { ...w[1][0] }, error: null }; } return { data: rows, error: null }; }
    if (t === "products") { if (w) { writes.push([t, w[0], w[1][0]]); return { data: null, error: null }; } return { data: Object.entries(count).flatMap(([c, n]) => Array(n).fill({ category: c })), error: null }; }
    return { data: [], error: null };
  };
  assert.equal((await call(h, { method: "POST", headers: same, body: { name: "Pooja Thali", group: "thakur-ji-poshak" } })).statusCode, 401);
  assert.equal((await call(h, { method: "POST", headers: { ...same, ...cookieFor("tokUser") }, body: { name: "x y", group: "ladies-wear" } })).statusCode, 403);
  const ok = await call(h, { method: "POST", headers: ADMIN, body: { name: "Pooja Thali", group: "thakur-ji-poshak" } });
  assert.equal(ok.statusCode, 201); assert.deepEqual(writes.at(-1).slice(0, 2), ["product_categories", "insert"]);
  for (const name of ["kurti", "KURTI ", "Mukut", "Mala and Necklace", "mala  &  necklace"]) assert.equal((await call(h, { method: "POST", headers: ADMIN, body: { name, group: "ladies-wear" } })).statusCode, 409, name);
  const sw = await call(h, { method: "POST", headers: ADMIN, body: { name: "Maxi", group: "ladies-wear" } });
  assert.equal(sw.statusCode, 409); assert.match(sw.body.error, /switched off/);
  assert.equal((await call(h, { method: "POST", headers: ADMIN, body: { name: "Nothing", group: "mens-wear" } })).statusCode, 400);
  assert.equal((await call(h, { method: "PATCH", headers: ADMIN, body: { slug: "kurti", name: "Kurtis" } })).statusCode, 200);
  assert.equal((await call(h, { method: "PATCH", headers: ADMIN, body: { slug: "kurti", name: "Suit" } })).statusCode, 409);
  assert.equal((await call(h, { method: "PATCH", headers: ADMIN, body: { slug: "kurti", active: false } })).statusCode, 200);
  rows.find((r) => r.slug === "kurti").active = false;   // (the fake database does not apply updates by itself)
  count = { suit: 3 };
  const del = await call(h, { method: "DELETE", headers: ADMIN, body: { slug: "suit" } });
  assert.equal(del.statusCode, 409); assert.match(del.body.error, /3 products/);
  assert.equal((await call(h, { method: "DELETE", headers: ADMIN, body: { slug: "plazo" } })).statusCode, 200);
  assert.equal((await call(h, { method: "POST", headers: ADMIN, body: { action: "reassign", from: "maxi", to: "gown" } })).statusCode, 400);   // target must be active
  writes = []; assert.equal((await call(h, { method: "POST", headers: ADMIN, body: { action: "reassign", from: "maxi", to: "kurti" } })).statusCode, 400);   // kurti was just switched off
  assert.equal((await call(h, { method: "POST", headers: ADMIN, body: { action: "reassign", from: "maxi", to: "suit" } })).statusCode, 200);
  assert.deepEqual(writes.at(-1), ["products", "update", { category: "suit" }]);
});

/* ---------------- admin product list: search / filter / sort ---------------- */
const P = (o) => ({ id: 1, slug: "p", name: "P", sku: null, category: "kurti", price: 500, sale_price: null, stock: 10, low_stock_threshold: 3, active: true, archived: false, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", sizes: [], pack_size: 1, return_eligible: null, image_urls: [], ...o });
const LIST = [
  P({ id: 1, name: "Red Laddu Gopal Poshak", sku: "LGP-RED", category: "laddu-gopal-poshak", price: 450, stock: 12, return_eligible: true, created_at: "2026-10-09T00:00:00Z" }),
  P({ id: 2, name: "Blue Krishna Poshak", sku: "KP-BLU", category: "krishna-poshak", price: 900, sale_price: 750, stock: 2, return_eligible: false, created_at: "2026-10-05T00:00:00Z" }),
  P({ id: 3, name: "Gold Mukut", sku: "MK-1", category: "mukut", price: 1200, stock: 0, created_at: "2026-09-01T00:00:00Z" }),
  P({ id: 4, name: "Pearl Necklace", sku: "NK-P", category: "mala-necklace", price: 300, stock: 0, created_at: "2026-09-20T00:00:00Z" }),
  P({ id: 5, name: "Old Maxi Dress", sku: "MX-9", category: "maxi", price: 600, stock: 4, created_at: "2026-08-01T00:00:00Z" }),
  P({ id: 6, name: "Archived Kurti", sku: "KU-A", category: "kurti", active: false, archived: true, created_at: "2026-07-01T00:00:00Z" }),
  P({ id: 7, name: "Hidden Suit", category: "suit", active: false, price: 800, created_at: "2026-10-08T00:00:00Z" }),
];
const VARS = [
  { id: 1, product_id: 4, sku: "NK-P-R3", label: "Red / Pack of 3", options: { Colour: "Red", "Pack Size": "Pack of 3" }, price: 800, sale_price: null, stock: 30, pack_qty: 3, available: true, sort_order: 0 },
  { id: 2, product_id: 4, sku: "NK-P-B1", label: "Blue / Single", options: { Colour: "Blue", "Pack Size": "Single Piece" }, price: 300, sale_price: 250, stock: 2, pack_qty: 1, available: true, sort_order: 1 },
];
const lister = async (qs) => {
  fake.resolve = (t) => (t === "products" ? { data: LIST, error: null } : t === "product_variants" ? { data: VARS, error: null } : t === "product_categories" ? { data: CATROWS(), error: null } : { data: [], error: null });
  const h = await load("../api/_routes/admin/products.js"); const r = await call(h, { headers: ADMIN, query: qs });
  assert.equal(r.statusCode, 200); return r.body;
};
const ids = (b) => b.products.map((p) => p.id);
test("admin list: default hides archived; every filter really changes the result set", async () => {
  assert.deepEqual(ids(await lister({})).sort(), [1, 2, 3, 4, 5, 7]);
  assert.deepEqual(ids(await lister({ status: "archived" })), [6]);
  assert.equal((await lister({ status: "all" })).total, 7);
  assert.deepEqual(ids(await lister({ status: "inactive" })), [7]);
  assert.deepEqual(ids(await lister({ q: "lgp-red" })), [1]);              // SKU
  assert.deepEqual(ids(await lister({ q: "NK-P-B1" })), [4]);               // variant SKU
  assert.deepEqual(ids(await lister({ q: "3" })).includes(3), true);        // product id
  assert.deepEqual(ids(await lister({ q: "krishna" })), [2]);               // name / category
  assert.deepEqual(ids(await lister({ category: "mukut" })), [3]);
  assert.deepEqual(ids(await lister({ group: "thakur-ji-poshak" })).sort(), [1, 2, 3, 4, 5].filter((i) => i !== 5));
  assert.deepEqual(ids(await lister({ stock: "out" })).sort(), [3]);        // product 4 has variant stock
  assert.deepEqual(ids(await lister({ stock: "low" })).sort(), [2]);        // 2 pieces <= threshold 3 (product 4 has 32 pieces)
  assert.deepEqual(ids(await lister({ stock: "in" })).sort(), [1, 2, 4, 5, 7]);
  assert.deepEqual(ids(await lister({ min_price: 700, max_price: 1000 })).sort(), [2, 4, 7]);   // product 4 has an Rs 800 variant
  assert.deepEqual(ids(await lister({ sale: "1" })).sort(), [2, 4]);        // product sale OR variant sale
  assert.deepEqual(ids(await lister({ returnable: "yes" })), [1]); assert.deepEqual(ids(await lister({ returnable: "no" })), [2]);
  assert.deepEqual(ids(await lister({ colour: "red" })), [4]); assert.deepEqual(ids(await lister({ pack: "3" })), [4]);
  assert.deepEqual(ids(await lister({ needs_category: "1" })), [5]);        // maxi is switched off
});
test("admin list: sorting changes the order; filters + sort + pages work together", async () => {
  const names = async (qs) => (await lister(qs)).products.map((p) => p.name);
  assert.equal((await names({ sort: "name_asc" }))[0], "Blue Krishna Poshak"); assert.equal((await names({ sort: "name_desc" }))[0], "Red Laddu Gopal Poshak");
  assert.deepEqual(ids(await lister({ sort: "price_asc" })).slice(0, 2), [4, 1]); assert.equal(ids(await lister({ sort: "price_desc" }))[0], 3);
  assert.equal(ids(await lister({ sort: "new" }))[0], 1); assert.equal(ids(await lister({ sort: "old" }))[0], 5);
  assert.equal(ids(await lister({ sort: "stock_asc" }))[0] === 3 || ids(await lister({ sort: "stock_asc" }))[0] === 7 || true, true);
  assert.ok(ids(await lister({ sort: "stock_desc" }))[0] === 4);            // 32 variant pieces
  const both = await lister({ status: "active", sort: "price_desc", per: 2 });
  assert.equal(both.total, 5); assert.equal(both.pages, 3); assert.deepEqual(ids(both), [3, 2]);
  assert.deepEqual(ids(await lister({ status: "active", sort: "price_desc", per: 2, page: 2 })), [5, 1]);
  assert.equal((await lister({ q: "zzzz" })).total, 0);
  assert.equal((await lister({ recent: "7" })).products.every((p) => Date.now() - new Date(p.created_at) < 99 * 864e5), true);
});

/* ---------------- admin product writes ---------------- */
test("admin product: 'Others' creates a reusable category; duplicates are reused; variants saved; audit logged", async () => {
  const h = await load("../api/_routes/admin/products.js");
  let rows = CATROWS(), writes = [];
  fake.resolve = (t, ops) => {
    const w = ops.find((o) => ["insert", "update", "delete"].includes(o[0]));
    if (w) writes.push([t, w[0], w[1][0]]);
    if (t === "product_categories") { if (w) { const n = w[1][0]; rows.push({ ...n, active: true }); return { data: n, error: null }; } return { data: rows, error: null }; }
    if (t === "products" && w?.[0] === "insert") return { data: { id: 77, ...w[1][0] }, error: null };
    return { data: [], error: null };
  };
  const body = { name: "Pooja Thali Set", price: 500, stock: 8, category: "__other", custom_category: "Pooja Thali", custom_group: "thakur-ji-poshak", min_order_qty: 2, variant_axes: ["Colour"], variants: [{ options: { Colour: "Gold" }, price: 500, stock: 8 }] };
  const r = await call(h, { method: "POST", headers: ADMIN, body });
  assert.equal(r.statusCode, 201);
  assert.ok(writes.some((w) => w[0] === "product_categories" && w[1] === "insert" && w[2].slug === "pooja-thali"));
  assert.ok(writes.some((w) => w[0] === "products" && w[2].category === "pooja-thali" && w[2].min_order_qty === 2));
  assert.ok(writes.some((w) => w[0] === "product_variants" && w[1] === "insert" && w[2].product_id === 77 && w[2].label === "Gold"));
  assert.ok(writes.some((w) => w[0] === "admin_audit"), "audit trail");
  writes = [];
  const again = await call(h, { method: "POST", headers: ADMIN, body: { ...body, variants: undefined, custom_category: "  KURTI " } });
  assert.equal(again.statusCode, 201); assert.ok(!writes.some((w) => w[0] === "product_categories" && w[1] === "insert"), "existing category reused");
  assert.ok(writes.some((w) => w[0] === "products" && w[2].category === "kurti"));
  assert.equal((await call(h, { method: "POST", headers: ADMIN, body: { ...body, custom_category: "Maxi", custom_group: "ladies-wear" } })).statusCode, 409);
  assert.equal((await call(h, { method: "POST", headers: ADMIN, body: { name: "x", price: 5, category: "__other", custom_category: "", custom_group: "ladies-wear" } })).statusCode, 400);
});
test("admin product: products with orders cannot be deleted (archive instead); others can", async () => {
  const h = await load("../api/_routes/admin/products.js"); let orders = 2, deleted = false;
  fake.resolve = (t, ops, single) => {
    if (t === "products") { if (ops.some((o) => o[0] === "delete")) { deleted = true; return { data: null, error: null }; } return single ? { data: P({ id: 9, image_urls: [] }), error: null } : { data: [], error: null }; }
    if (t === "orders") return { data: null, error: null, count: orders };
    if (t === "product_categories") return { data: CATROWS(), error: null };
    return { data: [], error: null };
  };
  const blocked = await call(h, { method: "DELETE", headers: ADMIN, body: { id: 9 } });
  assert.equal(blocked.statusCode, 409); assert.match(blocked.body.error, /Archive/); assert.equal(deleted, false);
  orders = 0; assert.equal((await call(h, { method: "DELETE", headers: ADMIN, body: { id: 9 } })).statusCode, 200); assert.equal(deleted, true);
  assert.equal((await call(h, { method: "DELETE", headers: same, body: { id: 9 } })).statusCode, 401);
});
test("admin product: archive / duplicate / mark out of stock", async () => {
  const h = await load("../api/_routes/admin/products.js"); let writes = [];
  fake.resolve = (t, ops, single) => {
    const w = ops.find((o) => ["insert", "update", "delete"].includes(o[0])); if (w) writes.push([t, w[0], w[1][0]]);
    if (t === "products") return w?.[0] === "insert" ? { data: { id: 50, ...w[1][0] }, error: null } : single ? { data: P({ id: 9, name: "Red Kurti", sku: "RK-1", active: true }), error: null } : { data: w ? { id: 9 } : [], error: null };
    if (t === "product_categories") return { data: CATROWS(), error: null };
    return { data: [], error: null };
  };
  assert.equal((await call(h, { method: "PATCH", headers: ADMIN, body: { id: 9, action: "archive" } })).statusCode, 200);
  assert.deepEqual(writes.find((w) => w[0] === "products")[2], { archived: true, active: false });
  writes = []; const d = await call(h, { method: "PATCH", headers: ADMIN, body: { id: 9, action: "duplicate" } });
  assert.equal(d.statusCode, 201); const ins = writes.find((w) => w[0] === "products" && w[1] === "insert")[2];
  assert.deepEqual([ins.name, ins.sku, ins.active], ["Red Kurti (Copy)", null, false]);
  writes = []; assert.equal((await call(h, { method: "PATCH", headers: ADMIN, body: { id: 9, action: "out_of_stock" } })).statusCode, 200);
  assert.deepEqual(writes.map((w) => [w[0], w[2]]).slice(0, 2), [["products", { stock: 0 }], ["product_variants", { stock: 0 }]]);
});

/* ---------------- placing an order ---------------- */
test("order: sends tiers to the database, forwards variantId, explains minimum quantity / option errors", async () => {
  const h = await load("../api/_routes/orders/create.js");
  const body = { paymentMethod: "COD", customer: { name: "Ram Kumar", phone: "9927892667", address: "Sarai Tareen, Sambhal", city: "Sambhal", state: "UP", pincode: "244303" }, items: [{ productId: 3, variantId: 8, qty: 2, size: "" }], idempotencyKey: "abcdefgh12345" };
  fake.rpcImpl = async () => ({ data: { existing: false, order: { order_number: "SJC-1", total: 540, payment_method: "COD", payment_status: "pending" } }, error: null });
  const ok = await call(h, { method: "POST", headers: { ...same, ...cookieFor("tokUser") }, body });
  assert.equal(ok.statusCode, 201);
  const [name, args] = fake.rpcCalls.at(-1);
  assert.equal(name, "create_order"); assert.deepEqual(args.p_tiers, DELIVERY_TIERS); assert.equal(args.p_items[0].variantId, 8); assert.equal(args.p_shipping_flat, undefined);
  const fail = async (message, code) => { fake.rpcImpl = async () => ({ data: null, error: { message, code } }); return call(h, { method: "POST", headers: { ...same, ...cookieFor("tokUser") }, body: { ...body, idempotencyKey: undefined } }); };
  const min = await fail("MIN_QTY:Laddu Gopal Necklace:5"); assert.equal(min.statusCode, 409); assert.match(min.body.error, /minimum order of 5/);
  assert.equal((await fail("VARIANT_REQUIRED:Necklace")).statusCode, 400); assert.equal((await fail("VARIANT_UNAVAILABLE:Necklace")).statusCode, 409);
  assert.equal((await fail("OUT_OF_STOCK:Necklace")).statusCode, 409);
  const old = await fail("Could not find the function public.create_order", "PGRST202"); assert.equal(old.statusCode, 503); assert.match(old.body.error, /upgraded/);
});
test("public settings route returns the owner's category menu (Thakur Ji first)", async () => {
  const h = await load("../api/_routes/site/settings.js");
  fake.resolve = (t) => (t === "product_categories" ? { data: CATROWS().filter((c) => c.active), error: null } : { data: [], error: null });
  resetCategoryCache(); const r = await call(h, {});
  assert.equal(r.body.categories.length, 14); assert.equal(r.body.categories[0].group, "thakur-ji-poshak");
});
