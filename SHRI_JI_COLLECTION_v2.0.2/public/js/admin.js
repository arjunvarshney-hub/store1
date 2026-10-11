import { api, esc, money, $, $$, msg, badge, fmtDate, toast } from "./common.js";
import { imgTag, effPrice } from "./render.js";
import { GROUPS, CATEGORIES, LEGACY_CATEGORIES, ADMIN_CATEGORIES, catName } from "./categories.js";

const R = $("#root");
const STATUSES = ["pending", "confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered", "cancelled"];
let tab = "products", products = [], orders = [], adminCategories = [...ADMIN_CATEGORIES.map(c => ({ ...c, group_slug: c.group, active: !LEGACY_CATEGORIES.some(x => x.slug === c.slug), is_legacy: LEGACY_CATEGORIES.some(x => x.slug === c.slug), sort_order: 100 }))], returns = [], cancellationRequests = [], reviewStatus = "pending", filter = { search: "", status: "", payment: "", method: "", delivery: "", from: "", to: "", minTotal: "", maxTotal: "", sort: "newest", page: 1 };
let productFilter = { q: "", category: "", visibility: "all", stock: "all", returns: "all", colour: "", size: "", packSize: "", minPrice: "", maxPrice: "", sort: "new" };

async function boot() {
  try {
    const me = await api("/api/auth/me");
    if (!me.user) { R.innerHTML = `<div class="panel"><h2>Please log in</h2><p class="muted">Log in with the shop owner account.</p><a class="btn primary" href="/account?next=/admin">Log in</a></div>`; return; }
    if (!me.isAdmin) { R.innerHTML = `<div class="panel"><h2>Access denied</h2><p class="muted">${esc(me.user.email)} is not an administrator.</p><a class="btn outline" href="/">Back to shop</a></div>`; return; }
  } catch (e) { R.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }
  show("products");
}
function shell(inner) {
  R.innerHTML = `<div class="atabs" role="tablist"><button class="${tab === "products" ? "on" : ""}" data-t="products" role="tab" aria-selected="${tab === "products"}">Products</button><button class="${tab === "orders" ? "on" : ""}" data-t="orders" role="tab" aria-selected="${tab === "orders"}">Orders</button><button class="${tab === "cancellations" ? "on" : ""}" data-t="cancellations" role="tab" aria-selected="${tab === "cancellations"}">Cancellation Requests</button><button class="${tab === "returns" ? "on" : ""}" data-t="returns" role="tab" aria-selected="${tab === "returns"}">Returns</button><button class="${tab === "categories" ? "on" : ""}" data-t="categories" role="tab" aria-selected="${tab === "categories"}">Categories</button><button class="${tab === "reviews" ? "on" : ""}" data-t="reviews" role="tab" aria-selected="${tab === "reviews"}">Reviews</button><button class="${tab === "site" ? "on" : ""}" data-t="site" role="tab" aria-selected="${tab === "site"}">Site</button></div><div id="pane">${inner}</div>`;
  $$(".atabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.t)));
}
function show(t) {
  tab = t; shell('<p class="muted">Loading…</p>');
  const loaders = { products: loadProducts, orders: loadOrders, cancellations: loadCancellations, returns: loadReturns, categories: loadCategories, reviews: loadReviews, site: loadSite };
  (loaders[t] || loadProducts)();
}

/* ------------------------------ PRODUCTS ------------------------------ */
async function loadProducts() {
  try {
    const cd = await api("/api/admin?action=categories"); if (Array.isArray(cd.categories)) adminCategories = cd.categories;
    products = (await api("/api/admin?action=products")).products;
  } catch (e) { $("#pane").innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }
  drawProducts();
}
function drawProducts() {
  let list = products.filter((p) => {
    const q = productFilter.q.toLowerCase();
    const searchable = `${p.name || ""} ${p.sku || ""} ${p.id} ${p.category || ""} ${p.custom_category_name || ""} ${catName(p.category)} ${p.subcategory || ""} ${(p.variants || []).map((v) => `${v.sku || ""} ${v.label || ""}`).join(" ")}`.toLowerCase();
    if (q && !searchable.includes(q)) return false;
    if (productFilter.category && p.category !== productFilter.category) return false;
    if (productFilter.visibility === "active" && (!p.active || p.archived_at)) return false;
    if (productFilter.visibility === "inactive" && (p.active || p.archived_at)) return false;
    if (productFilter.visibility === "archived" && !p.archived_at) return false;
    if (productFilter.stock === "in" && Number(p.stock) <= 0) return false;
    if (productFilter.stock === "out" && Number(p.stock) > 0) return false;
    if (productFilter.stock === "low" && !(Number(p.stock) > 0 && Number(p.stock) <= Number(p.low_stock_threshold ?? 5))) return false;
    if (productFilter.returns === "yes" && !p.return_eligible) return false;
    if (productFilter.returns === "no" && p.return_eligible) return false;
    if (productFilter.returns === "sale" && !(p.sale_price > 0 && p.sale_price < p.price)) return false;
    const variants = Array.isArray(p.variants) ? p.variants : [];
    if (productFilter.colour && !variants.some(v => String(v.attributes?.Colour || v.attributes?.Color || "").toLowerCase() === productFilter.colour.toLowerCase())) return false;
    if (productFilter.size && !((p.sizes || []).some(x => String(x).toLowerCase() === productFilter.size.toLowerCase()) || variants.some(v => String(v.attributes?.Size || "").toLowerCase() === productFilter.size.toLowerCase()))) return false;
    if (productFilter.packSize && !(variants.some(v => String(v.pack_quantity || 1) === productFilter.packSize || String(v.attributes?.["Pack Size"] || "").toLowerCase() === productFilter.packSize.toLowerCase()) || (!variants.length && String(p.pack_size || 1) === productFilter.packSize))) return false;
    const effective = Number(p.sale_price > 0 && p.sale_price < p.price ? p.sale_price : p.price);
    if (productFilter.minPrice !== "" && effective < Number(productFilter.minPrice)) return false;
    if (productFilter.maxPrice !== "" && effective > Number(productFilter.maxPrice)) return false;
    return true;
  });
  const sorters = {
    new: (a,b) => String(b.created_at || "").localeCompare(String(a.created_at || "")),
    old: (a,b) => String(a.created_at || "").localeCompare(String(b.created_at || "")),
    name_asc: (a,b) => String(a.name || "").localeCompare(String(b.name || "")),
    name_desc: (a,b) => String(b.name || "").localeCompare(String(a.name || "")),
    price_asc: (a,b) => Number(a.sale_price || a.price) - Number(b.sale_price || b.price),
    price_desc: (a,b) => Number(b.sale_price || b.price) - Number(a.sale_price || a.price),
    stock_asc: (a,b) => Number(a.stock) - Number(b.stock),
    stock_desc: (a,b) => Number(b.stock) - Number(a.stock),
    updated: (a,b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")),
  };
  list.sort(sorters[productFilter.sort] || sorters.new);
  const catOptions = adminCategories.map((c) => `<option value="${esc(c.slug)}" ${productFilter.category === c.slug ? "selected" : ""}>${esc(c.name)}${c.is_legacy ? " (legacy)" : !c.active ? " (inactive)" : ""}</option>`).join("");
  const allColours = [...new Set(products.flatMap(p => (p.variants || []).map(v => v.attributes?.Colour || v.attributes?.Color || "")).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const allSizes = [...new Set(products.flatMap(p => [...(p.sizes || []), ...(p.variants || []).map(v => v.attributes?.Size || "")]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const allPacks = [...new Set(products.flatMap(p => (p.variants || []).map(v => String(v.pack_quantity || 1))).concat(products.filter(p => !(p.variants || []).length).map(p => String(p.pack_size || 1))))].sort((a,b)=>Number(a)-Number(b));
  const facetOptions = (vals, selected, label) => `<option value="">All ${label}</option>${vals.map(v => `<option value="${esc(v)}" ${selected === v ? "selected" : ""}>${esc(v)}</option>`).join("")}`;
  const activeCount = products.filter((p) => p.active && !p.archived_at).length;
  const lowCount = products.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= Number(p.low_stock_threshold ?? 5) && !p.archived_at).length;
  $("#pane").innerHTML = `<div class="tools"><input id="ps" type="search" placeholder="Search name, SKU, ID, category, variant SKU…" value="${esc(productFilter.q)}"><button class="btn primary" id="add" type="button">+ Add product</button></div>
  <div class="filter-grid"><select id="pcat" aria-label="Filter category"><option value="">All categories</option>${catOptions}</select><select id="pvisibility" aria-label="Filter visibility"><option value="all">All status</option><option value="active" ${productFilter.visibility === "active" ? "selected" : ""}>Active / visible</option><option value="inactive" ${productFilter.visibility === "inactive" ? "selected" : ""}>Inactive / hidden</option><option value="archived" ${productFilter.visibility === "archived" ? "selected" : ""}>Archived</option></select><select id="pstock" aria-label="Filter stock"><option value="all">All stock</option><option value="in" ${productFilter.stock === "in" ? "selected" : ""}>In stock</option><option value="out" ${productFilter.stock === "out" ? "selected" : ""}>Out of stock</option><option value="low" ${productFilter.stock === "low" ? "selected" : ""}>Low stock (${lowCount})</option></select><select id="preturn" aria-label="Filter return or sale"><option value="all">Return / sale: all</option><option value="yes" ${productFilter.returns === "yes" ? "selected" : ""}>Return eligible</option><option value="no" ${productFilter.returns === "no" ? "selected" : ""}>Non-returnable</option><option value="sale" ${productFilter.returns === "sale" ? "selected" : ""}>Sale products</option></select><select id="psort" aria-label="Sort products">${[["new","Newest first"],["old","Oldest first"],["name_asc","Name A–Z"],["name_desc","Name Z–A"],["price_asc","Price low to high"],["price_desc","Price high to low"],["stock_asc","Stock low to high"],["stock_desc","Stock high to low"],["updated","Recently updated"]].map(([v,l]) => `<option value="${v}" ${productFilter.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select><select id="pcolour" aria-label="Filter colour">${facetOptions(allColours, productFilter.colour, "colours")}</select><select id="psize" aria-label="Filter size">${facetOptions(allSizes, productFilter.size, "sizes")}</select><select id="ppack" aria-label="Filter pack size">${facetOptions(allPacks, productFilter.packSize, "pack sizes")}</select><label class="f sm">Min price ₹<input id="pminprice" type="number" min="0" step="0.01" value="${esc(productFilter.minPrice)}"></label><label class="f sm">Max price ₹<input id="pmaxprice" type="number" min="0" step="0.01" value="${esc(productFilter.maxPrice)}"></label><button class="btn outline sm" id="clearProductFilters" type="button">Clear filters</button></div>
  <p class="sm muted">${list.length} result${list.length === 1 ? "" : "s"} · ${products.length} total records · ${activeCount} visible on shop</p>` +
    (list.map((p) => `<div class="pcard"><div>${imgTag(p.image_urls?.[0], p.name, { w: 72, h: 72 })}</div><div><div class="nm">${esc(p.name)} ${p.archived_at ? '<span class="badge">archived</span>' : ""}</div><div class="meta">${esc(p.custom_category_name || catName(p.category))}${p.sku ? ` · SKU ${esc(p.sku)}` : ""} · ${money(p.sale_price || p.price)}${p.sale_price ? ` <s>${money(p.price)}</s>` : ""} · Stock ${p.stock}${p.variants?.length ? ` · ${p.variants.length} variants` : ""}</div><div class="meta">${p.return_eligible ? `Returns: ${Number(p.return_window_days) || 0} days` : "Non-returnable"}${Number(p.stock) <= Number(p.low_stock_threshold ?? 5) ? ' · <b class="warn">Low stock</b>' : ""}</div>
      <div class="acts"><label class="sw"><input type="checkbox" data-act="toggle" data-id="${p.id}" ${p.active && !p.archived_at ? "checked" : ""} ${p.archived_at ? "disabled" : ""}> ${p.active && !p.archived_at ? "Visible" : "Hidden"}</label><button class="btn outline sm" data-act="edit" data-id="${p.id}">Edit</button>${!p.archived_at ? `<button class="btn danger sm" data-act="del" data-id="${p.id}">Delete / Archive</button>` : `<button class="btn outline sm" data-act="restore" data-id="${p.id}">Restore</button>`}</div></div></div>`).join("") || '<p class="empty">No products match these filters. Clear filters or add a product.</p>');
  $("#ps").addEventListener("input", (e) => { productFilter.q = e.target.value; drawProducts(); const el = $("#ps"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
  $("#pcat").onchange = (e) => { productFilter.category = e.target.value; drawProducts(); };
  $("#pvisibility").onchange = (e) => { productFilter.visibility = e.target.value; drawProducts(); };
  $("#pstock").onchange = (e) => { productFilter.stock = e.target.value; drawProducts(); };
  $("#preturn").onchange = (e) => { productFilter.returns = e.target.value; drawProducts(); };
  $("#psort").onchange = (e) => { productFilter.sort = e.target.value; drawProducts(); };
  $("#clearProductFilters").onclick = () => { productFilter = { q: "", category: "", visibility: "all", stock: "all", returns: "all", colour: "", size: "", packSize: "", minPrice: "", maxPrice: "", sort: "new" }; drawProducts(); };
  $("#add").onclick = () => productForm();
}
$("#root").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]"); if (!b || b.tagName === "INPUT") return;
  const p = products.find((x) => x.id === Number(b.dataset.id));
  if (b.dataset.act === "edit" && p) productForm(p);
  if (b.dataset.act === "del" && p && confirm(`Delete “${p.name}” if it has never been ordered; otherwise archive it. Existing orders and photos will be preserved.`)) {
    try { const d = await api("/api/admin?action=products", { method: "DELETE", body: { id: p.id } }); toast(d.archived ? "Archived to preserve order history" : "Deleted"); loadProducts(); } catch (err) { alert(err.message); }
  }
  if (b.dataset.act === "restore" && p && confirm(`Restore “${p.name}” to the active catalogue?`)) {
    try { await api("/api/admin?action=products", { method: "PATCH", body: { id: p.id, archived_at: null, active: true } }); toast("Product restored"); loadProducts(); } catch (err) { alert(err.message); }
  }
});
$("#root").addEventListener("change", async (e) => {
  const b = e.target.closest('[data-act="toggle"]'); if (!b) return;
  try { await api("/api/admin?action=products", { method: "PATCH", body: { id: Number(b.dataset.id), active: b.checked } }); toast(b.checked ? "Product is now visible" : "Product hidden"); loadProducts(); }
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
  let imgs = (p?.image_urls || []).map((url) => ({ url }));
  let specs = Array.isArray(p?.specifications) ? p.specifications.map((x) => ({ label: x.label || "", value: x.value || "" })) : [];
  let variants = Array.isArray(p?.variants) ? p.variants.map((v) => ({ ...v, attributes: { ...(v.attributes || {}) } })) : [];
  const sheet = document.createElement("div"); sheet.className = "sheet"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true");
  const publicCats = adminCategories.filter(c => !c.is_legacy);
  const catGroups = GROUPS.map((g) => `<optgroup label="${esc(g.name)}">${publicCats.filter((c) => (c.group_slug || c.group) === g.slug).map((c) => `<option value="${esc(c.slug)}" ${p?.category === c.slug ? "selected" : ""}>${esc(c.name)}${!c.active ? " (inactive)" : ""}</option>`).join("")}</optgroup>`).join("");
  const legacyOpts = adminCategories.filter(c => c.is_legacy || LEGACY_CATEGORIES.some(x => x.slug === c.slug)).map((c) => `<option value="${esc(c.slug)}" ${p?.category === c.slug ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  const customSelected = p?.category === "__other__" || (!!p?.category?.startsWith("custom-") && !adminCategories.some(c => c.slug === p.category));
  const catValue = customSelected ? "__other__" : (p?.category || "");
  const specRow = (x, i) => `<div class="spec-editor-row" data-spec-row><label class="f">Label<input data-spec-label maxlength="80" value="${esc(x.label)}" placeholder="e.g. Colour"></label><label class="f">Value<input data-spec-value maxlength="300" value="${esc(x.value)}" placeholder="e.g. Red and Gold"></label><div class="acts"><button type="button" class="btn outline sm" data-spec-up="${i}" ${i===0?"disabled":""}>↑</button><button type="button" class="btn outline sm" data-spec-down="${i}" ${i===specs.length-1?"disabled":""}>↓</button><button type="button" class="btn danger sm" data-spec-remove="${i}">Remove</button></div></div>`;
  const variantRow = (v, i) => `<div class="variant-editor-row" data-variant-row data-variant-id="${esc(v.id || "")}">
    <div class="variant-row-head"><b>Variant ${i+1}</b><button type="button" class="btn danger sm" data-variant-remove="${i}">Remove variant</button></div>
    <label class="f">Variant name *<input data-v-label maxlength="120" value="${esc(v.label || "")}" placeholder="e.g. Red · Pack of 3"></label>
    <div class="two"><label class="f">Variant SKU<input data-v-sku maxlength="80" value="${esc(v.sku || "")}" placeholder="Optional SKU"></label><label class="f">Colour<input data-v-colour maxlength="80" value="${esc(v.attributes?.Colour || "")}" placeholder="Any colour"></label></div>
    <div class="two"><label class="f">Size<input data-v-size maxlength="80" value="${esc(v.attributes?.Size || "")}"></label><label class="f">Material<input data-v-material maxlength="80" value="${esc(v.attributes?.Material || "")}"></label></div>
    <div class="two"><label class="f">Design<input data-v-design maxlength="80" value="${esc(v.attributes?.Design || "")}"></label><label class="f">Pack label<input data-v-packlabel maxlength="80" value="${esc(v.attributes?.["Pack Size"] || (Number(v.pack_quantity)>1?`Pack of ${v.pack_quantity}`:"Single Piece"))}"></label></div>
    <div class="four"><label class="f">Pieces per pack *<input data-v-pack type="number" min="1" max="10000" step="1" value="${Number(v.pack_quantity) || 1}"></label><label class="f">Minimum packs *<input data-v-min type="number" min="1" max="1000" step="1" value="${Number(v.min_order_qty) || 1}"></label><label class="f">Regular price ₹ *<input data-v-price type="number" min="0.01" step="0.01" value="${v.price ?? ""}"></label><label class="f">Sale price ₹<input data-v-sale type="number" min="0.01" step="0.01" value="${v.sale_price ?? ""}"></label></div>
    <div class="two"><label class="f">Stock (individual pieces) *<input data-v-stock type="number" min="0" step="1" value="${Number(v.stock) || 0}"></label><label class="sw" style="align-self:end;padding:12px 0"><input data-v-active type="checkbox" ${v.active === false ? "" : "checked"}> Available to buy</label></div>
    <p class="sm muted">Stock is counted as individual pieces. Ordering one pack subtracts the “Pieces per pack” amount.</p></div>`;
  sheet.innerHTML = `<div class="sheet-in"><div class="sheet-h"><h2>${edit ? "Edit product" : "Add product"}</h2><button class="btn outline sm" id="x" type="button">Close</button></div>
  <form id="pf" novalidate>
   <div class="panel"><h3>Basic information</h3><label class="f">Product name *<input name="name" maxlength="120" required value="${esc(p?.name || "")}"></label>
   <div class="two"><label class="f">Product SKU / code<input name="sku" maxlength="80" value="${esc(p?.sku || "")}" placeholder="Optional internal code"></label><label class="f">Brand<input name="brand" maxlength="100" value="${esc(p?.brand || "")}" placeholder="If applicable"></label></div>
   <div class="two"><label class="f">Category *<select name="category" required><option value="">Choose category…</option>${catGroups}<optgroup label="Legacy categories — reassign if possible">${legacyOpts}</optgroup><option value="__other__" ${customSelected ? "selected" : ""}>Others — custom category</option></select></label><label class="f">Subcategory<input name="subcategory" maxlength="100" value="${esc(p?.subcategory || "")}" placeholder="Optional"></label></div>
   <div id="customCategoryBox" ${customSelected ? "" : "hidden"}><label class="f">Custom category name *<input name="custom_category_name" maxlength="80" value="${esc(p?.custom_category_name || "")}" placeholder="Enter a reusable name"></label><label class="f">Primary group<select name="custom_category_group"><option value="thakur-ji-poshak" ${p?.custom_category_group !== "ladies-wear" ? "selected" : ""}>Thakur Ji Poshak</option><option value="ladies-wear" ${p?.custom_category_group === "ladies-wear" ? "selected" : ""}>Ladies Wear</option></select></label><p class="sm muted">Using the same custom name reuses the same category slug. The category is saved and reused automatically, and appears in the customer shop navigation after it is created.</p></div>
   ${LEGACY_CATEGORIES.some((c) => c.slug === p?.category) ? '<div class="msg info">This product uses a legacy category removed from customer navigation. Reassign it to a current category or archive it; the product record is preserved.</div>' : ""}</div>
   <div class="panel"><h3>Pricing &amp; inventory</h3><div class="two"><label class="f">Regular price ₹ *<input name="price" type="number" inputmode="decimal" min="0.01" step="0.01" required value="${p?.price ?? ""}"></label><label class="f">Sale price ₹<input name="sale_price" type="number" inputmode="decimal" min="0.01" step="0.01" value="${p?.sale_price ?? ""}"></label></div>
   <div class="two"><label class="f">Cost price ₹ <small>(admin only)</small><input name="cost_price" type="number" min="0" step="0.01" value="${p?.cost_price ?? ""}"></label><label class="f">Low-stock alert threshold<input name="low_stock_threshold" type="number" min="0" step="1" value="${Number(p?.low_stock_threshold ?? 5)}"></label></div>
   <div class="two"><label class="f">Stock (individual pieces)<input name="stock" type="number" min="0" step="1" value="${Number(p?.stock ?? 1)}"></label><label class="f">Minimum order quantity<input name="min_order_qty" type="number" min="1" step="1" value="${Number(p?.min_order_qty ?? 1)}"></label></div>
   <div class="two"><label class="f">Pack size (pieces per package)<input name="pack_size" type="number" min="1" step="1" value="${Number(p?.pack_size ?? 1)}"></label><label class="f">Weight (grams)<input name="weight_grams" type="number" min="0" step="0.01" value="${p?.weight_grams ?? ""}"></label></div>
   <div class="three"><label class="f">Length (cm)<input name="length_cm" type="number" min="0.01" step="0.01" value="${p?.dimensions?.length_cm ?? ""}"></label><label class="f">Width (cm)<input name="width_cm" type="number" min="0.01" step="0.01" value="${p?.dimensions?.width_cm ?? ""}"></label><label class="f">Height (cm)<input name="height_cm" type="number" min="0.01" step="0.01" value="${p?.dimensions?.height_cm ?? ""}"></label></div>
   <label class="f">Available sizes (for products without variants)<input name="sizes" maxlength="200" placeholder="e.g. S, M, L, XL or 0, 1, 2" value="${esc((p?.sizes || []).join(", "))}"></label><div class="qs" id="qs">${["S", "M", "L", "XL", "XXL", "Free Size", "0", "1", "2", "3", "4", "5", "6"].map((x) => `<button type="button" data-s="${x}">${x}</button>`).join("")}</div><label class="f">Material<input name="material" maxlength="100" value="${esc(p?.material || "")}" placeholder="Only if known"></label></div>
   <div class="panel"><div class="top2"><div><h3>Variants (optional)</h3><p class="sm muted">Each variant has its own price, sale price, SKU, stock and pack quantity. Stock counts individual pieces.</p></div><button class="btn outline sm" id="addVariant" type="button">+ Add variant</button></div><div id="variantRows">${variants.map(variantRow).join("")}</div></div>
   <div class="panel"><h3>Product description</h3><div class="rich-toolbar" role="toolbar" aria-label="Description formatting">${[["bold","B"],["italic","I"],["underline","U"],["insertUnorderedList","• List"],["insertOrderedList","1. List"],["formatBlock","H3"],["justifyLeft","Left"],["justifyCenter","Center"],["undo","Undo"],["redo","Redo"],["removeFormat","Clear"],["createLink","Link"]].map(([c,t]) => `<button type="button" data-cmd="${c}" data-label="${t}">${t}</button>`).join("")}</div><div id="descriptionEditor" class="rich-editor" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Product description">${p?.description_html || esc(p?.description || "").replace(/\n/g,"<br>")}</div><p class="sm muted">Formatting is cleaned on the server before it is displayed. Do not add claims or measurements that have not been verified.</p></div>
   <div class="panel"><div class="top2"><div><h3>Specifications</h3><p class="sm muted">Only rows with both label and value are saved and displayed.</p></div><button class="btn outline sm" id="addSpec" type="button">+ Add row</button></div><div id="specRows">${specs.map(specRow).join("")}</div></div>
   <div class="panel"><h3>Return policy for this product</h3><label class="f">Return eligibility<select name="return_eligible"><option value="false" ${!p?.return_eligible ? "selected" : ""}>Non-returnable</option><option value="true" ${p?.return_eligible ? "selected" : ""}>Return eligible</option></select></label><div class="two"><label class="f">Return window (days from delivery)<input name="return_window_days" type="number" min="0" max="90" step="1" value="${Number(p?.return_window_days || 0)}"></label><label class="f">Refund policy<textarea name="refund_policy" maxlength="1500">${esc(p?.refund_policy || "")}</textarea></label></div><label class="f">Return conditions<textarea name="return_conditions" maxlength="1500">${esc(p?.return_conditions || "")}</textarea></label><label class="f">Return instructions<textarea name="return_instructions" maxlength="1500">${esc(p?.return_instructions || "")}</textarea></label><p class="sm muted">A non-returnable setting does not remove applicable consumer-law rights for defective, damaged or incorrect products.</p></div>
   <div class="panel"><h3>Photos</h3><p class="sm muted">Select from an Android camera or gallery. Up to 8 photos; use arrows to reorder and choose the main photo.</p><input id="files" type="file" accept="image/jpeg,image/png,image/webp" multiple style="margin-top:6px"><div class="imgs" id="imgs"></div></div>
   <div class="panel"><label class="sw"><input type="checkbox" name="active" ${p ? (p.active ? "checked" : "") : "checked"} ${p?.archived_at ? "disabled" : ""}> Visible on the shop</label><label class="sw" style="margin-top:8px"><input type="checkbox" name="featured" ${p?.featured ? "checked" : ""}> Feature in product collections</label>${p?.archived_at ? `<p class="sm warn">Archived on ${esc(p.archived_at)}. Use Restore from the product list to reactivate.</p>` : ""}<div id="m"></div></div>
   </form><div class="sheet-f"><button class="btn outline" id="cancel" type="button">Cancel</button><button class="btn primary" id="save" type="button">Save product</button></div></div>`;
  document.body.appendChild(sheet); document.body.style.overflow = "hidden";
  const close = () => { imgs.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)); sheet.remove(); document.body.style.overflow = ""; };
  $("#x", sheet).onclick = $("#cancel", sheet).onclick = close;
  const f = $("#pf", sheet), editor = $("#descriptionEditor", sheet);
  const catSelect = f.elements.category, customBox = $("#customCategoryBox", sheet);
  catSelect.addEventListener("change", () => { customBox.hidden = catSelect.value !== "__other__"; });
  const drawImgs = () => {
    $("#imgs", sheet).innerHTML = imgs.map((im, i) => `<div class="im ${i === 0 ? "cover" : ""}"><img src="${esc(im.preview || im.url)}" alt="Photo ${i + 1}">${im.blob ? '<span class="pend">NEW</span>' : ""}<button class="x" type="button" data-rm="${i}" aria-label="Remove photo ${i + 1}">×</button>${i === 0 ? '<span class="cv">Cover</span>' : `<button class="mk" type="button" data-cover="${i}">Make cover</button>`}<div class="im-order"><button type="button" data-move-up="${i}" ${i===0?"disabled":""} aria-label="Move photo left">←</button><button type="button" data-move-down="${i}" ${i===imgs.length-1?"disabled":""} aria-label="Move photo right">→</button></div></div>`).join("");
  };
  drawImgs();
  $("#imgs", sheet).addEventListener("click", (e) => {
    const rm = e.target.closest("[data-rm]"), cv = e.target.closest("[data-cover]"), up = e.target.closest("[data-move-up]"), down = e.target.closest("[data-move-down]");
    if (rm) { const [g] = imgs.splice(Number(rm.dataset.rm), 1); if (g.preview) URL.revokeObjectURL(g.preview); drawImgs(); }
    if (cv) { const [g] = imgs.splice(Number(cv.dataset.cover), 1); imgs.unshift(g); drawImgs(); }
    if (up) { const i = Number(up.dataset.moveUp); if (i > 0) { [imgs[i-1], imgs[i]] = [imgs[i], imgs[i-1]]; drawImgs(); } }
    if (down) { const i = Number(down.dataset.moveDown); if (i < imgs.length-1) { [imgs[i+1], imgs[i]] = [imgs[i], imgs[i+1]]; drawImgs(); } }
  });
  $("#files", sheet).addEventListener("change", async (e) => { const files = [...e.target.files]; e.target.value = ""; msg($("#m", sheet), ""); for (const file of files) { if (imgs.length >= 8) { msg($("#m", sheet), "Maximum 8 photos per product."); break; } try { const blob = await shrink(file); imgs.push({ blob, preview: URL.createObjectURL(blob) }); drawImgs(); } catch (err) { msg($("#m", sheet), err.message); } } });
  $("#qs", sheet).addEventListener("click", (e) => { const value = e.target.dataset.s; if (!value) return; const cur = f.sizes.value.split(",").map((x) => x.trim()).filter(Boolean); f.sizes.value = (cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]).join(", "); });
  $(".rich-toolbar", sheet).addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmd]"); if (!b) return; const cmd = b.dataset.cmd; editor.focus();
    if (cmd === "createLink") { const url = prompt("Enter a full https:// link"); if (!url) return; if (!/^https?:\/\//i.test(url)) return msg($("#m", sheet), "Links must begin with https:// or http://"); document.execCommand(cmd, false, url); }
    else if (cmd === "formatBlock") document.execCommand(cmd, false, "h3"); else document.execCommand(cmd, false, null);
  });
  const drawVariants = () => { $("#variantRows", sheet).innerHTML = variants.map(variantRow).join(""); };
  $("#addVariant", sheet).onclick = () => { variants.push({ id: `v_${crypto.randomUUID().replaceAll("-","")}`, label: "", sku: "", attributes: {}, price: f.elements.price.value || "", sale_price: null, stock: 0, pack_quantity: 1, min_order_qty: 1, active: true }); drawVariants(); };
  $("#variantRows", sheet).addEventListener("click", (e) => { const b = e.target.closest("[data-variant-remove]"); if (!b) return; variants.splice(Number(b.dataset.variantRemove), 1); drawVariants(); });
  const readVariants = () => [...$("#variantRows", sheet).querySelectorAll("[data-variant-row]")].map((row) => ({
    id: row.dataset.variantId || `v_${crypto.randomUUID().replaceAll("-","")}`,
    label: $(`[data-v-label]`, row).value.trim(), sku: $(`[data-v-sku]`, row).value.trim(),
    attributes: Object.fromEntries([["Colour", "[data-v-colour]"], ["Size", "[data-v-size]"], ["Material", "[data-v-material]"], ["Design", "[data-v-design]"], ["Pack Size", "[data-v-packlabel]"]].map(([k, sel]) => [k, $(sel, row).value.trim()]).filter(([, val]) => val)),
    pack_quantity: Number($(`[data-v-pack]`, row).value), min_order_qty: Number($(`[data-v-min]`, row).value), price: Number($(`[data-v-price]`, row).value),
    sale_price: $(`[data-v-sale]`, row).value.trim() === "" ? null : Number($(`[data-v-sale]`, row).value), stock: Number($(`[data-v-stock]`, row).value), active: $(`[data-v-active]`, row).checked,
  })).filter((x) => x.label || x.price || x.sku || Object.values(x.attributes).some(Boolean));
  $("#addSpec", sheet).onclick = () => { specs.push({ label: "", value: "" }); $("#specRows", sheet).innerHTML = specs.map(specRow).join(""); };
  $("#specRows", sheet).addEventListener("click", (e) => {
    const rm = e.target.closest("[data-spec-remove]"), up = e.target.closest("[data-spec-up]"), down = e.target.closest("[data-spec-down]");
    if (rm) specs.splice(Number(rm.dataset.specRemove), 1);
    if (up) { const i = Number(up.dataset.specUp); if (i > 0) [specs[i-1], specs[i]] = [specs[i], specs[i-1]]; }
    if (down) { const i = Number(down.dataset.specDown); if (i < specs.length-1) [specs[i+1], specs[i]] = [specs[i], specs[i+1]]; }
    if (rm || up || down) $("#specRows", sheet).innerHTML = specs.map(specRow).join("");
  });
  $("#specRows", sheet).addEventListener("change", () => { specs = [...$("#specRows", sheet).querySelectorAll("[data-spec-row]")].map((row, i) => ({ label: $("[data-spec-label]",row).value, value: $("[data-spec-value]",row).value, sort_order: i })); });
  let saving = false;
  $("#save", sheet).addEventListener("click", async () => {
    if (saving) return;
    const m = $("#m", sheet), btn = $("#save", sheet), val = (n) => String(f.elements[n]?.value ?? "").trim();
    if (val("name").length < 2) return msg(m, "Please enter the product name.");
    if (!catSelect.value) return msg(m, "Please choose a category.");
    if (LEGACY_CATEGORIES.some(c => c.slug === catSelect.value)) return msg(m, "This is a legacy category hidden from customers. Reassign the product to a current category before saving.");
    if (catSelect.value === "__other__" && val("custom_category_name").length < 2) return msg(m, "Please enter the custom category name.");
    const price = Number(val("price")), sale = val("sale_price") === "" ? null : Number(val("sale_price"));
    if (!(price > 0)) return msg(m, "Please enter a valid regular price.");
    if (sale !== null && !(sale > 0 && sale < price)) return msg(m, "Sale price must be lower than regular price.");
    const vr = readVariants();
    if (!vr.length && !/^\d+$/.test(val("stock"))) return msg(m, "Stock must be a whole number (0 or more).");
    for (const [i, v] of vr.entries()) {
      if (v.label.length < 2) return msg(m, `Variant ${i+1}: enter a variant name.`);
      if (!(v.price > 0) || !Number.isInteger(v.stock) || v.stock < 0 || !Number.isInteger(v.pack_quantity) || v.pack_quantity < 1 || !Number.isInteger(v.min_order_qty) || v.min_order_qty < 1) return msg(m, `Variant ${i+1}: check price, stock, pack size and minimum quantity.`);
      if (v.sale_price !== null && !(v.sale_price > 0 && v.sale_price < v.price)) return msg(m, `Variant ${i+1}: sale price must be below regular price.`);
    }
    saving = true; btn.disabled = true; msg(m, "");
    try {
      const urls = []; let n = 0; const total = imgs.filter((i) => i.blob).length;
      for (const im of imgs) { if (im.blob) { btn.textContent = `Uploading photo ${++n} of ${total}…`; im.url = await upload(im.blob); } urls.push(im.url); }
      btn.textContent = "Saving…";
      const editorHtml = editor.innerHTML, descText = (editor.innerText || editor.textContent || "").trim().slice(0,5000);
      const readSpecs = [...$("#specRows", sheet).querySelectorAll("[data-spec-row]")].map((row, i) => ({ label: $("[data-spec-label]",row).value.trim(), value: $("[data-spec-value]",row).value.trim(), sort_order: i })).filter((x) => x.label && x.value);
      const dims = { length_cm: val("length_cm") || null, width_cm: val("width_cm") || null, height_cm: val("height_cm") || null };
      const body = {
        name: val("name"), category: catSelect.value, custom_category_name: catSelect.value === "__other__" ? val("custom_category_name") : (p?.custom_category_name || ""), custom_category_group: val("custom_category_group"),
        sku: val("sku"), brand: val("brand"), subcategory: val("subcategory"), price, sale_price: sale, cost_price: val("cost_price") || null,
        stock: vr.length ? vr.reduce((n, v) => n + v.stock, 0) : Number(val("stock")), low_stock_threshold: Number(val("low_stock_threshold") || 0),
        min_order_qty: Number(val("min_order_qty") || 1), pack_size: Number(val("pack_size") || 1), weight_grams: val("weight_grams") || null,
        dimensions: dims, variants: vr, sizes: val("sizes"), material: val("material"), description: descText, description_html: editorHtml,
        specifications: readSpecs, return_eligible: val("return_eligible") === "true", return_window_days: Number(val("return_window_days") || 0),
        return_conditions: val("return_conditions"), return_instructions: val("return_instructions"), refund_policy: val("refund_policy"),
        image_urls: urls, featured: f.elements.featured.checked, active: f.elements.active.checked, archived_at: p?.archived_at || null,
      };
      if (edit) body.id = p.id;
      await api("/api/admin?action=products", { method: edit ? "PATCH" : "POST", body });
      close(); toast("Product saved"); loadProducts();
    } catch (err) { msg(m, err.message); saving = false; btn.disabled = false; btn.textContent = "Save product"; }
  });
}

/* --------------------------- CATEGORY REGISTRY --------------------------- */
async function loadCategories() {
  try { adminCategories = (await api("/api/admin?action=categories")).categories || []; drawCategoryManager(); }
  catch (e) { $("#pane").innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
function drawCategoryManager() {
  const row = c => `<div class="pcard category-admin-row" data-category-row data-id="${c.id}">
    <div class="category-admin-fields"><label class="f">Display name<input data-field="name" maxlength="80" value="${esc(c.name)}"></label>
    <label class="f">Group<select data-field="group_slug"><option value="thakur-ji-poshak" ${c.group_slug === "thakur-ji-poshak" ? "selected" : ""}>Thakur Ji Poshak</option><option value="ladies-wear" ${c.group_slug === "ladies-wear" ? "selected" : ""}>Ladies Wear</option></select></label>
    <label class="f">Order<input data-field="sort_order" type="number" min="0" max="10000" value="${Number(c.sort_order) || 0}"></label>
    <label class="sw"><input data-field="active" type="checkbox" ${c.active && !c.is_legacy ? "checked" : ""} ${c.is_legacy ? "disabled" : ""}> Active in customer shop</label></div>
    <div class="meta">URL slug: <code>${esc(c.slug)}</code>${c.is_legacy ? " · legacy category — customer-hidden" : ""}</div>
    <div class="acts"><button class="btn primary sm" data-category-save="${c.id}">Save</button><button class="btn danger sm" data-category-delete="${c.id}">${c.is_legacy ? "Keep hidden" : "Delete / Deactivate"}</button></div></div>`;
  $("#pane").innerHTML = `<div class="panel"><h2>Category management</h2><p class="muted sm">Rename categories, change group/order and hide categories from the customer shop. Categories with products are deactivated instead of hard-deleted. Legacy products remain in the database and can be reassigned or archived.</p>
  <form id="newCategory" class="category-admin-fields"><label class="f">New category name<input name="name" required minlength="2" maxlength="80" placeholder="e.g. Shringar Accessories"></label><label class="f">Group<select name="group_slug"><option value="thakur-ji-poshak">Thakur Ji Poshak</option><option value="ladies-wear">Ladies Wear</option></select></label><label class="f">Sort order<input name="sort_order" type="number" value="1000" min="0" max="10000"></label><button class="btn primary" type="submit">+ Add category</button></form><div id="categoryMsg" aria-live="polite"></div></div>
  <h2>Existing categories (${adminCategories.length})</h2><div id="categoryRows">${adminCategories.map(row).join("")}</div>`;
  $("#newCategory").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.currentTarget, data = Object.fromEntries(new FormData(f));
    try { await api("/api/admin?action=categories", { method: "POST", body: { ...data, sort_order: Number(data.sort_order), active: true } }); toast("Category created"); await loadCategories(); }
    catch (err) { msg($("#categoryMsg"), err.message); }
  });
  $("#categoryRows").addEventListener("click", async e => {
    const save = e.target.closest("[data-category-save]"), del = e.target.closest("[data-category-delete]"); if (!save && !del) return;
    const id = Number((save || del).dataset.categorySave || (save || del).dataset.categoryDelete), rowEl = e.target.closest("[data-category-row]"), c = adminCategories.find(x => Number(x.id) === id);
    if (!c) return;
    try {
      if (del) {
        if (c.is_legacy) { toast("Legacy category remains hidden; reassign or archive its products."); return; }
        if (!confirm(`Delete category “${c.name}”? If products use it, it will be deactivated instead.`)) return;
        const d = await api("/api/admin?action=categories", { method: "DELETE", body: { id } }); toast(d.archived ? "Category deactivated" : "Category deleted");
      } else {
        const value = key => $(`[data-field="${key}"]`, rowEl);
        const body = { id, name: value("name").value.trim(), group_slug: value("group_slug").value, sort_order: Number(value("sort_order").value), active: value("active").checked };
        await api("/api/admin?action=categories", { method: "PATCH", body }); toast("Category saved");
      }
      await loadCategories();
    } catch (err) { toast(err.message); }
  });
}

/* ------------------------ CANCELLATION REQUESTS ------------------------ */
async function loadCancellations() {
  const pane = $("#pane");
  pane.innerHTML = `<div class="tools"><input id="cs" type="search" placeholder="Search order number / reason"><select id="cstatus"><option value="requested">Needs review</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="">All requests</option></select><button class="btn outline" id="refreshCancellations">Refresh</button></div><div id="cancellationList"><p class="muted">Loading…</p></div>`;
  let timer;
  $("#cs").addEventListener("input", e => { clearTimeout(timer); timer = setTimeout(fetchCancellations, 300); });
  $("#cstatus").onchange = fetchCancellations; $("#refreshCancellations").onclick = fetchCancellations;
  pane.addEventListener("click", async e => {
    const b = e.target.closest("[data-cancel-review]"); if (!b) return;
    const request = cancellationRequests.find(x => Number(x.id) === Number(b.dataset.id)); if (!request) return;
    const status = b.dataset.cancelReview;
    if (status === "approved" && !confirm(`Approve cancellation for ${request.order_number}? Stock will be restored by the database. If it is a paid online order, first issue the refund in the gateway dashboard.`)) return;
    const decision_reason = prompt(status === "approved" ? "Approval note" : "Reason for rejection", status === "approved" ? "Cancellation approved" : "Please contact the shop to discuss this order.");
    if (decision_reason === null) return;
    let refund_reference;
    if (status === "approved" && request.order_snapshot?.payment_method === "ONLINE" && request.order_snapshot?.payment_status === "paid") {
      refund_reference = prompt("After completing the refund in the gateway dashboard, enter its refund/reference ID. This does not send a refund:");
      if (refund_reference === null) return;
      if (refund_reference.trim().length < 4) { alert("Enter a valid gateway refund reference."); return; }
    }
    b.disabled = true;
    try { await api("/api/admin?action=cancellations", { method: "PATCH", body: { id: request.id, status, decision_reason, ...(refund_reference ? { refund_reference: refund_reference.trim() } : {}) } }); toast(status === "approved" ? "Cancellation approved" : "Request rejected"); await fetchCancellations(); }
    catch (err) { alert(err.message); b.disabled = false; }
  });
  await fetchCancellations();
}
async function fetchCancellations() {
  const p = new URLSearchParams(); if ($("#cstatus")?.value) p.set("status", $("#cstatus").value); if ($("#cs")?.value.trim()) p.set("search", $("#cs").value.trim());
  try {
    cancellationRequests = (await api("/api/admin?action=cancellations&" + p)).requests || [];
    $("#cancellationList").innerHTML = cancellationRequests.map(r => {
      const o = r.order_snapshot || {};
      const items = (o.items || []).map(i => `${esc(i.name || "Product")} × ${Number(i.qty || 1)}${i.variant_label ? ` · ${esc(i.variant_label)}` : ""}`).join("; ");
      return `<div class="pcard return-admin-card"><div><b>${esc(r.order_number)}</b><div class="meta">${esc(o.customer_name || "Customer")} · ${esc(o.phone || "")} · ${fmtDate(r.created_at)}</div><div class="meta">Reason: ${esc(r.reason)}</div><div class="meta">${items}</div><div class="meta">Total: ${money(o.total)} · ${esc(o.payment_method || "")} / ${esc(o.payment_status || "")}</div>${r.decision_reason ? `<div class="meta">Decision: ${esc(r.decision_reason)}</div>` : ""}</div><div><span class="badge">${esc(r.status)}</span>${r.status === "requested" ? `<div class="acts"><button class="btn primary sm" data-cancel-review="approved" data-id="${Number(r.id)}">Approve</button><button class="btn outline sm" data-cancel-review="rejected" data-id="${Number(r.id)}">Reject</button></div>` : ""}</div></div>`;
    }).join("") || '<p class="empty">No cancellation requests match these filters.</p>';
  } catch (e) { $("#cancellationList").innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

/* ------------------------------- RETURNS ------------------------------- */
async function loadReturns() {
  $("#pane").innerHTML = `<div class="tools"><input id="rs" type="search" placeholder="Search order number / reason"><select id="rstatus"><option value="">All return statuses</option>${["requested","approved","rejected","pickup_scheduled","in_transit","returned","refund_processing","refunded","closed"].map(x => `<option>${x}</option>`).join("")}</select><button class="btn outline" id="refreshReturns">Refresh</button></div><div id="returnList"><p class="muted">Loading…</p></div>`;
  let timer; $("#rs").addEventListener("input", e => { clearTimeout(timer); timer = setTimeout(fetchReturns, 300); });
  $("#rstatus").onchange = fetchReturns; $("#refreshReturns").onclick = fetchReturns; await fetchReturns();
}
async function fetchReturns() {
  const p = new URLSearchParams(); if ($("#rstatus")?.value) p.set("status", $("#rstatus").value); if ($("#rs")?.value.trim()) p.set("search", $("#rs").value.trim());
  try {
    returns = (await api("/api/admin?action=returns&" + p)).returns || [];
    $("#returnList").innerHTML = returns.map(r => `<div class="pcard return-admin-card"><div><b>${esc(r.order_number)} · item ${r.item_index}</b><div class="meta">${esc(r.item_snapshot?.name || "Product")} ${r.item_snapshot?.variant_label ? `· ${esc(r.item_snapshot.variant_label)}` : ""} · Qty ${Number(r.item_snapshot?.qty || 1)}</div><div class="meta">Reason: ${esc(r.reason)}${r.legal_issue ? " · protected product issue" : ""} · Requested ${fmtDate(r.created_at)}</div><div class="meta">${esc(r.details || "No additional details")}</div>${(r.photos || []).map(p => `<a href="${esc(p.url)}" target="_blank" rel="noopener">View evidence photo</a>`).join(" · ")}</div><div><span class="badge">${esc(r.status)}</span><p class="sm muted">Refund: ${esc(r.refund_status || "not_started")}${r.refund_amount != null ? ` · ${money(r.refund_amount)}` : ""}</p><button class="btn outline sm" data-return-edit="${r.id}">Review request</button></div></div>`).join("") || '<p class="empty">No return requests match these filters.</p>';
  } catch (e) { $("#returnList").innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
$("#root").addEventListener("click", async e => {
  const b = e.target.closest("[data-return-edit]"); if (!b) return; const r = returns.find(x => x.id === Number(b.dataset.returnEdit)); if (!r) return;
  const choices = ({ requested: ["approved","rejected","closed"], approved: ["pickup_scheduled","in_transit","returned","refund_processing","closed"], rejected: ["closed"], pickup_scheduled: ["in_transit","closed"], in_transit: ["returned","closed"], returned: ["refund_processing","refunded","closed"], refund_processing: ["refunded","closed"], refunded: ["closed"], closed: [] })[r.status] || [];
  if (!choices.length) { alert("This request is closed. No further status transition is available."); return; }
  const status = prompt(`Current status: ${r.status}\nChoose next status:\n${choices.join(", ")}`, choices[0]); if (!status) return; if (!choices.includes(status)) { alert("Invalid status choice."); return; }
  const reason = prompt("Decision / processing note (required when approving/rejecting):", r.decision_reason || ""); if (reason === null) return;
  let refund_amount, refund_status;
  if (["refund_processing","refunded"].includes(status)) { const max = Number(r.item_snapshot?.unit_price || 0) * Number(r.item_snapshot?.qty || 1); refund_amount = Number(prompt(`Refund amount, ₹0–${max.toFixed(2)}:`, String(r.refund_amount ?? max))); refund_status = status === "refunded" ? "refunded" : "processing"; }
  try { await api("/api/admin?action=returns", { method: "PATCH", body: { id: r.id, status, decision_reason: reason, ...(refund_amount === undefined ? {} : { refund_amount, refund_status }) } }); toast("Return status updated"); await fetchReturns(); }
  catch (err) { alert(err.message); }
});

/* ------------------------------- ORDERS ------------------------------- */
async function loadOrders() {
  const f = filter;
  const opt = (values, key, labels = {}) => values.map(v => `<option value="${esc(v)}" ${f[key] === v ? "selected" : ""}>${esc(labels[v] || v)}</option>`).join("");
  $("#pane").innerHTML = `<div class="tools"><input id="os" type="search" placeholder="Search order no., customer, mobile…" value="${esc(f.search)}"><button class="btn outline" id="resetOrderFilters" type="button">Clear filters</button></div>
    <div class="filter-grid"><select id="of" aria-label="Order status"><option value="">All statuses</option>${opt(STATUSES,"status")}</select>
      <select id="op" aria-label="Payment status"><option value="">All payment statuses</option>${opt(["pending","paid","failed","cancelled","refunded"],"payment")}</select>
      <select id="om" aria-label="Payment method"><option value="">All payment methods</option>${opt(["COD","ONLINE"],"method",{COD:"Cash on Delivery",ONLINE:"Online (Razorpay)"})}</select>
      <select id="od" aria-label="Delivery status"><option value="">All delivery stages</option>${opt(["not_shipped","in_transit","delivered"],"delivery",{not_shipped:"Not shipped",in_transit:"In transit",delivered:"Delivered"})}</select>
      <label class="f sm">From date<input id="ofrom" type="date" value="${esc(f.from)}"></label><label class="f sm">To date<input id="oto" type="date" value="${esc(f.to)}"></label>
      <label class="f sm">Minimum total ₹<input id="omin" type="number" min="0" step="0.01" value="${esc(f.minTotal)}"></label><label class="f sm">Maximum total ₹<input id="omax" type="number" min="0" step="0.01" value="${esc(f.maxTotal)}"></label>
      <select id="osort" aria-label="Sort orders">${opt(["newest","oldest","total_desc","total_asc"],"sort",{newest:"Newest first",oldest:"Oldest first",total_desc:"Total high to low",total_asc:"Total low to high"})}</select></div>
    <div id="ol"><p class="muted">Loading…</p></div>`;
  let t;
  $("#os").addEventListener("input", e => { clearTimeout(t); t=setTimeout(() => { f.search=e.target.value.trim(); f.page=1; fetchOrders(); }, 300); });
  const bind = (id,key,normalize=v=>v) => { $(id).addEventListener("change", e => { f[key]=normalize(e.target.value); f.page=1; fetchOrders(); }); };
  bind("#of","status"); bind("#op","payment"); bind("#om","method"); bind("#od","delivery"); bind("#ofrom","from"); bind("#oto","to"); bind("#omin","minTotal"); bind("#omax","maxTotal"); bind("#osort","sort");
  $("#resetOrderFilters").onclick = () => { filter = { search:"", status:"", payment:"", method:"", delivery:"", from:"", to:"", minTotal:"", maxTotal:"", sort:"newest", page:1 }; loadOrders(); };
  await fetchOrders();
}
async function fetchOrders() {
  const p = new URLSearchParams(Object.entries(filter).filter(([,v]) => v !== "" && v !== null && v !== undefined).map(([k,v]) => [k, String(v)]));
  try {
    const response = await api("/api/admin?action=orders&" + p); orders = response.orders || [];
    const total = Number(response.total || 0), page = Number(response.page || filter.page || 1), pageSize = Number(response.pageSize || 50), pages = Math.max(1, Math.ceil(total / pageSize));
    $("#ol").innerHTML = `<p class="sm muted">${total} matching order${total===1?"":"s"} · Page ${page} of ${pages}</p>` +
      (orders.map(o => `<button class="pcard" style="display:block;width:100%;text-align:left;font:inherit;cursor:pointer" data-o="${esc(o.order_number)}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(o.order_number)}</b><b>${money(o.total)}</b></div><div class="meta">${esc(o.customer_name)} · ${esc(o.phone)} · ${fmtDate(o.created_at)}</div><div class="meta">${Number(o.items?.length || 0)} item line(s) · ${o.payment_method === "COD" ? "Cash on Delivery" : "Online"}</div><div style="margin-top:6px">${badge(o.order_status)} ${badge(o.payment_status)}${o.tracking_number ? ` <span class="badge">Tracking: ${esc(o.tracking_number)}</span>` : ""}</div></button>`).join("") || '<p class="empty">No orders found. Clear filters or change the date range.</p>') +
      `<div class="acts order-pagination"><button class="btn outline sm" data-order-page="${Math.max(1,page-1)}" ${page<=1?"disabled":""}>← Previous</button><span class="sm muted">${total ? ((page-1)*pageSize+1) : 0}–${Math.min(page*pageSize,total)} of ${total}</span><button class="btn outline sm" data-order-page="${Math.min(pages,page+1)}" ${page>=pages?"disabled":""}>Next →</button></div>`;
  } catch (e) { $("#ol").innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}
$("#root").addEventListener("click", e => {
  const p = e.target.closest("[data-order-page]"); if (p && !p.disabled) { filter.page = Number(p.dataset.orderPage); fetchOrders(); return; }
  const b = e.target.closest("[data-o]"); if (b) orderSheet(orders.find(o => o.order_number === b.dataset.o));
});

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
    <div class="panel"><h2>Courier tracking (optional)</h2><label class="f">Tracking number / ID<input id="trackingNumber" maxlength="120" value="${esc(o.tracking_number || "")}" placeholder="Enter courier tracking ID"></label><label class="f">Tracking URL (HTTPS only)<input id="trackingUrl" type="url" maxlength="500" value="${esc(o.tracking_url || "")}" placeholder="https://courier.example/track/..."></label><button class="btn outline sm" id="saveTracking" type="button">Save tracking details</button><p class="sm muted">If no courier integration is used, customers see only your internal status timeline.</p></div>
    <div class="panel"><h2>Items</h2>${o.items.map((i) => `<div class="row"><div>${imgTag(i.image, i.name, { w: 76, h: 76 })}</div><div><div class="nm">${esc(i.name)}</div><div class="muted sm">${i.variant_label ? `Variant: ${esc(i.variant_label)} · ` : ""}${i.size ? "Size: " + esc(i.size) + " · " : ""}Qty ${i.qty ?? 1}${Number(i.pack_quantity)>1 ? ` · Pack of ${Number(i.pack_quantity)}` : ""} × ${money(i.unit_price ?? i.price ?? 0)}</div></div></div>`).join("")}<div class="tot"><span>Subtotal</span><span>${money(o.subtotal)}</span></div><div class="tot"><span>Delivery</span><span>${money(o.shipping)}</span></div><div class="tot big"><span>Total</span><span>${money(o.total)}</span></div></div>
    <div class="panel"><h2>Internal note</h2><textarea id="note" maxlength="500" placeholder="Only you can see this">${esc(o.admin_note || "")}</textarea><button class="btn outline sm" id="saveNote" type="button" style="margin-top:8px">Save note</button></div></div>`;
    $("#x", sheet).onclick = close;
  };
  draw();
  sheet.addEventListener("click", async (e) => {
    const st = e.target.closest("[data-st]"), sn = e.target.closest("#saveNote"), tr = e.target.closest("#saveTracking");
    if (!st && !sn && !tr) return;
    if (st && st.dataset.st === o.order_status) return;
    if (st && st.dataset.st === "cancelled" && !confirm("Cancel this order? Stock will be returned. For an online payment, first issue the refund in the gateway dashboard; the store does not issue refunds automatically.")) return;
    let refund_reference;
    if (st && st.dataset.st === "cancelled" && o.payment_method === "ONLINE" && o.payment_status === "paid") {
      refund_reference = prompt("After completing the refund in the gateway dashboard, enter its refund/reference ID. No refund will be sent by this form:");
      if (refund_reference === null) return;
      if (refund_reference.trim().length < 4) { msg($("#m", sheet), "Enter a valid gateway refund reference."); return; }
    }
    try {
      const body = st ? { orderNumber: o.order_number, status: st.dataset.st, ...(refund_reference ? { refund_reference: refund_reference.trim() } : {}) } : sn ? { orderNumber: o.order_number, note: $("#note", sheet).value } : { orderNumber: o.order_number, tracking_number: $("#trackingNumber", sheet).value.trim(), tracking_url: $("#trackingUrl", sheet).value.trim() };
      const { order } = await api("/api/admin?action=orders", { method: "PATCH", body });
      Object.assign(o, order); draw(); toast(st ? "Status updated" : sn ? "Note saved" : "Tracking details saved"); fetchOrders();
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
  try { cur = (await api("/api/admin?action=settings")).settings; } catch (e) { $("#pane").innerHTML = `<div class="msg err">${esc(e.message)}</div><p class="sm muted">If this keeps failing, run the new SQL (site_settings table) in Supabase once.</p>`; return; }
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
      const d = await api("/api/admin?action=settings", { method: "PATCH", body: { chat_enabled: $("#chatOn").checked ? "1" : "0", chat_faq: faq } });
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
      else { btn.textContent = "Saving…"; const d = await api("/api/admin?action=settings", { method: "PATCH", body }); Object.assign(cur, d.settings); toast("Saved"); }
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
      if (action === "delete") await api("/api/admin?action=reviews", { method: "DELETE", body: { id } });
      else await api("/api/admin?action=reviews", { method: "PATCH", body: { id, status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "pending" } });
      toast(action === "approve" ? "Review published" : action === "delete" ? "Review deleted" : action === "reject" ? "Review rejected" : "Review moved to pending");
      loadReviews();
    } catch (error) { alert(error.message); button.disabled = false; }
  });
}
