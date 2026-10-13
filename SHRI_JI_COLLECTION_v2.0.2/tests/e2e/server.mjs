// Local E2E harness: serves public/ + vercel.json rewrites and runs the REAL api/*.js handlers
// against an in-memory fake of Supabase. (SQL functions are mirrored in JS here; the real SQL is NOT executed.)
import { DEFAULT_CATEGORIES } from "../../public/js/categories.js";
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import { fileURLToPath, pathToFileURL } from "node:url";
process.env.SJC_TEST_DB = "1"; process.env.SUPABASE_URL = "https://abc.supabase.co";
process.env.RAZORPAY_KEY_ID = "rzp_test_e2e"; process.env.RAZORPAY_KEY_SECRET = "e2e_secret"; process.env.RAZORPAY_WEBHOOK_SECRET = "e2e_wh";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIRM = process.env.CONFIRM === "1";
const db = { products: [], orders: [], profiles: [], admin_users: [], payment_events: [], site_settings: [], product_reviews: [], categories: DEFAULT_CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, group_slug: c.group, sort_order: c.sort, active: c.active })), product_variants: [], admin_audit: [], email_events: [] }; let seq = { products: 0, orders: 0, product_reviews: 0, product_variants: 0, categories: 0 };
const users = []; const sessions = {};
const slugify = (n, id) => (n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item") + "-" + id;
const eqv = (a, b) => (a === null || a === undefined ? b === null || b === undefined : String(a) === String(b));
const ilike = (v, pat) => new RegExp("^" + pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$", "i").test(String(v ?? ""));

function run(table, ops, single) {
  let rows = db[table]; if (!rows) return { data: null, error: { message: "no table " + table } };
  let upsertKey, mode = "select", payload, order, range, lim, wantCount = false, selected = false; const filters = [];
  for (const [op, a] of ops) {
    if (op === "select") { selected = true; if (a[1]?.count) wantCount = true; }
    else if (["insert", "update", "upsert"].includes(op)) { mode = op; payload = a[0]; if (op === "upsert") upsertKey = a[1]?.onConflict; }
    else if (op === "delete") mode = "delete";
    else if (op === "eq") filters.push((r) => eqv(r[a[0]], a[1]));
    else if (op === "in") filters.push((r) => a[1].map(String).includes(String(r[a[0]])));
    else if (op === "neq") filters.push((r) => !eqv(r[a[0]], a[1]));
    else if (op === "contains") filters.push((r) => (r[a[0]] || []).some((y) => a[1].some((x) => Object.entries(x).every(([k, v]) => String(y[k]) === String(v)))));
    else if (op === "is") filters.push((r) => eqv(r[a[0]], a[1]));
    else if (op === "or") { const parts = a[0].split(/,(?=\w+\.ilike\.)/).map((x) => x.match(/^(\w+)\.ilike\.(.*)$/)); filters.push((r) => parts.some((m) => m && ilike(r[m[1]], m[2]))); }
    else if (op === "order") order = [a[0], a[1]?.ascending !== false];
    else if (op === "range") range = a; else if (op === "limit") lim = a[0];
  }
  const match = (r) => filters.every((f) => f(r));
  if (mode === "insert") {
    const arr = [].concat(payload).map((p) => { const id = ++seq[table]; const r = { id, created_at: new Date().toISOString(), active: true, sizes: [], image_urls: [], stock: 0, sale_price: null, ...p }; if (table === "products") { r.slug = slugify(r.name, id); Object.assign(r, { min_order_qty: 1, pack_size: 1, archived: false, specs: [], variant_axes: [], low_stock_threshold: 3, return_eligible: null, ...p }); } if (table === "product_variants") Object.assign(r, { available: true, pack_qty: 1, sale_price: null, ...p }); r.updated_at = r.created_at; db[table].push(r); return r; });
    return { data: single ? arr[0] : selected ? arr : null, error: null };
  }
  if (mode === "upsert") { const pk = upsertKey || Object.keys([].concat(payload)[0])[0]; for (const row of [].concat(payload)) { const ex = db[table].find((r) => eqv(r[pk], row[pk])); if (ex) Object.assign(ex, row); else db[table].push({ ...row }); } return { data: null, error: null }; }
  let out = rows.filter(match);
  if (mode === "update") { out.forEach((r) => Object.assign(r, payload)); return { data: single ? out[0] ?? null : selected ? out : null, error: null }; }
  if (mode === "delete") { db[table] = rows.filter((r) => !match(r)); return { data: null, error: null }; }
  if (order) out = out.slice().sort((x, y) => (x[order[0]] > y[order[0]] ? 1 : x[order[0]] < y[order[0]] ? -1 : 0) * (order[1] ? 1 : -1));
  const count = out.length; if (range) out = out.slice(range[0], range[1] + 1); if (lim) out = out.slice(0, lim);
  if (single) return out[0] ? { data: out[0], error: null } : { data: null, error: null };
  return { data: out, error: null, count: wantCount ? count : null };
}
const chain = (t, ops = []) => new Proxy({}, { get(_, p) {
  if (p === "then") return (ok, bad) => Promise.resolve(run(t, ops, false)).then(ok, bad);
  return (...a) => { const o = [...ops, [p, a]]; return p === "single" || p === "maybeSingle" ? Promise.resolve(run(t, o, true)) : chain(t, o); };
} });

// ---- JS mirror of the SQL functions (supabase.sql is the real thing) ----
const restore = (o) => { if (o.stock_restored) return; for (const i of o.items) { const pieces = i.pieces ?? (i.qty * (i.pack_qty || 1)); const v = i.variant_id && db.product_variants.find((x) => x.id === i.variant_id); if (v) v.stock += pieces; else { const p = db.products.find((x) => x.id === i.product_id); if (p) p.stock += pieces; } } o.stock_restored = true; };
const setStatus = (num, status, user) => {
  const o = db.orders.find((x) => x.order_number === num); if (!o || (user && o.user_id !== user)) throw new Error("NOT_FOUND");
  if (user && (status !== "cancelled" || o.order_status !== "pending" || o.payment_status === "paid")) throw new Error("NOT_ALLOWED");
  if (o.order_status === "cancelled" && status !== "cancelled") throw new Error("CANCELLED_LOCKED");
  if (status !== "cancelled" && status !== "pending" && o.payment_method === "ONLINE" && o.payment_status !== "paid") throw new Error("PAYMENT_PENDING");
  if (status === "cancelled") { restore(o); o.order_status = "cancelled"; if (["pending", "failed"].includes(o.payment_status) && o.payment_method === "ONLINE") o.payment_status = "cancelled"; }
  else { o.order_status = status; if (status === "delivered" && o.payment_method === "COD" && o.payment_status === "pending") o.payment_status = "paid"; }
  return o;
};
const rpcs = {
  get_product_review_summary: ({ p_product_ids }) => p_product_ids.map((id) => { const r = db.product_reviews.filter((x) => x.product_id === id && x.status === "approved"); return r.length ? { product_id: id, review_count: r.length, average_rating: Math.round((r.reduce((n, x) => n + x.rating, 0) / r.length) * 10) / 10 } : null; }).filter(Boolean),
  // JS port of create_order() in supabase.sql (v4): variants, minimum quantity, pack pieces, delivery tiers
  create_order: ({ p_user, p_customer, p_items, p_method, p_key, p_tiers }) => {
    const ex = p_key && db.orders.find((o) => o.user_id === p_user && o.idempotency_key === p_key); if (ex) return { existing: true, order: ex };
    const need = {}; p_items.forEach((i) => (need[i.productId] = (need[i.productId] || 0) + i.qty));
    for (const [id, q] of Object.entries(need)) { const p = db.products.find((x) => x.id == id); if (!p) throw new Error("UNAVAILABLE"); if (q < p.min_order_qty) throw new Error(`MIN_QTY:${p.name}:${p.min_order_qty}`); }
    const undo = []; let sub = 0; const lines = [];
    try {
      for (const i of [...p_items].sort((x, y) => x.productId - y.productId || (x.variantId || 0) - (y.variantId || 0))) {
        const p = db.products.find((x) => x.id == i.productId); const cat = db.categories.find((c) => c.slug === p?.category);
        if (!p || !p.active || p.archived || !cat?.active) throw new Error("UNAVAILABLE");
        const vars = db.product_variants.filter((v) => v.product_id === p.id); let v = null, size = null, pack, unit, holder;
        if (vars.length) { if (!i.variantId) throw new Error("VARIANT_REQUIRED:" + p.name); v = vars.find((x) => x.id === i.variantId); if (!v || !v.available) throw new Error("VARIANT_UNAVAILABLE:" + p.name); pack = v.pack_qty; holder = v; unit = v.sale_price && v.sale_price < v.price ? v.sale_price : v.price; }
        else { size = (i.size || "").trim() || null; if (p.sizes.length) { if (!size || !p.sizes.includes(size)) throw new Error("SIZE_REQUIRED:" + p.name); } else size = null; pack = p.pack_size; holder = p; unit = p.sale_price && p.sale_price < p.price ? p.sale_price : p.price; }
        const pieces = i.qty * pack; if (holder.stock < pieces) throw new Error("OUT_OF_STOCK:" + p.name);
        holder.stock -= pieces; undo.push(() => (holder.stock += pieces)); sub += unit * i.qty;
        lines.push({ product_id: p.id, variant_id: v?.id ?? null, name: p.name, slug: p.slug, sku: v?.sku ?? p.sku ?? null, variant_label: v?.label ?? null, size, qty: i.qty, pack_qty: pack, pieces, unit_price: unit, price: unit, image: p.image_urls[0] ?? null, return_eligible: p.return_eligible ?? null, return_days: p.return_days ?? null });
      }
    } catch (e) { undo.forEach((u) => u()); throw e; }
    sub = Math.round(sub * 100) / 100; let ship = 0; for (const t of [...p_tiers].sort((a, b) => a.min - b.min)) if (sub >= t.min) ship = t.fee;
    const id = ++seq.orders;
    const o = { id, created_at: new Date().toISOString(), order_number: "SJC-260101-" + String(id).padStart(5, "0"), user_id: p_user, customer_name: p_customer.name, phone: p_customer.phone, email: p_customer.email || null, address: p_customer.address, city: p_customer.city, state: p_customer.state, pincode: p_customer.pincode, payment_method: p_method, payment_status: "pending", order_status: "pending", items: lines, subtotal: sub, shipping: ship, total: sub + ship, idempotency_key: p_key, stock_restored: false };
    db.orders.push(o); return { existing: false, order: o };
  },
  set_order_status: ({ p_order_number, p_status, p_user }) => setStatus(p_order_number, p_status, p_user),
  mark_order_paid: ({ p_razorpay_order_id, p_payment_id, p_amount_paise }) => { const o = db.orders.find((x) => x.razorpay_order_id === p_razorpay_order_id); if (!o) throw new Error("NOT_FOUND"); if (p_amount_paise != null && p_amount_paise !== Math.round(o.total * 100)) throw new Error("AMOUNT_MISMATCH"); if (o.payment_status === "paid") return o; o.payment_status = "paid"; o.razorpay_payment_id = p_payment_id; if (o.order_status === "pending") o.order_status = "confirmed"; return o; },
  mark_payment_failed: ({ p_razorpay_order_id }) => { const o = db.orders.find((x) => x.razorpay_order_id === p_razorpay_order_id); if (o && o.payment_status === "pending") o.payment_status = "failed"; return null; },
};
const mkUser = (email, pw, name) => { const u = { id: crypto.randomUUID(), email, pw, confirmed: !CONFIRM, user_metadata: { full_name: name } }; users.push(u); return u; };
const sess = (u) => { const t = "tok_" + crypto.randomUUID(); sessions[t] = u; return { access_token: t, refresh_token: "ref_" + u.id, expires_in: 3600, user: u }; };
globalThis.__SJC_TEST_DB__ = {
  from: (t) => chain(t),
  rpc: async (n, a) => { try { return { data: rpcs[n](a), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; } },
  auth: {
    getUser: async (t) => ({ data: { user: sessions[t] || null }, error: sessions[t] ? null : { message: "bad" } }),
    refreshSession: async ({ refresh_token }) => { const u = users.find((x) => "ref_" + x.id === refresh_token); return u ? { data: { session: sess(u) }, error: null } : { data: {}, error: { message: "bad" } }; },
    signUp: async ({ email, password, options }) => { if (users.some((u) => u.email === email)) return { data: {}, error: { message: "User already registered" } }; const u = mkUser(email, password, options?.data?.full_name); return { data: { user: u, session: CONFIRM ? null : sess(u) }, error: null }; },
    signInWithPassword: async ({ email, password }) => { const u = users.find((x) => x.email === email && x.pw === password); if (!u) return { data: {}, error: { message: "Invalid login credentials" } }; if (!u.confirmed) return { data: {}, error: { message: "Email not confirmed" } }; return { data: { session: sess(u) }, error: null }; },
    resetPasswordForEmail: async () => ({ error: null }),
    admin: { updateUserById: async (id, { password }) => { users.find((u) => u.id === id).pw = password; return { error: null }; } },
  },
  storage: { from: () => ({ upload: async (p, buf) => { db.__files = db.__files || {}; db.__files[p] = buf.length; return { error: null }; }, getPublicUrl: (p) => ({ data: { publicUrl: process.env.SUPABASE_URL + "/storage/v1/object/public/product-images/" + p } }), remove: async () => ({}) }) },
};
// Razorpay REST stub
const realFetch = globalThis.fetch; let rz = 0;
globalThis.fetch = async (u, i) => String(u).startsWith("https://api.anthropic.com/") ? { ok: true, json: async () => ({ content: [{ type: "text", text: "AI-MOCK: here are some options from our store." }] }) } : (String(u).startsWith("https://api.razorpay.com/v1/orders") ? { ok: true, json: async () => ({ id: "order_E2E" + ++rz + "ABCDEF" }) } : realFetch(u, i));


// ---- optional demo data (SEED=1): realistic-looking products so the layout can be checked visually ----
const art = (h, shape) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 45% 86%)"/><stop offset="1" stop-color="hsl(${h} 55% 52%)"/></linearGradient></defs><rect width="400" height="500" fill="url(#g)"/>${shape(h)}</svg>`;
const dress = (h) => `<circle cx="200" cy="130" r="34" fill="hsl(${h} 60% 26%)"/><path d="M140 175h120l48 260H92z" fill="#d9b45f"/><path d="M140 175h120l10 40H130z" fill="hsl(${h} 60% 26%)"/>`;
const kurti = (h) => `<path d="M150 90l50 25 50-25 40 40-35 40 8 260H137l8-260-35-40z" fill="hsl(${h} 55% 30%)"/><path d="M175 115l25 40 25-40" fill="none" stroke="#e6c46f" stroke-width="6"/>`;
const beads = (h) => `<g fill="none" stroke="#fff" stroke-width="10" stroke-dasharray="1 22" stroke-linecap="round"><circle cx="200" cy="250" r="110"/><circle cx="200" cy="250" r="80" stroke="hsl(${h} 60% 26%)"/></g>`;
const crown = (h) => `<path d="M110 330l-20-140 70 60 40-90 40 90 70-60-20 140z" fill="#d9b45f"/><circle cx="200" cy="160" r="12" fill="hsl(${h} 60% 30%)"/>`;
const flute = (h) => `<rect x="60" y="235" width="280" height="26" rx="13" fill="#d9b45f" transform="rotate(-18 200 250)"/><g fill="hsl(${h} 60% 26%)"><circle cx="150" cy="268" r="7"/><circle cx="185" cy="256" r="7"/><circle cx="220" cy="244" r="7"/><circle cx="255" cy="232" r="7"/></g>`;
const DEMO = [
  ["Maroon Velvet Laddu Gopal Poshak", "laddu-gopal-poshak", 450, null, 12, ["1","2","3","4"], "Velvet with zari work", 345, dress],
  ["Royal Blue Silk Krishna Poshak", "krishna-poshak", 650, 549, 9, ["2","3","4","5"], "Pure silk with gota patti", 225, dress],
  ["Green Cotton Laddu Gopal Poshak", "laddu-gopal-poshak", 299, null, 2, ["1","2","3"], "Soft cotton, daily wear", 150, dress],
  ["Gold Plated Mukut", "mukut", 650, null, 0, [], "Metal with stone work", 42, crown],
  ["Pearl Necklace for Laddu Gopal", "mala-necklace", 120, null, 0, [], "Pearl-look beads", 200, beads],
  ["Silver Bansuri", "bansuri", 220, null, 8, [], "Lightweight, hand polished", 260, flute],
  ["Pink Cotton Kurti", "kurti", 899, 749, 12, ["M","L","XL"], "Printed cotton, straight cut", 335, kurti],
  ["Teal Printed Kurti", "kurti", 1099, null, 5, ["S","M","L"], "Rayon, A-line", 175, kurti],
];
if (process.env.SEED === "1") DEMO.forEach(([name, category, price, sale_price, stock, sizes, material, h, shape], i) => {
  const id = ++seq.products;
  const row = { id, slug: slugify(name, id), name, category, price, sale_price, stock, sizes, material, description: name + ". Demo product.", image_urls: ["/__img/" + i + ".svg"], active: true, created_at: new Date(Date.now() - i * 3600e3).toISOString(), updated_at: new Date().toISOString(), min_order_qty: 1, pack_size: 1, archived: false, specs: [], variant_axes: [], low_stock_threshold: 3, return_eligible: null, _art: art(h, shape) };
  db.products.push(row);
  if (i === 0) Object.assign(row, { sku: "LGP-001", return_eligible: true, return_days: 7, return_conditions: "Unused, with original packing.", description_html: "<h3>Product highlights</h3><ul><li>Colour: Maroon and Gold</li><li>Material: Velvet</li></ul><p>Beautiful <b>poshak</b> for Laddu Gopal Ji.</p>", specs: [{ label: "Colour", value: "Maroon" }, { label: "Suitable idol size", value: "Size 1 to 4" }, { label: "Pack contents", value: "1 dress, 1 patka" }] });
  if (i === 0) row.image_urls = ["/__img/0.svg", "/__img/1.svg", "/__img/5.svg"];
  if (i === 1) Object.assign(row, { return_eligible: false, min_order_qty: 2 });
  if (i === 4) { Object.assign(row, { variant_axes: ["Colour", "Pack Size"], min_order_qty: 2 }); [["Red", "Single Piece", 1, 120, null, 30], ["Red", "Pack of 3", 3, 330, 300, 30], ["Blue", "Single Piece", 1, 120, null, 12], ["Blue", "Pack of 3", 3, 330, null, 2]].forEach(([c, pk, q, price, sale, st]) => db.product_variants.push({ id: ++seq.product_variants, product_id: row.id, sku: `NK-${c[0]}${q}`, label: `${c} / ${pk}`, options: { Colour: c, "Pack Size": pk }, price, sale_price: sale, stock: st, pack_qty: q, available: true, sort_order: seq.product_variants })); }
  if (i === 0) db.product_reviews.push({ id: ++seq.product_reviews, product_id: id, customer_name: "Sunita", rating: 5, comment: "Beautiful stitching and fits Laddu Gopal perfectly.", status: "approved", created_at: new Date().toISOString() });
});

// ---- HTTP server mirroring vercel.json ----
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".txt": "text/plain" };
const handlers = {};
const getH = async (name) => (handlers[name] ??= await import(pathToFileURL(path.join(ROOT, "api", name + ".js")).href));
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost"); let p = url.pathname; const query = Object.fromEntries(url.searchParams);
  if (p.startsWith("/__img/")) { const d = db.products[Number(p.slice(7).replace(".svg", ""))]; if (!d) { res.statusCode = 404; return res.end(); } res.setHeader("Content-Type", "image/svg+xml"); return res.end(d._art); }
  if (p === "/__admin_grant") { const u = users.find((x) => x.email === query.email); db.admin_users.push({ user_id: u.id }); return res.end("ok"); }
  if (p === "/__seed") { const rows = [["Red Velvet Laddu Gopal Poshak","laddu-gopal-poshak",650,499,["1","2","3"]],["Pink Krishna Poshak Set","krishna-poshak",850,null,["2","3","4"]],["Gold Mukut","mukut",350,299,[]],["Cotton Printed Kurti","kurti",799,null,["S","M","L","XL"]],["Embroidered Suit Set","suit",1450,1199,["M","L","XL"]],["Chanderi Dupatta","dupatta",450,null,[]],["Designer Maxi","maxi",1299,null,["M","L"]],["Moti Mala","mala",199,null,[]]]; rows.forEach(([name,category,price,sale,sizes])=>{const id=++seq.products; db.products.push({id,created_at:new Date(Date.now()-id*1000).toISOString(),updated_at:new Date().toISOString(),active:true,name,category,price,sale_price:sale,sizes,image_urls:[],stock:5,slug:slugify(name,id),description:"Sample"});}); return res.end("ok"); }
  if (p === "/__ai") { if (query.on === "1") { process.env.ANTHROPIC_API_KEY = "sk-e2e-key"; process.env.AI_MODEL = "e2e-model"; } else delete process.env.ANTHROPIC_API_KEY; return res.end("ok"); }
  if (p === "/__confirm") { users.forEach((u) => (u.confirmed = true)); return res.end("ok"); }
  if (p === "/__state") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ products: db.products, orders: db.orders, files: db.__files, settings: db.site_settings, reviews: db.product_reviews, variants: db.product_variants, categories: db.categories, audit: db.admin_audit })); }
  if (p === "/__sign") { const s = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(query.order + "|" + query.pay).digest("hex"); return res.end(s); }
  for (const r of cfg.rewrites) { const re = new RegExp("^" + r.source.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"); const m = p.match(re); if (m) { const d = new URL(r.destination.replace(/:(\w+)/g, (_, k) => m.groups[k]), "http://x"); p = d.pathname; d.searchParams.forEach((v, k) => (query[k] = v)); break; } }
  if (p.startsWith("/api/")) {
    const name = p.slice(5); let mod;
    try { mod = await getH(name); } catch { res.statusCode = 404; return res.end("no api"); }
    const chunks = []; if (mod.config?.api?.bodyParser !== false) { for await (const c of req) chunks.push(c); let b; try { b = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { b = {}; } req.body = b; }
    req.query = query; res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); return res; };
    res.send = (b) => { res.end(typeof b === "string" || Buffer.isBuffer(b) ? b : JSON.stringify(b)); return res; };
    return mod.default(req, res);
  }
  let f = path.join(ROOT, "public", p === "/" ? "index.html" : p); if (!path.extname(f)) f += ".html";
  if (!f.startsWith(path.join(ROOT, "public")) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(fs.readFileSync(path.join(ROOT, "public/404.html"))); }
  res.setHeader("Content-Type", (mime[path.extname(f)] || "application/octet-stream") + "; charset=utf-8"); res.end(fs.readFileSync(f));
}).listen(Number(process.env.PORT || 4321), () => console.log("e2e harness on " + (process.env.PORT || 4321)));
