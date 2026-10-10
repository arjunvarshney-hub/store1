// Local E2E harness: serves public/ + vercel.json rewrites and runs the REAL api/*.js handlers
// against an in-memory fake of Supabase. (SQL functions are mirrored in JS here; the real SQL is NOT executed.)
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import { fileURLToPath, pathToFileURL } from "node:url";
process.env.SJC_TEST_DB = "1"; process.env.SUPABASE_URL = "https://abc.supabase.co";
process.env.RAZORPAY_KEY_ID = "rzp_test_e2e"; process.env.RAZORPAY_KEY_SECRET = "e2e_secret"; process.env.RAZORPAY_WEBHOOK_SECRET = "e2e_wh";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIRM = process.env.CONFIRM === "1";
const db = { products: [], orders: [], profiles: [], admin_users: [], payment_events: [], site_settings: [], product_reviews: [] }; let seq = { products: 0, orders: 0, product_reviews: 0 };
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
    else if (op === "is") filters.push((r) => eqv(r[a[0]], a[1]));
    else if (op === "or") { const parts = a[0].split(/,(?=\w+\.ilike\.)/).map((x) => x.match(/^(\w+)\.ilike\.(.*)$/)); filters.push((r) => parts.some((m) => m && ilike(r[m[1]], m[2]))); }
    else if (op === "order") order = [a[0], a[1]?.ascending !== false];
    else if (op === "range") range = a; else if (op === "limit") lim = a[0];
  }
  const match = (r) => filters.every((f) => f(r));
  if (mode === "insert") {
    const arr = [].concat(payload).map((p) => { const id = ++seq[table]; const r = { id, created_at: new Date().toISOString(), active: true, sizes: [], image_urls: [], stock: 0, sale_price: null, ...p }; if (table === "products") r.slug = slugify(r.name, id); r.updated_at = r.created_at; db[table].push(r); return r; });
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
const restore = (o) => { if (o.stock_restored) return; for (const i of o.items) { const p = db.products.find((x) => x.id === i.product_id); if (p) p.stock += i.qty; } o.stock_restored = true; };
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
  create_order: ({ p_user, p_customer, p_items, p_method, p_key, p_shipping_flat, p_free_above }) => {
    const ex = p_key && db.orders.find((o) => o.user_id === p_user && o.idempotency_key === p_key); if (ex) return { existing: true, order: ex };
    const need = {}; p_items.forEach((i) => (need[i.productId] = (need[i.productId] || 0) + i.qty));
    for (const [id, q] of Object.entries(need)) { const p = db.products.find((x) => x.id == id); if (!p || !p.active) throw new Error("UNAVAILABLE"); if (p.stock < q) throw new Error("OUT_OF_STOCK:" + p.name); }
    let sub = 0; const lines = p_items.map((i) => { const p = db.products.find((x) => x.id == i.productId); const size = p.sizes.length ? i.size : null; if (p.sizes.length && !p.sizes.includes(size)) throw new Error("SIZE_REQUIRED:" + p.name); const unit = p.sale_price && p.sale_price < p.price ? p.sale_price : p.price; sub += unit * i.qty; p.stock -= i.qty; return { product_id: p.id, name: p.name, slug: p.slug, size, qty: i.qty, unit_price: unit, image: p.image_urls[0] }; });
    const ship = p_free_above != null && sub >= p_free_above ? 0 : p_shipping_flat || 0; const id = ++seq.orders;
    const o = { id, created_at: new Date().toISOString(), order_number: "SJC-260101-" + String(id).padStart(5, "0"), user_id: p_user, customer_name: p_customer.name, phone: p_customer.phone, email: p_customer.email || null, address: p_customer.address, city: p_customer.city, state: p_customer.state, pincode: p_customer.pincode, payment_method: p_method, payment_status: "pending", order_status: "pending", items: lines, subtotal: sub, shipping: ship, total: sub + ship, razorpay_order_id: null, razorpay_payment_id: null, idempotency_key: p_key, stock_restored: false, admin_note: null };
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

// ---- HTTP server mirroring vercel.json ----
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".txt": "text/plain" };
const handlers = {};
const getH = async (name) => (handlers[name] ??= await import(pathToFileURL(path.join(ROOT, "api", name + ".js")).href));
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost"); let p = url.pathname; const query = Object.fromEntries(url.searchParams);
  if (p === "/__admin_grant") { const u = users.find((x) => x.email === query.email); db.admin_users.push({ user_id: u.id }); return res.end("ok"); }
  if (p === "/__seed") { const rows = [["Red Velvet Laddu Gopal Poshak","laddu-gopal-poshak",650,499,["1","2","3"]],["Pink Krishna Poshak Set","krishna-poshak",850,null,["2","3","4"]],["Gold Mukut","mukut",350,299,[]],["Cotton Printed Kurti","kurti",799,null,["S","M","L","XL"]],["Embroidered Suit Set","suit",1450,1199,["M","L","XL"]],["Chanderi Dupatta","dupatta",450,null,[]],["Designer Maxi","maxi",1299,null,["M","L"]],["Moti Mala","mala",199,null,[]]]; rows.forEach(([name,category,price,sale,sizes])=>{const id=++seq.products; db.products.push({id,created_at:new Date(Date.now()-id*1000).toISOString(),updated_at:new Date().toISOString(),active:true,name,category,price,sale_price:sale,sizes,image_urls:[],stock:5,slug:slugify(name,id),description:"Sample"});}); return res.end("ok"); }
  if (p === "/__ai") { if (query.on === "1") { process.env.ANTHROPIC_API_KEY = "sk-e2e-key"; process.env.AI_MODEL = "e2e-model"; } else delete process.env.ANTHROPIC_API_KEY; return res.end("ok"); }
  if (p === "/__confirm") { users.forEach((u) => (u.confirmed = true)); return res.end("ok"); }
  if (p === "/__state") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ products: db.products, orders: db.orders, files: db.__files, settings: db.site_settings, reviews: db.product_reviews })); }
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
