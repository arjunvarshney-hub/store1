import { api, esc, money, $, $$, msg, badge, fmtDate, toast } from "./common.js";
import { imgTag, effPrice } from "./render.js";
import { GROUPS, CATEGORIES, catName } from "./categories.js";

const R = $("#root");
const STATUSES = ["pending", "confirmed", "packed", "shipped", "delivered", "cancelled"];
let tab = "products", products = [], orders = [], reviewStatus = "pending", filter = { search: "", status: "", payment: "" };

async function boot() {
  try {
    const me = await api("/api/auth/me");
    if (!me.user) { R.innerHTML = `<div class="panel"><h2>Please log in</h2><p class="muted">Log in with the shop owner account.</p><a class="btn primary" href="/account?next=/admin">Log in</a></div>`; return; }
    if (!me.isAdmin) { R.innerHTML = `<div class="panel"><h2>Access denied</h2><p class="muted">${esc(me.user.email)} is not an administrator.</p><a class="btn outline" href="/">Back to shop</a></div>`; return; }
  } catch (e) { R.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }
  show("products");
}
function shell(inner) {
  R.innerHTML = `<div class="atabs" role="tablist"><button class="${tab === "products" ? "on" : ""}" data-t="products" role="tab" aria-selected="${tab === "products"}">Products</button><button class="${tab === "orders" ? "on" : ""}" data-t="orders" role="tab" aria-selected="${tab === "orders"}">Orders</button><button class="${tab === "reviews" ? "on" : ""}" data-t="reviews" role="tab" aria-selected="${tab === "reviews"}">Reviews</button><button class="${tab === "site" ? "on" : ""}" data-t="site" role="tab" aria-selected="${tab === "site"}">Site</button></div><div id="pane">${inner}</div>`;
  $$(".atabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.t)));
}
function show(t) {
  tab = t; shell('<p class="muted">Loading…</p>');
  const loaders = { products: loadProducts, orders: loadOrders, reviews: loadReviews, site: loadSite };
  (loaders[t] || loadProducts)();
}

/* ------------------------------ PRODUCTS ------------------------------ */
async function loadProducts() {
  try { products = (await api("/api/admin/products")).products; } catch (e) { $("#pane").innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }
  drawProducts();
}
function drawProducts(q = "") {
  const list = products.filter((p) => !q || `${p.name} ${catName(p.category)}`.toLowerCase().includes(q.toLowerCase()));
  $("#pane").innerHTML = `<div class="tools"><input id="ps" type="search" placeholder="Search products…" value="${esc(q)}"><button class="btn primary" id="add" type="button">+ Add product</button></div><p class="sm muted">${products.length} product${products.length === 1 ? "" : "s"} · ${products.filter((p) => p.active).length} visible on the shop</p>` +
    (list.map((p) => `<div class="pcard"><div>${imgTag(p.image_urls?.[0], p.name, { w: 72, h: 72 })}</div><div><div class="nm">${esc(p.name)}</div><div class="meta">${esc(catName(p.category))} · ${money(effPrice(p))}${p.sale_price ? ` <s>${money(p.price)}</s>` : ""} · Stock ${p.stock}</div>
      <div class="acts"><label class="sw"><input type="checkbox" data-act="toggle" data-id="${p.id}" ${p.active ? "checked" : ""}> ${p.active ? "Visible" : "Hidden"}</label><button class="btn outline sm" data-act="edit" data-id="${p.id}">Edit</button><button class="btn danger sm" data-act="del" data-id="${p.id}">Delete</button></div></div></div>`).join("") || '<p class="empty">No products yet. Tap “Add product”.</p>');
  $("#ps").addEventListener("input", (e) => { const v = e.target.value; drawProducts(v); const el = $("#ps"); el.focus(); el.setSelectionRange(v.length, v.length); });
  $("#add").onclick = () => productForm();
}
$("#root").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b || b.tagName === "INPUT") return;
  const p = products.find((x) => x.id === Number(b.dataset.id));
  if (b.dataset.act === "edit" && p) productForm(p);
  if (b.dataset.act === "del" && p && confirm(`Delete “${p.name}” permanently? Its photos will be removed too.\n\nTip: use the Visible switch to just hide it.`)) {
    try { await api("/api/admin/products", { method: "DELETE", body: { id: p.id } }); toast("Deleted"); loadProducts(); } catch (err) { alert(err.message); }
  }
});
$("#root").addEventListener("change", async (e) => {
  const b = e.target.closest('[data-act="toggle"]'); if (!b) return;
  try { await api("/api/admin/products", { method: "PATCH", body: { id: Number(b.dataset.id), active: b.checked } }); toast(b.checked ? "Product is now visible" : "Product hidden"); loadProducts(); }
  catch (err) { b.checked = !b.checked; alert(err.message); }
});

/* Phone photos are 3-8 MB: shrink to max 1600px JPEG (~300 KB) in the browser before uploading. */
async function shrink(file, { max = 1600, png = false } = {}) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error(`“${file.name}” is not a JPG, PNG or WebP photo.`);
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { bmp = await new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error(`Could not read “${file.name}”.`)); im.src = URL.createObjectURL(file); }); }
  const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight, k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement("canvas"); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  const ctx = c.getContext("2d"); if (!png) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); } ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => png ? c.toBlob(ok, "image/png") : c.toBlob(ok, "image/jpeg", 0.85));
  if (!blob) throw new Error("Could not process the photo.");
  return blob;
}
async function upload(blob) {
  let r;
  try { r = await fetch("/api/admin/upload-image", { method: "POST", headers: { "Content-Type": blob.type }, body: blob, credentials: "same-origin" }); } catch { throw new Error("Upload failed: no internet connection."); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Photo upload failed.");
  return d.url;
}

function productForm(p) {
  const edit = !!p;
  // imgs: {url} for saved photos, {blob, preview} for new ones (uploaded only when you tap Save)
  let imgs = (p?.image_urls || []).map((url) => ({ url }));
  const sheet = document.createElement("div"); sheet.className = "sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true");
  const catOpts = GROUPS.map((g) => `<optgroup label="${esc(g.name)}">${CATEGORIES.filter((c) => c.group === g.slug).map((c) => `<option value="${c.slug}" ${p?.category === c.slug ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</optgroup>`).join("");
  sheet.innerHTML = `<div class="sheet-in"><div class="sheet-h"><h2>${edit ? "Edit product" : "Add product"}</h2><button class="btn outline sm" id="x" type="button">Close</button></div>
  <form id="pf" novalidate>
   <label class="f">Product name *<input name="name" maxlength="120" required value="${esc(p?.name || "")}"></label>
   <label class="f">Category *<select name="category" required><option value="">Choose category…</option>${catOpts}</select></label>
   <div class="two"><label class="f">Price ₹ *<input name="price" type="number" inputmode="decimal" min="1" step="0.01" required value="${p?.price ?? ""}"></label>
   <label class="f">Sale price ₹ <small>(optional)</small><input name="sale_price" type="number" inputmode="decimal" min="1" step="0.01" value="${p?.sale_price ?? ""}"></label></div>
   <label class="f">Stock quantity *<input name="stock" type="number" inputmode="numeric" min="0" step="1" required value="${p?.stock ?? 1}"></label>
   <label class="f">Available sizes <small>(leave empty if no sizes)</small><input name="sizes" maxlength="200" placeholder="e.g. S, M, L, XL" value="${esc((p?.sizes || []).join(", "))}"></label>
   <div class="qs" id="qs">${["S", "M", "L", "XL", "XXL", "Free Size", "0", "1", "2", "3", "4", "5", "6"].map((s) => `<button type="button" data-s="${s}">${s}</button>`).join("")}</div>
   <label class="f">Material <input name="material" maxlength="100" placeholder="e.g. Velvet, Cotton, Rayon" value="${esc(p?.material || "")}"></label>
   <label class="f">Description <textarea name="description" maxlength="3000">${esc(p?.description || "")}</textarea></label>
   <div class="f" style="margin-top:14px"><b>Photos</b> <small class="muted">(first photo is the cover · up to 8)</small></div>
   <input id="files" type="file" accept="image/jpeg,image/png,image/webp" multiple style="margin-top:6px"><div class="imgs" id="imgs"></div>
   <label class="sw" style="margin:14px 0"><input type="checkbox" name="active" ${p ? (p.active ? "checked" : "") : "checked"}> Visible on the shop</label>
   <div id="m"></div></form>
   <div class="sheet-f"><button class="btn outline" id="cancel" type="button">Cancel</button><button class="btn primary" id="save" type="button">Save product</button></div></div>`;
  document.body.appendChild(sheet); document.body.style.overflow = "hidden";
  const close = () => { imgs.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)); sheet.remove(); document.body.style.overflow = ""; };
  $("#x", sheet).onclick = $("#cancel", sheet).onclick = close;
  const f = $("#pf", sheet);

  const drawImgs = () => {
    $("#imgs", sheet).innerHTML = imgs.map((im, i) => `<div class="im ${i === 0 ? "cover" : ""}"><img src="${esc(im.preview || im.url)}" alt="Photo ${i + 1}">${im.blob ? '<span class="pend">NEW</span>' : ""}<button class="x" type="button" data-rm="${i}" aria-label="Remove photo ${i + 1}">×</button>${i === 0 ? '<span class="cv">Cover</span>' : `<button class="mk" type="button" data-cover="${i}">Make cover</button>`}</div>`).join("");
  };
  drawImgs();
  $("#imgs", sheet).addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]"), cv = e.target.closest("[data-cover]");
    if (rm) { const [g] = imgs.splice(Number(rm.dataset.rm), 1); if (g.preview) URL.revokeObjectURL(g.preview); drawImgs(); }
    if (cv) { const [g] = imgs.splice(Number(cv.dataset.cover), 1); imgs.unshift(g); drawImgs(); }
  });
  $("#files", sheet).addEventListener("change", async (e) => {
    const files = [...e.target.files]; e.target.value = ""; msg($("#m", sheet), "");
    for (const file of files) {
      if (imgs.length >= 8) { msg($("#m", sheet), "Maximum 8 photos per product."); break; }
      try { const blob = await shrink(file); imgs.push({ blob, preview: URL.createObjectURL(blob) }); drawImgs(); }
      catch (err) { msg($("#m", sheet), err.message); }
    }
  });
  $("#qs", sheet).addEventListener("click", (e) => {
    const s = e.target.dataset.s; if (!s) return;
    const cur = f.sizes.value.split(",").map((x) => x.trim()).filter(Boolean);
    f.sizes.value = (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]).join(", ");
  });

  let saving = false;
  $("#save", sheet).addEventListener("click", async () => {
    if (saving) return;
    const m = $("#m", sheet), btn = $("#save", sheet), v = (n) => f.elements[n].value.trim();
    if (v("name").length < 2) return msg(m, "Please enter the product name.");
    if (!f.category.value) return msg(m, "Please choose a category.");
    const price = Number(v("price")), sale = v("sale_price") === "" ? null : Number(v("sale_price"));
    if (!(price > 0)) return msg(m, "Please enter a valid price.");
    if (sale !== null && !(sale > 0 && sale < price)) return msg(m, "Sale price must be lower than the price.");
    if (!/^\d+$/.test(v("stock"))) return msg(m, "Stock must be a whole number (0 or more).");
    saving = true; btn.disabled = true; msg(m, "");
    try {
      const urls = []; let n = 0; const total = imgs.filter((i) => i.blob).length;
      for (const im of imgs) {
        if (im.blob) { btn.textContent = `Uploading photo ${++n} of ${total}…`; im.url = await upload(im.blob); }   // on failure nothing is saved; already-uploaded photos are kept for the retry
        urls.push(im.url);
      }
      btn.textContent = "Saving…";
      const body = { name: v("name"), category: f.category.value, price, sale_price: sale, stock: Number(v("stock")), sizes: v("sizes"), material: v("material"), description: f.description.value.trim(), image_urls: urls, active: f.active.checked };
      if (edit) body.id = p.id;
      await api("/api/admin/products", { method: edit ? "PATCH" : "POST", body });
      close(); toast("Product saved"); loadProducts();
    } catch (err) { msg(m, err.message); saving = false; btn.disabled = false; btn.textContent = "Save product"; }
  });
}

/* ------------------------------- ORDERS ------------------------------- */
async function loadOrders() {
  $("#pane").innerHTML = `<div class="tools"><input id="os" type="search" placeholder="Search order no., name, phone…" value="${esc(filter.search)}"><select id="of"><option value="">All statuses</option>${STATUSES.map((s) => `<option ${filter.status === s ? "selected" : ""}>${s}</option>`).join("")}</select><select id="op"><option value="">All payments</option>${["pending", "paid", "failed", "cancelled"].map((s) => `<option ${filter.payment === s ? "selected" : ""}>${s}</option>`).join("")}</select></div><div id="ol"><p class="muted">Loading…</p></div>`;
  let t; $("#os").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { filter.search = e.target.value.trim(); fetchOrders(); }, 350); });
  $("#of").onchange = (e) => { filter.status = e.target.value; fetchOrders(); };
  $("#op").onchange = (e) => { filter.payment = e.target.value; fetchOrders(); };
  fetchOrders();
}
async function fetchOrders() {
  const p = new URLSearchParams(Object.entries(filter).filter(([, v]) => v));
  try { orders = (await api("/api/admin/orders?" + p)).orders; } catch (e) { $("#ol").innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }
  $("#ol").innerHTML = orders.map((o) => `<button class="pcard" style="display:block;width:100%;text-align:left;font:inherit;cursor:pointer" data-o="${esc(o.order_number)}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(o.order_number)}</b><b>${money(o.total)}</b></div><div class="meta">${esc(o.customer_name)} · ${esc(o.phone)} · ${fmtDate(o.created_at)}</div><div style="margin-top:6px">${badge(o.order_status)} ${badge(o.payment_status)} <span class="badge">${o.payment_method === "COD" ? "COD" : "Online"}</span></div></button>`).join("") || '<p class="empty">No orders found.</p>';
}
$("#root").addEventListener("click", (e) => { const b = e.target.closest("[data-o]"); if (b) orderSheet(orders.find((o) => o.order_number === b.dataset.o)); });

function orderSheet(o) {
  if (!o) return;
  const sheet = document.createElement("div"); sheet.className = "sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true");
  document.body.appendChild(sheet); document.body.style.overflow = "hidden";
  const close = () => { sheet.remove(); document.body.style.overflow = ""; };
  const draw = () => {
    sheet.innerHTML = `<div class="sheet-in"><div class="sheet-h"><h2>${esc(o.order_number)}</h2><button class="btn outline sm" id="x" type="button">Close</button></div><div id="m"></div>
    <div class="panel"><div>${badge(o.order_status)} ${badge(o.payment_status)}</div><dl class="dl"><div><dt>Placed</dt><dd>${fmtDate(o.created_at)}</dd></div><div><dt>Payment</dt><dd>${o.payment_method === "COD" ? "Cash on Delivery" : "Online (Razorpay)"}</dd></div>${o.razorpay_payment_id ? `<div><dt>Payment ID</dt><dd>${esc(o.razorpay_payment_id)}</dd></div>` : ""}${o.paid_at ? `<div><dt>Paid at</dt><dd>${fmtDate(o.paid_at)}</dd></div>` : ""}</dl>
    ${o.admin_note && /PAID AFTER CANCELLATION/.test(o.admin_note) ? '<div class="msg err">Customer paid after this order was cancelled. Refund in the Razorpay dashboard or contact the customer.</div>' : ""}</div>
    <div class="panel"><h2>Update status</h2><div class="stbtns">${STATUSES.map((s) => `<button class="btn ${s === o.order_status ? "primary" : "outline"} sm" data-st="${s}" ${o.order_status === "cancelled" && s !== "cancelled" ? "disabled" : ""}>${s}</button>`).join("")}</div><p class="sm muted">Cancelling releases the reserved stock. COD orders become “paid” when set to delivered.</p></div>
    <div class="panel"><h2>Customer</h2><dl class="dl"><div><dt>Name</dt><dd>${esc(o.customer_name)}</dd></div><div><dt>Phone</dt><dd><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a> · <a href="https://wa.me/91${esc(o.phone)}" target="_blank" rel="noopener">WhatsApp</a></dd></div>${o.email ? `<div><dt>Email</dt><dd>${esc(o.email)}</dd></div>` : ""}<div><dt>Address</dt><dd>${esc(o.address)}<br>${esc(o.city || "")}, ${esc(o.state || "")} - ${esc(o.pincode || "")}</dd></div></dl></div>
    <div class="panel"><h2>Items</h2>${o.items.map((i) => `<div class="row"><div>${imgTag(i.image, i.name, { w: 76, h: 76 })}</div><div><div class="nm">${esc(i.name)}</div><div class="muted sm">${i.size ? "Size: " + esc(i.size) + " · " : ""}Qty ${i.qty ?? 1} × ${money(i.unit_price ?? i.price ?? 0)}</div></div></div>`).join("")}<div class="tot"><span>Subtotal</span><span>${money(o.subtotal)}</span></div><div class="tot"><span>Delivery</span><span>${money(o.shipping)}</span></div><div class="tot big"><span>Total</span><span>${money(o.total)}</span></div></div>
    <div class="panel"><h2>Internal note</h2><textarea id="note" maxlength="500" placeholder="Only you can see this">${esc(o.admin_note || "")}</textarea><button class="btn outline sm" id="saveNote" type="button" style="margin-top:8px">Save note</button></div></div>`;
    $("#x", sheet).onclick = close;
  };
  draw();
  sheet.addEventListener("click", async (e) => {
    const st = e.target.closest("[data-st]"), sn = e.target.closest("#saveNote");
    if (!st && !sn) return;
    if (st && st.dataset.st === o.order_status) return;
    if (st && st.dataset.st === "cancelled" && !confirm("Cancel this order? Stock will be returned. If the customer already paid, refund them from Razorpay.")) return;
    try {
      const { order } = await api("/api/admin/orders", { method: "PATCH", body: st ? { orderNumber: o.order_number, status: st.dataset.st } : { orderNumber: o.order_number, note: $("#note", sheet).value } });
      Object.assign(o, order); draw(); toast(st ? "Status updated" : "Note saved"); fetchOrders();
    } catch (err) { msg($("#m", sheet), err.message); sheet.scrollTo(0, 0); }
  });
}
/* -------------------------------- SITE (logo + home picture) -------------------------------- */
function faqToText(json) { try { return (JSON.parse(json || "[]") || []).map((x) => `${x.q} | ${x.a}`).join("\n"); } catch { return ""; } }
function textToFaq(text) {
  const out = [];
  for (const [i, line] of String(text || "").split("\n").entries()) {
    if (!line.trim()) continue;
    const k = line.indexOf("|");
    if (k < 1 || !line.slice(k + 1).trim()) throw new Error(`Line ${i + 1}: write it as  Question | Answer`);
    out.push({ q: line.slice(0, k).trim(), a: line.slice(k + 1).trim() });
  }
  if (out.length > 30) throw new Error("Maximum 30 answers.");
  return out;
}
async function loadSite() {
  let cur;
  try { cur = (await api("/api/admin/settings")).settings; } catch (e) { $("#pane").innerHTML = `<div class="msg err">${esc(e.message)}</div><p class="sm muted">If this keeps failing, run the new SQL (site_settings table) in Supabase once.</p>`; return; }
  // state per slot: {url} existing | {blob, preview} new | null removed/empty
  const slots = { logo_url: cur.logo_url ? { url: cur.logo_url } : null, hero_url: cur.hero_url ? { url: cur.hero_url } : null };
  const box = (key, title, help, extra) => `<div class="panel"><h2>${title}</h2><p class="sm muted">${help}</p><div class="sprev ${extra}" id="pv_${key}"></div><input type="file" id="f_${key}" accept="image/png,image/jpeg,image/webp"><button class="btn danger sm" type="button" id="rm_${key}" style="margin-top:8px">Remove picture</button></div>`;
  $("#pane").innerHTML = box("logo_url", "Logo (top header)", "Shown at the top of every page instead of the text. A PNG with a transparent background looks best (wide, about 400 × 120).", "logo") +
    box("hero_url", "Home page picture", "The picture next to “Thakur Ji Poshak & Ladies Wear” on the home page. Use a wide photo (4:3). If empty, the plain “SJC” card is shown.", "hero") +
    '<div id="m"></div><button class="btn primary lg" id="saveSite" type="button" style="width:100%">Save logo &amp; picture</button><p class="sm muted">Changes appear on the website within about a minute.</p>' +
    `<div class="panel" style="margin-top:18px"><h2>SHRI JI Assistant (chat)</h2><p class="sm muted">The chat button on the shop. It answers from your products and from the answers you write below. It never sees orders.</p>
     <label class="sw"><input type="checkbox" id="chatOn" ${cur.chat_enabled === "0" ? "" : "checked"}> Show the chat assistant on the shop</label>
     <label class="f">Your answers <small>(one per line: Question | Answer)</small><textarea id="chatFaq" rows="8" placeholder="Do you give returns? | Write your real return policy here&#10;Shop timing? | 10 AM to 8 PM">${esc(faqToText(cur.chat_faq))}</textarea></label>
     <p class="sm muted" id="faqCount"></p><div id="mc"></div>
     <button class="btn primary" id="saveChat" type="button" style="width:100%">Save assistant settings</button>
     <p class="sm muted">Only write policies and facts that are true. The assistant will not make up delivery times or return rules; it says "ask the shop" if there is no answer here.</p></div>`;
  const draw = () => { for (const k of Object.keys(slots)) { const s = slots[k]; $("#pv_" + k).innerHTML = s ? `<img src="${esc(s.preview || s.url)}" alt="${k === "logo_url" ? "Logo" : "Home picture"} preview">` : '<span class="muted sm">No picture (default is shown)</span>'; $("#rm_" + k).hidden = !s; } };
  draw();
  const countFaq = () => { try { $("#faqCount").textContent = `${textToFaq($("#chatFaq").value).length} answer(s) ready`; } catch (e) { $("#faqCount").textContent = e.message; } };
  $("#chatFaq").addEventListener("input", countFaq); countFaq();
  $("#saveChat").addEventListener("click", async () => {
    const b = $("#saveChat"); b.disabled = true; msg($("#mc"), "");
    try {
      const faq = textToFaq($("#chatFaq").value);
      const d = await api("/api/admin/settings", { method: "PATCH", body: { chat_enabled: $("#chatOn").checked ? "1" : "0", chat_faq: faq } });
      Object.assign(cur, d.settings); toast("Assistant settings saved"); msg($("#mc"), "Saved. Changes appear within about a minute.", "ok");
    } catch (err) { msg($("#mc"), err.message); }
    b.disabled = false;
  });
  for (const k of Object.keys(slots)) {
    $("#f_" + k).addEventListener("change", async (e) => {
      const file = e.target.files[0]; e.target.value = ""; if (!file) return; msg($("#m"), "");
      try { const blob = await shrink(file, k === "logo_url" ? { max: 600, png: file.type === "image/png" } : { max: 1600 }); if (slots[k]?.preview) URL.revokeObjectURL(slots[k].preview); slots[k] = { blob, preview: URL.createObjectURL(blob) }; draw(); }
      catch (err) { msg($("#m"), err.message); }
    });
    $("#rm_" + k).addEventListener("click", () => { slots[k] = null; draw(); });
  }
  let saving = false;
  $("#saveSite").addEventListener("click", async () => {
    if (saving) return; saving = true; const btn = $("#saveSite"); btn.disabled = true; msg($("#m"), "");
    try {
      const body = {};
      for (const k of Object.keys(slots)) { const s = slots[k]; if (!s) { if (cur[k]) body[k] = ""; continue; } if (s.blob) { btn.textContent = "Uploading…"; s.url = await upload(s.blob); body[k] = s.url; } }
      if (!Object.keys(body).length) { msg($("#m"), "Nothing changed.", "info"); }
      else { btn.textContent = "Saving…"; const d = await api("/api/admin/settings", { method: "PATCH", body }); Object.assign(cur, d.settings); toast("Saved"); }
    } catch (err) { msg($("#m"), err.message); }
    saving = false; btn.disabled = false; btn.textContent = "Save changes";
  });
}
boot();


/* --------------------------- CUSTOMER REVIEWS --------------------------- */
async function loadReviews() {
  const pane = $("#pane");
  pane.innerHTML = `<div class="tools"><label class="sm muted" for="reviewFilter">Show reviews by status</label><select id="reviewFilter"><option value="pending" ${reviewStatus === "pending" ? "selected" : ""}>Pending approval</option><option value="approved" ${reviewStatus === "approved" ? "selected" : ""}>Approved / public</option><option value="rejected" ${reviewStatus === "rejected" ? "selected" : ""}>Rejected / hidden</option><option value="all" ${reviewStatus === "all" ? "selected" : ""}>All reviews</option></select></div><p class="sm muted">New reviews stay private until you approve them. Only approved reviews appear on product pages and in public rating totals.</p><div id="reviewList"><p class="muted">Loading reviews…</p></div>`;
  $("#reviewFilter", pane).addEventListener("change", (e) => { reviewStatus = e.target.value; loadReviews(); });
  let data;
  try { data = await api(`/api/admin/reviews?status=${encodeURIComponent(reviewStatus)}`); }
  catch (error) { $("#reviewList", pane).innerHTML = `<div class="msg err">${esc(error.message)}</div><p class="sm muted">If this says reviews are not configured, run <code>migrations/20261010_product_reviews.sql</code> in Supabase SQL Editor.</p>`; return; }
  const rows = data.reviews || [];
  $("#reviewList", pane).innerHTML = rows.map((r) => {
    const n = Math.max(0, Math.min(5, Number(r.rating) || 0));
    const product = r.product ? `<a href="/product/${encodeURIComponent(r.product.slug)}" target="_blank" rel="noopener">${esc(r.product.name)}</a>` : `Product #${Number(r.product_id)}`;
    return `<article class="review-admin-card"><div class="review-head"><div><b>${esc(r.customer_name)}</b><div class="muted sm">${product} · ${fmtDate(r.created_at)}</div></div>${badge(r.status)}</div><div class="review-rating"><span class="stars" role="img" aria-label="${n} out of 5 stars">${"★".repeat(n)}${"☆".repeat(5 - n)}</span> <b>${n}/5</b></div><p class="review-copy">${esc(r.comment).replace(/\n/g, "<br>")}</p><div class="acts">${r.status !== "approved" ? `<button class="btn primary sm" data-review-act="approve" data-review-id="${Number(r.id)}">Approve &amp; publish</button>` : `<button class="btn outline sm" data-review-act="pending" data-review-id="${Number(r.id)}">Hide / pending</button>`}${r.status !== "rejected" ? `<button class="btn outline sm" data-review-act="reject" data-review-id="${Number(r.id)}">Reject</button>` : ""}<button class="btn danger sm" data-review-act="delete" data-review-id="${Number(r.id)}">Delete</button></div></article>`;
  }).join("") || '<p class="empty">No reviews in this status yet.</p>';
  $("#reviewList", pane).addEventListener("click", async (event) => {
    const button = event.target.closest("[data-review-act]"); if (!button) return;
    const id = Number(button.dataset.reviewId), action = button.dataset.reviewAct;
    if (action === "delete" && !confirm("Delete this customer review permanently? This cannot be undone.")) return;
    button.disabled = true;
    try {
      if (action === "delete") await api("/api/admin/reviews", { method: "DELETE", body: { id } });
      else await api("/api/admin/reviews", { method: "PATCH", body: { id, status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending" } });
      toast(action === "approve" ? "Review published" : action === "delete" ? "Review deleted" : action === "reject" ? "Review rejected" : "Review moved to pending");
      loadReviews();
    } catch (error) { alert(error.message); button.disabled = false; }
  });
}
