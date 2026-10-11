import { api, cart, esc, money, $, msg } from "./common.js";
import { effPrice, imgTag, deliveryAmount, freeDeliveryRemaining } from "./render.js";

const box = $("#box");
let products = {}, shipping = { tiers: [{ from: 0, charge: 50 }, { from: 499, charge: 40 }, { from: 1000, charge: 0 }] };
const selectedVariant = (p, id) => (Array.isArray(p?.variants) ? p.variants : []).find(v => String(v.id) === String(id));
function line(i) {
  const p = products[i.id];
  if (!p) return { bad: "No longer available", i };
  const variants = Array.isArray(p.variants) ? p.variants.filter(v => v && v.active !== false) : [];
  let variant = null, pack = Math.max(1, Number(p.pack_size) || 1), min = Math.max(1, Number(p.min_order_qty) || 1), unit = effPrice(p), stock = Number(p.stock) || 0;
  if (variants.length) {
    if (!i.variantId) return { p, bad: "Choose a product option again", i };
    variant = selectedVariant(p, i.variantId);
    if (!variant || variant.active === false) return { p, bad: "This option is no longer available", i };
    pack = Math.max(1, Number(variant.pack_quantity) || 1); min = Math.max(1, Number(variant.min_order_qty) || 1);
    unit = Number(variant.sale_price) > 0 && Number(variant.sale_price) < Number(variant.price) ? Number(variant.sale_price) : Number(variant.price);
    stock = Number(variant.stock) || 0;
  } else if (i.variantId) return { p, bad: "This option is no longer available", i };
  if (stock < pack) return { p, variant, pack, min, bad: "Sold out", i };
  if (!variants.length && p.sizes?.length && !p.sizes.includes(i.size)) return { p, bad: "Please remove and re-add with a size", i };
  const available = Math.floor(stock / pack), qty = Math.min(Math.max(Number(i.qty) || min, min), available);
  if (available < min) return { p, variant, pack, min, bad: "Stock is below the minimum order quantity", i };
  return { p, variant, pack, min, i, qty, available, trimmed: qty < i.qty, unit };
}
async function load() {
  const items = cart.read();
  if (!items.length) { products = {}; return draw(); }
  try {
    const ids = [...new Set(items.map((i) => i.id))].join(",");
    const d = await api("/api/products?ids=" + ids);
    products = Object.fromEntries(d.products.map((p) => [p.id, p])); shipping = d.shipping || shipping;
    draw();
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div><button class="btn outline" id="retry">Try again</button>`; $("#retry").onclick = load; }
}
function draw() {
  const items = cart.read();
  if (!items.length) { box.innerHTML = `<div class="empty"><p>Your cart is empty.</p><a class="btn primary" href="/shop">Continue shopping</a></div>`; return; }
  let sub = 0, blocked = false, trimmed = false;
  const rows = items.map((i) => {
    const l = line(i), name = l.p?.name || "Unavailable product";
    if (l.bad) blocked = true; else { sub += l.unit * l.qty; if (l.trimmed) { trimmed = true; cart.setQty(i.id, i.size, l.qty, i.variantId || "", l.min); } }
    const variantLabel = l.variant?.label || (l.variant?.attributes ? Object.entries(l.variant.attributes).map(([k,v]) => `${k}: ${v}`).join(" · ") : "");
    return `<div class="row"><div>${imgTag(l.p?.image_urls?.[0], name, { w: 76, h: 76 })}</div><div><div class="nm">${l.p ? `<a href="/product/${esc(l.p.slug)}">${esc(name)}</a>` : esc(name)}</div>
      <div class="muted sm">${variantLabel ? `${esc(variantLabel)} · ` : ""}${i.size && !l.variant ? "Size: " + esc(i.size) + " · " : ""}${l.pack > 1 ? `Pack of ${l.pack} · ` : ""}${l.bad ? ` <span class="warn">${esc(l.bad)}</span>` : ""}</div>
      ${l.bad ? "" : `<div><b>${money(l.unit)}</b> <span class="muted sm">per package × ${l.qty} package(s) (${l.qty * l.pack} pieces)</span></div>`}
      <div class="ctl">${l.bad ? "" : `<div class="qty"><button type="button" data-a="dec" data-id="${i.id}" data-size="${esc(i.size)}" data-variant="${esc(i.variantId || "")}" aria-label="Decrease quantity" ${l.qty <= l.min ? "disabled" : ""}>−</button><output>${l.qty}</output><button type="button" data-a="inc" data-id="${i.id}" data-size="${esc(i.size)}" data-variant="${esc(i.variantId || "")}" aria-label="Increase quantity" ${l.qty >= l.available ? "disabled" : ""}>+</button></div>`}
      <button class="rm" type="button" data-a="rm" data-id="${i.id}" data-size="${esc(i.size)}" data-variant="${esc(i.variantId || "")}">Remove</button></div></div></div>`;
  }).join("");
  const ship = deliveryAmount(sub, shipping), remaining = freeDeliveryRemaining(sub);
  box.innerHTML = `<div class="cartgrid"><div class="panel">${rows}</div><div class="panel"><h2>Order summary</h2>
    ${trimmed ? '<div class="msg info">Some quantities were adjusted to available stock.</div>' : ""}
    <div class="tot"><span>Subtotal</span><span>${money(sub)}</span></div>
    <div class="tot"><span>Delivery</span><span>${ship ? money(ship) : "Free"}</span></div>
    <div class="tot big"><span>Total</span><span>${money(sub + ship)}</span></div>
    ${remaining > 0 ? `<p class="sm muted">Add ${money(remaining)} more to unlock free delivery.</p>` : '<p class="sm ok">You unlocked free delivery.</p>'}
    <p class="sm muted">Final price, delivery charge and stock are recalculated by the server when you place the order.</p>
    ${blocked ? '<div class="msg err">Please remove unavailable items or return to the product page to choose an option.</div>' : ""}
    <a class="btn primary lg" style="width:100%;${blocked ? "pointer-events:none;opacity:.55" : ""}" href="/checkout" ${blocked ? 'aria-disabled="true"' : ""}>Proceed to checkout</a>
    <a class="btn outline" style="width:100%;margin-top:8px" href="/shop">Continue shopping</a></div></div>`;
}
box.addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const id = Number(b.dataset.id), size = b.dataset.size || "", variantId = b.dataset.variant || "";
  const cur = cart.read().find((x) => x.id === id && x.size === size && String(x.variantId || "") === variantId);
  if (b.dataset.a === "rm") cart.remove(id, size, variantId);
  else if (cur) {
    const l = line(cur); if (!l.bad) cart.setQty(id, size, cur.qty + (b.dataset.a === "inc" ? 1 : -1), variantId, l.min);
  }
  draw();
});
load();
