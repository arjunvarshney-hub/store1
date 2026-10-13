// Admin: product list (search / filters / sort / pages), product form (variants, rich text, specs, returns, photos) and category manager.
import { api, esc, money, $, $$, toast } from "./common.js";
import { imgTag, effPrice } from "./render.js";
import { GROUPS, setCategories, CATEGORIES, nameKey } from "./categories.js";

const AXES = ["Colour", "Size", "Material", "Design", "Pack Size"];
const HINTS = { Colour: ["Red", "Blue", "Green", "Yellow", "Maroon", "Pink", "White", "Gold"], "Pack Size": ["Single Piece", "Pack of 2", "Pack of 3", "Pack of 4", "Pack of 5", "Pack of 6", "Pack of 12"], Size: ["0", "1", "2", "3", "4", "5", "6", "S", "M", "L", "XL", "Free Size"], Material: ["Velvet", "Silk", "Cotton", "Brass", "Pearl", "Metal"], Design: ["Plain", "Embroidered", "Printed", "Traditional"] };
const SPEC_HINTS = ["Product Type", "Colour", "Material", "Design", "Size", "Length", "Width", "Weight", "Pack Size", "Package Contents", "Suitable Idol Size", "Fabric", "Pattern", "Sleeve Type", "Fit", "Pack Contents"];
const SORTS = [["new", "Newest first"], ["old", "Oldest first"], ["name_asc", "Name A-Z"], ["name_desc", "Name Z-A"], ["price_asc", "Price low to high"], ["price_desc", "Price high to low"], ["stock_asc", "Stock low to high"], ["stock_desc", "Stock high to low"], ["updated", "Recently updated"]];
const S = { q: "", f: { category: "", status: "", stock: "", returnable: "", sale: "", min_price: "", max_price: "", colour: "", size: "", pack: "", recent: "", sort: "new" }, page: 1, data: null, cats: [] };
const pane = () => $("#pane");
const opt = (v, t, sel) => `<option value="${esc(v)}"${String(sel) === String(v) ? " selected" : ""}>${esc(t)}</option>`;

/* ---------------- photos: shrink on the phone, then upload ---------------- */
async function shrink(file, max = 1600) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error(`“${file.name}” is not a JPG, PNG or WebP photo.`);
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { bmp = await new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error(`Could not read “${file.name}”.`)); im.src = URL.createObjectURL(file); }); }
  const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight, k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement("canvas"); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
  if (!blob) throw new Error("Could not process the photo.");
  return blob;
}
function upload(blob, onProgress) {      // XMLHttpRequest so the owner sees upload progress
  return new Promise((ok, bad) => {
    const x = new XMLHttpRequest(); x.open("POST", "/api/admin/upload-image"); x.withCredentials = true; x.setRequestHeader("Content-Type", blob.type);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch {} x.status >= 200 && x.status < 300 ? ok(d.url) : bad(new Error(d.error || "Photo upload failed.")); };
    x.onerror = () => bad(new Error("Upload failed: no internet connection.")); x.send(blob);
  });
}

/* ---------------- list ---------------- */
export async function loadProducts() {
  try { await refreshCats(); await fetchList(); } catch (e) { pane().innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }
  drawList();
}
async function refreshCats() {
  const d = await api("/api/admin/categories"); S.cats = d.categories; S.needs = d.needsCategory || [];
  setCategories(d.categories);      // shared registry: active categories only appear in forms
}
async function fetchList() {
  const p = new URLSearchParams({ page: S.page, per: 25 }); if (S.q) p.set("q", S.q);
  for (const [k, v] of Object.entries(S.f)) if (v !== "" && v !== false) p.set(k, v);
  S.data = await api("/api/admin/products?" + p);
}
const stockLine = (p) => {
  const vs = p.variants || [], n = vs.length ? vs.reduce((a, v) => a + Number(v.stock || 0), 0) : Number(p.stock), low = Number(p.low_stock_threshold ?? 3);
  return n <= 0 ? '<span class="pill bad">Out of stock</span>' : n <= low ? `<span class="pill warn">Low: ${n} pcs</span>` : `<span class="pill ok">${n} pcs</span>`;
};
const priceLine = (p) => {
  const vs = p.variants || []; if (!vs.length) return money(effPrice(p)) + (p.sale_price ? ` <s>${money(p.price)}</s>` : "");
  const ps = vs.map(effPrice), lo = Math.min(...ps), hi = Math.max(...ps); return lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`;
};
function drawList() {
  const d = S.data, f = S.f, catOpts = GROUPS.map((g) => `<optgroup label="${esc(g.name)}">${S.cats.filter((c) => c.group_slug === g.slug).map((c) => opt(c.slug, c.name + (c.active ? "" : " (off)"), f.category)).join("")}</optgroup>`).join("");
  const nf = Object.entries(f).filter(([k, v]) => k !== "sort" && v !== "" && v !== false).length + (S.q ? 1 : 0);
  pane().innerHTML = `<div class="tools"><input id="ps" type="search" placeholder="Search name, SKU, ID, category, variant SKU…" value="${esc(S.q)}" aria-label="Search products"><button class="btn primary" id="add" type="button">+ Add product</button></div>
  ${d.needsCategory ? `<div class="msg err"><b>${d.needsCategory} product${d.needsCategory === 1 ? "" : "s"} need a new category</b> (their old category was removed). <button class="btn outline sm" id="needs" type="button">Show them</button> or open the <b>Categories</b> tab to move them all at once.</div>` : ""}
  <details class="filters" id="fdet" ${nf || S.fOpen ? "open" : ""}><summary>Filters &amp; sorting${nf ? ` (${nf})` : ""}</summary><div class="fgridA">
   <label>Sort<select data-f="sort">${SORTS.map(([v, t]) => opt(v, t, f.sort)).join("")}</select></label>
   <label>Category<select data-f="category"><option value="">All categories</option>${catOpts}</select></label>
   <label>Status<select data-f="status">${[["", "Active + Inactive"], ["active", "Active"], ["inactive", "Inactive"], ["archived", "Archived"], ["all", "Everything"]].map(([v, t]) => opt(v, t, f.status)).join("")}</select></label>
   <label>Stock<select data-f="stock">${[["", "Any"], ["in", "In stock"], ["out", "Out of stock"], ["low", "Low stock"]].map(([v, t]) => opt(v, t, f.stock)).join("")}</select></label>
   <label>Returns<select data-f="returnable">${[["", "Any"], ["yes", "Returnable"], ["no", "Non-returnable"], ["unset", "Not set"]].map(([v, t]) => opt(v, t, f.returnable)).join("")}</select></label>
   <label>Added<select data-f="recent">${[["", "Any time"], ["7", "Last 7 days"], ["30", "Last 30 days"]].map(([v, t]) => opt(v, t, f.recent)).join("")}</select></label>
   <label>Min price<input data-f="min_price" inputmode="numeric" value="${esc(f.min_price)}"></label><label>Max price<input data-f="max_price" inputmode="numeric" value="${esc(f.max_price)}"></label>
   <label>Colour<input data-f="colour" value="${esc(f.colour)}" placeholder="e.g. Red"></label><label>Size<input data-f="size" value="${esc(f.size)}" placeholder="e.g. 3 or M"></label><label>Pack size<input data-f="pack" value="${esc(f.pack)}" placeholder="e.g. 3"></label>
   <label class="chk"><input type="checkbox" data-f="sale" ${f.sale ? "checked" : ""}> Sale products only</label></div>
   <button class="btn outline sm" id="clear" type="button">Clear filters</button></details>
  <p class="sm muted" aria-live="polite">Showing ${d.products.length} of ${d.total} product${d.total === 1 ? "" : "s"} (${d.catalogue} in total)</p>` +
  (d.products.map((p) => `<div class="pcard" data-id="${p.id}"><div>${imgTag(p.image_urls?.[0], p.name, { w: 72, h: 72 })}</div><div><div class="nm">${esc(p.name)} ${p.archived ? '<span class="pill">Archived</span>' : p.active ? "" : '<span class="pill warn">Inactive</span>'}${p.needs_category ? ' <span class="pill bad">Needs category</span>' : ""}</div>
   <div class="meta">${esc(p.sku || "no SKU")} · ${esc(S.cats.find((c) => c.slug === p.category)?.name || p.category)} · ${priceLine(p)} ${stockLine(p)}${(p.variants || []).length ? ` · ${p.variants.length} variants` : ""}${p.return_eligible === true ? " · Returnable" : p.return_eligible === false ? " · Non-returnable" : ""}</div>
   <div class="acts"><button class="btn outline sm" data-act="edit">Edit</button><button class="btn outline sm" data-act="quick">Price / stock</button><button class="btn outline sm" data-act="duplicate">Duplicate</button>
   ${p.archived ? '<button class="btn outline sm" data-act="unarchive">Unarchive</button>' : `<button class="btn outline sm" data-act="${p.active ? "deactivate" : "activate"}">${p.active ? "Deactivate" : "Activate"}</button><button class="btn outline sm" data-act="archive">Archive</button>`}
   <button class="btn outline sm" data-act="oos">Mark out of stock</button><button class="btn danger sm" data-act="del">Delete</button></div></div></div>`).join("") || `<p class="empty">${nf ? "No products match these filters." : "No products yet. Tap “Add product”."} ${nf ? '<button class="btn outline sm" id="clear2" type="button">Clear filters</button>' : ""}</p>`) +
  (d.pages > 1 ? `<nav class="pager"><button class="btn outline" id="prev" ${d.page <= 1 ? "disabled" : ""}>Previous</button><span class="sm muted">Page ${d.page} of ${d.pages}</span><button class="btn outline" id="next" ${d.page >= d.pages ? "disabled" : ""}>Next</button></nav>` : "");
  $("#add").onclick = () => productForm();
  $("#fdet summary").addEventListener("click", () => { S.fOpen = !$("#fdet").open; });   // keep the panel open while the owner changes filters
  let t; $("#ps").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(async () => { S.q = e.target.value.trim(); S.page = 1; await fetchList().catch((x) => toast(x.message)); drawList(); const el = $("#ps"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 300); });
  $$("[data-f]").forEach((el) => el.addEventListener("change", async () => { S.f[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value.trim(); S.page = 1; await fetchList().catch((x) => toast(x.message)); drawList(); }));
  const clear = async () => { Object.keys(S.f).forEach((k) => (S.f[k] = k === "sort" ? "new" : "")); S.q = ""; S.page = 1; await fetchList(); drawList(); };
  $("#clear")?.addEventListener("click", clear); $("#clear2")?.addEventListener("click", clear);
  $("#needs")?.addEventListener("click", async () => { S.f.status = "all"; S.f.needs_category = "1"; S.page = 1; await fetchList(); drawList(); });
  $("#prev")?.addEventListener("click", async () => { S.page--; await fetchList(); drawList(); window.scrollTo(0, 0); });
  $("#next")?.addEventListener("click", async () => { S.page++; await fetchList(); drawList(); window.scrollTo(0, 0); });
}
pane && document.addEventListener("click", async (e) => {
  const b = e.target.closest(".pcard [data-act]"); if (!b) return;
  const id = Number(b.closest(".pcard").dataset.id), p = S.data.products.find((x) => x.id === id), act = b.dataset.act;
  const patch = async (body, ok) => { try { await api("/api/admin/products", { method: "PATCH", body: { id, ...body } }); toast(ok); await refreshCats(); await fetchList(); drawList(); } catch (err) { alert(err.message); } };
  if (act === "edit") return productForm(p);
  if (act === "quick") return quickEdit(p);
  if (act === "duplicate") return patch({ action: "duplicate" }, "Copy created (inactive). Edit it and activate when ready.");
  if (["archive", "unarchive", "activate", "deactivate"].includes(act)) {
    if (act === "archive" && !confirm(`Archive “${p.name}”?\n\nIt will be hidden from the shop but kept with its order history. You can unarchive it later.`)) return;
    return patch({ action: act }, { archive: "Archived", unarchive: "Moved out of archive (inactive)", activate: "Product is now visible", deactivate: "Product hidden" }[act]);
  }
  if (act === "oos") { if (confirm(`Mark “${p.name}” as out of stock?\n\nStock will be set to 0 (for every variant too).`)) patch({ action: "out_of_stock" }, "Marked out of stock"); return; }
  if (act === "del" && confirm(`Delete “${p.name}” permanently?\n\nIf it was ever ordered, deleting is not allowed (use Archive). Its photos are removed too.`)) {
    try { await api("/api/admin/products", { method: "DELETE", body: { id } }); toast("Deleted"); await fetchList(); drawList(); } catch (err) { alert(err.message); }
  }
});
function quickEdit(p) {
  const hasV = (p.variants || []).length;
  const ov = sheet(`<h2>Quick edit</h2><p class="muted">${esc(p.name)}</p>${hasV ? '<p class="msg info">This product has variants. Edit price and stock for each variant in “Edit”.</p>' : `<label class="f">Regular price (₹)<input id="qp" inputmode="decimal" value="${esc(p.price)}"></label><label class="f">Sale price (₹, empty = none)<input id="qs" inputmode="decimal" value="${esc(p.sale_price ?? "")}"></label><label class="f">Stock (pieces)<input id="qk" inputmode="numeric" value="${esc(p.stock)}"></label>`}<div id="qm"></div><div class="row-actions"><button class="btn primary" id="qsave" ${hasV ? "disabled" : ""}>Save</button><button class="btn outline" data-close>Cancel</button></div>`);
  $("#qsave", ov).onclick = async () => {
    try { await api("/api/admin/products", { method: "PATCH", body: { id: p.id, price: $("#qp", ov).value, sale_price: $("#qs", ov).value || null, stock: $("#qk", ov).value } }); toast("Saved"); ov.remove(); await fetchList(); drawList(); }
    catch (err) { $("#qm", ov).innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
  };
}
function sheet(html) {
  const ov = document.createElement("div"); ov.className = "asheet"; ov.innerHTML = `<div class="asheet-in" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(ov); document.body.style.overflow = "hidden";
  const close = () => { ov.remove(); document.body.style.overflow = ""; };
  ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("[data-close]")) close(); });
  const rm = ov.remove.bind(ov); ov.remove = () => { rm(); document.body.style.overflow = ""; };
  return ov;
}

/* ---------------- product form ---------------- */
function productForm(p) {
  const cur = p || { variant_axes: [], specs: [], image_urls: [], sizes: [], min_order_qty: 1, pack_size: 1, low_stock_threshold: 3, active: true };
  const state = { images: [...(cur.image_urls || [])], variants: (cur.variants || []).map((v) => ({ ...v })), specs: (cur.specs || []).map((x) => ({ ...x })), axes: [...(cur.variant_axes || [])], pending: 0 };
  const status = cur.archived ? "archived" : cur.active ? "active" : "inactive";
  const catSel = cur.category && S.cats.find((c) => c.slug === cur.category && c.active) ? cur.category : "";
  const ov = sheet(`<div class="fhead"><h2>${p ? "Edit product" : "Add product"}</h2><button class="btn outline sm" data-close type="button">Close</button></div><div id="fm" role="alert"></div>
  <form id="pf" novalidate>
  <details open class="fs"><summary>1. Basic information</summary>
    <label class="f">Product name *<input name="name" maxlength="120" required value="${esc(cur.name || "")}"></label>
    <div class="two"><label class="f">SKU / product code<input name="sku" maxlength="40" value="${esc(cur.sku || "")}" placeholder="e.g. LG-POSH-001"></label>
    <label class="f">Status<select name="status">${[["active", "Active (visible on shop)"], ["inactive", "Inactive (hidden)"], ["archived", "Archived"]].map(([v, t]) => opt(v, t, status)).join("")}</select></label></div>
    <div class="two"><label class="f">Brand <small>(if any)</small><input name="brand" maxlength="60" value="${esc(cur.brand || "")}"></label><label class="f">Subcategory <small>(optional)</small><input name="subcategory" maxlength="60" value="${esc(cur.subcategory || "")}"></label></div>
    <label class="f">Short description <small>(shown under the name)</small><input name="short_description" maxlength="300" value="${esc(cur.short_description || "")}"></label></details>
  <details open class="fs"><summary>2. Category</summary>
    <label class="f">Find a category<input id="catFind" type="search" placeholder="Type to search, e.g. laddu" autocomplete="off"></label>
    <label class="f">Category *<select name="category" id="catSel"><option value="">Choose a category…</option>${GROUPS.map((g) => `<optgroup label="${esc(g.name)}">${CATEGORIES.filter((c) => c.group === g.slug).map((c) => opt(c.slug, c.name, catSel)).join("")}</optgroup>`).join("")}<option value="__other">Others (add a new category)…</option></select></label>
    ${cur.category && !catSel ? `<p class="msg err">This product’s old category “${esc(cur.category)}” was removed. Please choose a new one.</p>` : ""}
    <div id="otherBox" hidden><div class="two"><label class="f">New category name *<input name="custom_category" maxlength="60" placeholder="e.g. Pooja Thali"></label><label class="f">Belongs to *<select name="custom_group">${GROUPS.map((g) => opt(g.slug, g.name, "")).join("")}</select></label></div><p class="sm muted">If a category with this name already exists it will be reused. New categories are saved so you can pick them next time.</p></div></details>
  <details open class="fs"><summary>3. Price, stock and ordering</summary>
    <div class="two"><label class="f">Regular price (₹) *<input name="price" inputmode="decimal" value="${esc(cur.price ?? "")}"></label><label class="f">Sale price (₹) <small>(empty = no sale)</small><input name="sale_price" inputmode="decimal" value="${esc(cur.sale_price ?? "")}"></label></div>
    <div class="two"><label class="f">Cost price (₹) <small>(only you can see this)</small><input name="cost_price" inputmode="decimal" value="${esc(cur.cost_price ?? "")}"></label><label class="f">Stock (single pieces)<input name="stock" inputmode="numeric" value="${esc(cur.stock ?? 0)}"></label></div>
    <div class="two"><label class="f">Low-stock alert at<input name="low_stock_threshold" inputmode="numeric" value="${esc(cur.low_stock_threshold ?? 3)}"></label><label class="f">Minimum order quantity<input name="min_order_qty" inputmode="numeric" value="${esc(cur.min_order_qty ?? 1)}"></label></div>
    <div class="two"><label class="f">Pack size <small>(pieces in ONE pack)</small><input name="pack_size" inputmode="numeric" value="${esc(cur.pack_size ?? 1)}"></label><label class="f">Weight (grams)<input name="weight_g" inputmode="decimal" value="${esc(cur.weight_g ?? "")}"></label></div>
    <label class="f">Dimensions<input name="dimensions" maxlength="100" value="${esc(cur.dimensions || "")}" placeholder="e.g. 12 x 8 cm"></label>
    <p class="sm muted"><b>Minimum order</b> = least number of packs a customer must buy. <b>Pack size</b> = pieces inside one pack; ordering 1 pack of 3 reduces stock by 3 pieces. If you add variants below, each variant has its own price, stock and pack quantity.</p></details>
  <details class="fs" ${state.variants.length || state.axes.length ? "open" : ""}><summary>4. Variants (colour, size, pack…)</summary>
    <p class="sm muted">Turn on only the options this product really has. Leave everything off for a simple product.</p>
    <div class="axes">${AXES.map((a) => `<label class="chk"><input type="checkbox" data-axis="${esc(a)}" ${state.axes.includes(a) ? "checked" : ""}> ${esc(a)}</label>`).join("")}</div>
    <div id="vbox"></div><button class="btn outline sm" id="addV" type="button">+ Add variant</button></details>
  <details open class="fs"><summary>5. Photos</summary><p class="sm muted">Add front, back, side and close-up photos. The first photo is the main photo. Phone photos are shrunk automatically.</p>
    <div id="imgs" class="imgs"></div><label class="btn outline" for="files">+ Add photos</label><input id="files" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></details>
  <details open class="fs"><summary>6. Description</summary><div class="rte-bar" role="toolbar" aria-label="Formatting">
    ${[["bold", "B", "Bold"], ["italic", "I", "Italic"], ["underline", "U", "Underline"], ["h2", "H2", "Heading"], ["h3", "H3", "Sub-heading"], ["p", "¶", "Paragraph"], ["ul", "• List", "Bullet list"], ["ol", "1. List", "Numbered list"], ["left", "⇤", "Align left"], ["center", "↔", "Centre"], ["right", "⇥", "Align right"], ["link", "Link", "Add link"], ["undo", "↶", "Undo"], ["redo", "↷", "Redo"], ["clear", "Clear", "Clear formatting"]].map(([c, t, l]) => `<button type="button" class="tb" data-cmd="${c}" title="${l}" aria-label="${l}">${t}</button>`).join("")}</div>
    <div id="rte" class="rte rich" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Product description"></div></details>
  <details class="fs" ${state.specs.length ? "open" : ""}><summary>7. Specifications</summary><p class="sm muted">Add only what is true for this product. Empty rows are hidden from customers.</p><div id="specs"></div>
    <datalist id="specHints">${SPEC_HINTS.map((x) => `<option value="${esc(x)}">`).join("")}</datalist><button class="btn outline sm" id="addSpec" type="button">+ Add row</button></details>
  <details class="fs" ${cur.return_eligible != null ? "open" : ""}><summary>8. Return policy (this product)</summary>
    <label class="f">Can this product be returned?<select name="return_eligible">${[["", "Not set (nothing shown to customers)"], ["true", "Yes, returnable"], ["false", "No, non-returnable"]].map(([v, t]) => opt(v, t, cur.return_eligible == null ? "" : String(cur.return_eligible))).join("")}</select></label>
    <div id="retBox"><label class="f">Return window (days after delivery)<input name="return_days" inputmode="numeric" value="${esc(cur.return_days ?? "")}"></label><label class="f">Return conditions<textarea name="return_conditions" maxlength="1000">${esc(cur.return_conditions || "")}</textarea></label><label class="f">Return instructions<textarea name="return_instructions" maxlength="1000">${esc(cur.return_instructions || "")}</textarea></label></div>
    <label class="f">Refund policy<textarea name="refund_policy" maxlength="1000">${esc(cur.refund_policy || "")}</textarea></label>
    <p class="sm muted">Damaged, defective or wrong items are always handled according to consumer law, even for non-returnable products.</p></details>
  <div class="row-actions sticky"><button class="btn primary lg" type="submit" id="save">Save product</button><button class="btn outline" type="button" data-close>Cancel</button></div></form>`);
  const f = $("#pf", ov), rte = $("#rte", ov), msgBox = $("#fm", ov);
  rte.innerHTML = cur.description_html || (cur.description ? `<p>${esc(cur.description).replace(/\n/g, "<br>")}</p>` : "");
  const fail = (m) => { msgBox.innerHTML = `<div class="msg err">${esc(m)}</div>`; ov.querySelector(".asheet-in").scrollTo({ top: 0, behavior: "smooth" }); };
  const field = (n) => f.elements[n];

  // category: search + "Others"
  const catSelEl = $("#catSel", ov);
  $("#catFind", ov).addEventListener("input", (e) => { const q = nameKey(e.target.value); $$("option", catSelEl).forEach((o) => { if (o.value && o.value !== "__other") o.hidden = !!q && !nameKey(o.textContent).includes(q); }); const first = $$("option", catSelEl).find((o) => o.value && !o.hidden && o.value !== "__other"); if (q && first) catSelEl.value = first.value; });
  const other = () => { $("#otherBox", ov).hidden = catSelEl.value !== "__other"; };
  catSelEl.addEventListener("change", other); other();
  field("custom_category").addEventListener("blur", () => {      // prevent accidental duplicates
    const hit = S.cats.find((c) => nameKey(c.name) === nameKey(field("custom_category").value));
    if (hit?.active) { catSelEl.value = hit.slug; other(); toast(`“${hit.name}” already exists. Selected it for you.`); }
  });
  // return policy visibility
  const ret = () => { $("#retBox", ov).hidden = field("return_eligible").value !== "true"; }; field("return_eligible").addEventListener("change", ret); ret();

  // rich text editor
  const run = (c) => {
    rte.focus();
    const m = { bold: ["bold"], italic: ["italic"], underline: ["underline"], h2: ["formatBlock", "h2"], h3: ["formatBlock", "h3"], p: ["formatBlock", "p"], ul: ["insertUnorderedList"], ol: ["insertOrderedList"], left: ["justifyLeft"], center: ["justifyCenter"], right: ["justifyRight"], undo: ["undo"], redo: ["redo"], clear: ["removeFormat"] };
    if (c === "link") { const u = prompt("Paste the link (https://…)"); if (u && /^(https?:\/\/|mailto:|tel:)/i.test(u.trim())) document.execCommand("createLink", false, u.trim()); else if (u) alert("The link must start with https://"); return; }
    if (c === "clear") { document.execCommand("removeFormat"); document.execCommand("formatBlock", false, "p"); return; }
    document.execCommand(...m[c]);
  };
  $$(".tb", ov).forEach((b) => b.addEventListener("mousedown", (e) => e.preventDefault()));
  $$(".tb", ov).forEach((b) => b.addEventListener("click", () => run(b.dataset.cmd)));
  rte.addEventListener("paste", (e) => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData("text/plain"); document.execCommand("insertText", false, t); });   // no messy pasted formatting

  // photos
  const drawImgs = () => {
    $("#imgs", ov).innerHTML = state.images.map((u, i) => `<div class="im"><div class="imgbox">${imgTag(u, "Photo " + (i + 1), { w: 90, h: 90 })}${i === 0 ? '<span class="mainb">Main</span>' : ""}</div><div class="imb"><button type="button" data-im="left" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move photo ${i + 1} earlier">◀</button><button type="button" data-im="main" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Make photo ${i + 1} the main photo">Main</button><button type="button" data-im="right" data-i="${i}" ${i === state.images.length - 1 ? "disabled" : ""} aria-label="Move photo ${i + 1} later">▶</button><button type="button" data-im="del" data-i="${i}" aria-label="Remove photo ${i + 1}">✕</button></div></div>`).join("") + (state.pending ? `<div class="im"><div class="imgbox prog" id="prog">Uploading…</div></div>` : "");
  };
  $("#imgs", ov).addEventListener("click", (e) => {
    const b = e.target.closest("[data-im]"); if (!b) return; const i = Number(b.dataset.i), a = state.images, k = b.dataset.im;
    if (k === "del") a.splice(i, 1); else if (k === "main") a.unshift(...a.splice(i, 1)); else if (k === "left" && i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; else if (k === "right" && i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]];
    drawImgs();
  });
  $("#files", ov).addEventListener("change", async (e) => {
    const files = [...e.target.files]; e.target.value = "";
    for (const file of files) {
      if (state.images.length + state.pending >= 8) { toast("Maximum 8 photos."); break; }
      state.pending++; drawImgs();
      try { const blob = await shrink(file); state.images.push(await upload(blob, (n) => { const el = $("#prog", ov); if (el) el.textContent = `Uploading ${n}%`; })); }
      catch (err) { toast(err.message); } finally { state.pending--; drawImgs(); }
    }
  });
  drawImgs();

  // variants
  const drawV = () => {
    const axes = AXES.filter((a) => state.axes.includes(a));
    const list = $("#vbox", ov);
    list.innerHTML = state.variants.length ? state.variants.map((v, i) => `<div class="vrow" data-i="${i}"><div class="vopts">${axes.map((a) => `<label class="f">${esc(a)}<input data-vk="opt" data-a="${esc(a)}" list="hint-${esc(a.replace(/ /g, "_"))}" value="${esc(v.options?.[a] || "")}" maxlength="40"></label>`).join("")}</div>
      <div class="vnums"><label class="f">Variant SKU<input data-vk="sku" value="${esc(v.sku || "")}" maxlength="40"></label><label class="f">Price ₹<input data-vk="price" inputmode="decimal" value="${esc(v.price ?? "")}"></label><label class="f">Sale ₹<input data-vk="sale_price" inputmode="decimal" value="${esc(v.sale_price ?? "")}"></label><label class="f">Stock (pieces)<input data-vk="stock" inputmode="numeric" value="${esc(v.stock ?? 0)}"></label><label class="f">Pieces per pack<input data-vk="pack_qty" inputmode="numeric" value="${esc(v.pack_qty ?? 1)}"></label></div>
      <div class="vact"><label class="chk"><input type="checkbox" data-vk="available" ${v.available === false ? "" : "checked"}> Available</label><button type="button" class="btn outline sm" data-v="copy">Copy</button><button type="button" class="btn danger sm" data-v="del">Remove</button></div></div>`).join("") : '<p class="muted sm">No variants yet.</p>';
    list.insertAdjacentHTML("beforeend", axes.map((a) => `<datalist id="hint-${esc(a.replace(/ /g, "_"))}">${(HINTS[a] || []).map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`).join(""));
  };
  const syncV = () => $$(".vrow", ov).forEach((r) => {
    const v = state.variants[Number(r.dataset.i)]; if (!v) return; v.options = {};
    $$("[data-vk]", r).forEach((el) => { const k = el.dataset.vk; if (k === "opt") { if (el.value.trim()) v.options[el.dataset.a] = el.value.trim(); } else if (k === "available") v.available = el.checked; else v[k] = el.value.trim(); });
    const pk = /pack of (\d+)/i.exec(v.options["Pack Size"] || ""); if (pk && (!v.pack_qty || Number(v.pack_qty) === 1) && document.activeElement?.dataset?.vk === "opt") { v.pack_qty = pk[1]; const el = $('[data-vk="pack_qty"]', r); if (el) el.value = pk[1]; }
  });
  $("#vbox", ov).addEventListener("input", syncV);
  $("#vbox", ov).addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; syncV(); const i = Number(b.closest(".vrow").dataset.i); if (b.dataset.v === "del") state.variants.splice(i, 1); else state.variants.splice(i + 1, 0, { ...state.variants[i], id: null, sku: "" }); drawV(); });
  $$("[data-axis]", ov).forEach((c) => c.addEventListener("change", () => { syncV(); state.axes = $$("[data-axis]", ov).filter((x) => x.checked).map((x) => x.dataset.axis); drawV(); }));
  $("#addV", ov).onclick = () => { syncV(); if (!state.axes.length) { alert("First tick the options this product has (for example Colour)."); return; } state.variants.push({ id: null, options: {}, price: field("price").value, sale_price: "", stock: 0, pack_qty: 1, available: true }); drawV(); };
  drawV();

  // specifications
  const drawS = () => { $("#specs", ov).innerHTML = state.specs.map((r, i) => `<div class="srow" data-i="${i}"><input data-s="label" list="specHints" placeholder="Name (e.g. Colour)" value="${esc(r.label)}" maxlength="60" aria-label="Specification name"><input data-s="value" placeholder="Value" value="${esc(r.value)}" maxlength="300" aria-label="Specification value"><button type="button" class="btn outline sm" data-s="up" aria-label="Move up">▲</button><button type="button" class="btn outline sm" data-s="down" aria-label="Move down">▼</button><button type="button" class="btn danger sm" data-s="del" aria-label="Remove row">✕</button></div>`).join(""); };
  const syncS = () => $$(".srow", ov).forEach((r) => { const s = state.specs[Number(r.dataset.i)]; if (s) { s.label = $('[data-s="label"]', r).value; s.value = $('[data-s="value"]', r).value; } });
  $("#specs", ov).addEventListener("click", (e) => { const b = e.target.closest("button[data-s]"); if (!b) return; syncS(); const i = Number(b.closest(".srow").dataset.i), a = state.specs; if (b.dataset.s === "del") a.splice(i, 1); else if (b.dataset.s === "up" && i > 0) [a[i - 1], a[i]] = [a[i], a[i - 1]]; else if (b.dataset.s === "down" && i < a.length - 1) [a[i + 1], a[i]] = [a[i], a[i + 1]]; drawS(); });
  $("#addSpec", ov).onclick = () => { syncS(); state.specs.push({ label: "", value: "" }); drawS(); };
  drawS();

  f.addEventListener("submit", async (e) => {
    e.preventDefault(); syncV(); syncS(); msgBox.innerHTML = "";
    const v = (n) => field(n).value.trim();
    if (state.pending) return fail("Please wait for the photos to finish uploading.");
    if (v("name").length < 2) return fail("Please enter the product name.");
    if (!v("category")) return fail("Please choose a category.");
    if (v("category") === "__other" && v("custom_category").length < 2) return fail("Please type the new category name.");
    const num = (n) => (v(n) === "" ? null : v(n));
    const body = { name: v("name"), sku: v("sku"), status: v("status"), brand: v("brand"), subcategory: v("subcategory"), short_description: v("short_description"),
      category: v("category"), custom_category: v("custom_category"), custom_group: v("custom_group"),
      price: v("price"), sale_price: num("sale_price"), cost_price: num("cost_price"), stock: v("stock") || 0, low_stock_threshold: v("low_stock_threshold") || 3, min_order_qty: v("min_order_qty") || 1, pack_size: v("pack_size") || 1, weight_g: num("weight_g"), dimensions: v("dimensions"),
      variant_axes: state.axes, variants: state.axes.length || state.variants.length ? state.variants.map((x) => ({ id: x.id || undefined, sku: x.sku || "", options: x.options, price: x.price, sale_price: x.sale_price || null, stock: x.stock, pack_qty: x.pack_qty, available: x.available !== false })) : [],
      image_urls: state.images, description_html: rte.innerHTML, specs: state.specs.filter((s) => s.label.trim()),
      return_eligible: v("return_eligible") === "" ? null : v("return_eligible") === "true", return_days: num("return_days"), return_conditions: v("return_conditions"), return_instructions: v("return_instructions"), refund_policy: v("refund_policy") };
    if (!state.axes.length) body.variants = state.variants.length ? [] : [];
    const btn = $("#save", ov); btn.disabled = true; btn.textContent = "Saving…";
    try {
      await api("/api/admin/products", { method: p ? "PATCH" : "POST", body: p ? { id: p.id, ...body } : body });
      toast(p ? "Product saved" : "Product added"); ov.remove(); await refreshCats(); await fetchList(); drawList();
    } catch (err) { fail(err.message); btn.disabled = false; btn.textContent = "Save product"; }
  });
}

/* ---------------- categories ---------------- */
export async function loadCategoriesTab() {
  try { await refreshCats(); } catch (e) { pane().innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }
  drawCats();
}
function drawCats() {
  const active = S.cats.filter((c) => c.active);
  pane().innerHTML = `<div class="panel"><h2>Add a category</h2><div class="two"><label class="f">Name<input id="nc" maxlength="60" placeholder="e.g. Pooja Thali"></label><label class="f">Belongs to<select id="ng">${GROUPS.map((g) => opt(g.slug, g.name, "")).join("")}</select></label></div><div id="cm"></div><button class="btn primary" id="addc" type="button">Add category</button></div>
  ${S.needs?.length ? `<div class="panel warnbox"><h2>Products that need a new category</h2><p class="sm">These products are in a category that was removed. They are hidden from customers until you move or archive them. Nothing has been deleted.</p>${S.needs.map((n) => `<div class="needrow" data-from="${esc(n.slug)}"><b>${esc(n.slug)}</b> <span class="muted">(${n.products} product${n.products === 1 ? "" : "s"})</span><select>${active.map((c) => opt(c.slug, c.name, "")).join("")}</select><button class="btn outline sm" data-n="move">Move all here</button><button class="btn outline sm" data-n="archive">Archive them</button></div>`).join("")}</div>` : ""}
  ${GROUPS.map((g) => `<div class="panel"><h2>${esc(g.name)}</h2>${S.cats.filter((c) => c.group_slug === g.slug).map((c, i, arr) => `<div class="crow ${c.active ? "" : "off"}" data-slug="${esc(c.slug)}"><input class="cname" value="${esc(c.name)}" maxlength="60" aria-label="Category name"><span class="muted sm">${c.products} product${c.products === 1 ? "" : "s"}</span><label class="sw"><input type="checkbox" data-c="active" ${c.active ? "checked" : ""}> ${c.active ? "On" : "Off"}</label><button class="btn outline sm" data-c="up" ${i === 0 ? "disabled" : ""} aria-label="Move up">▲</button><button class="btn outline sm" data-c="down" ${i === arr.length - 1 ? "disabled" : ""} aria-label="Move down">▼</button><button class="btn outline sm" data-c="save">Rename</button><button class="btn danger sm" data-c="del">Delete</button></div>`).join("")}</div>`).join("")}
  <p class="sm muted">Switch a category <b>Off</b> to hide it from customers without losing anything. A category can only be deleted when it has no products.</p>`;
  $("#addc").onclick = async () => {
    try { await api("/api/admin/categories", { method: "POST", body: { name: $("#nc").value, group: $("#ng").value } }); toast("Category added"); await refreshCats(); drawCats(); }
    catch (e) { $("#cm").innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
  };
  pane().querySelectorAll(".needrow button").forEach((b) => b.addEventListener("click", async () => {
    const row = b.closest(".needrow"), from = row.dataset.from;
    try {
      if (b.dataset.n === "move") await api("/api/admin/categories", { method: "POST", body: { action: "reassign", from, to: $("select", row).value } });
      else if (confirm("Archive all these products? They stay in your records but are hidden from customers.")) await api("/api/admin/categories", { method: "POST", body: { action: "archive", from } });
      else return;
      toast("Done"); await refreshCats(); drawCats();
    } catch (e) { alert(e.message); }
  }));
  pane().querySelectorAll(".crow").forEach((row) => row.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-c]"); if (!b || b.tagName === "INPUT") return; const slug = row.dataset.slug, cat = S.cats.find((c) => c.slug === slug);
    try {
      if (b.dataset.c === "save") await api("/api/admin/categories", { method: "PATCH", body: { slug, name: $(".cname", row).value } });
      else if (b.dataset.c === "del") { if (!confirm(`Delete the category “${cat.name}”?`)) return; await api("/api/admin/categories", { method: "DELETE", body: { slug } }); }
      else { const sibs = S.cats.filter((c) => c.group_slug === cat.group_slug), i = sibs.indexOf(cat), o = sibs[i + (b.dataset.c === "up" ? -1 : 1)]; if (!o) return; const a = cat.sort_order === o.sort_order ? cat.sort_order + (b.dataset.c === "up" ? -1 : 1) : cat.sort_order; await api("/api/admin/categories", { method: "PATCH", body: { slug, sort_order: o.sort_order } }); await api("/api/admin/categories", { method: "PATCH", body: { slug: o.slug, sort_order: a } }); }
      toast("Saved"); await refreshCats(); drawCats();
    } catch (err) { alert(err.message); }
  }));
  pane().querySelectorAll('.crow [data-c="active"]').forEach((c) => c.addEventListener("change", async () => {
    const slug = c.closest(".crow").dataset.slug;
    if (!c.checked && !confirm("Switch this category off? Its products will be hidden from customers until you switch it on again.")) { c.checked = true; return; }
    try { await api("/api/admin/categories", { method: "PATCH", body: { slug, active: c.checked } }); toast(c.checked ? "Category is on" : "Category is off"); await refreshCats(); drawCats(); } catch (e) { c.checked = !c.checked; alert(e.message); }
  }));
}
