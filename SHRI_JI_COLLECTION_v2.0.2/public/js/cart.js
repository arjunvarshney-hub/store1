import { api, cart, esc, money, $, msg } from "./common.js";
import { imgTag } from "./render.js";
import { resolveLines, summarize, packText, nonReturnable } from "./cartcalc.js";
import { DELIVERY_TIERS } from "./delivery.js";

const box = $("#box");
let products = {}, tiers = DELIVERY_TIERS;

async function load() {
  const items = cart.read();
  if (!items.length) { products = {}; return draw(); }
  try {
    const d = await api("/api/products?ids=" + [...new Set(items.map((i) => i.id))].join(","));
    products = Object.fromEntries(d.products.map((p) => [p.id, p])); tiers = d.shipping?.tiers || tiers;
    draw();
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div><button class="btn outline" id="retry">Try again</button>`; $("#retry").onclick = load; }
}
function draw() {
  const items = cart.read();
  if (!items.length) { box.innerHTML = `<div class="empty"><p>Your cart is empty.</p><a class="btn primary" href="/category/thakur-ji-poshak">Shop Thakur Ji Poshak</a> <a class="btn outline" href="/shop">All products</a></div>`; return; }
  const lines = resolveLines(items, products), s = summarize(lines, tiers);
  const blocked = lines.some((l) => l.bad || l.minIssue), trimmed = lines.some((l) => l.trimmed), nr = nonReturnable(lines);
  const rows = lines.map((l) => {
    const i = l.i, name = l.p?.name || "Unavailable product", key = `data-id="${i.id}" data-size="${esc(i.size)}" data-v="${i.v || 0}"`;
    return `<div class="row"><div>${imgTag(l.p?.image_urls?.[0], name, { w: 76, h: 76 })}</div><div><div class="nm">${l.p ? `<a href="/product/${esc(l.p.slug)}">${esc(name)}</a>` : esc(name)}</div>
      <div class="muted sm">${l.label ? esc(l.label) : i.size ? "Size: " + esc(i.size) : ""}${l.bad ? ` <span class="warn">${esc(l.bad)}</span>` : ""}</div>
      ${l.bad ? "" : `${packText(l) ? `<div class="muted sm">${esc(packText(l))}</div>` : ""}<div><b>${money(l.unit)}</b> <span class="muted sm">× ${l.qty} = ${money(l.unit * l.qty)}</span></div>${l.minIssue ? `<div class="warn sm">Minimum order for this product is ${l.minIssue}. Please increase the quantity.</div>` : ""}${l.p.return_eligible === false ? '<div class="sm muted">Non-returnable</div>' : ""}`}
      <div class="ctl">${l.bad ? "" : `<div class="qty"><button type="button" data-a="dec" ${key} aria-label="Decrease quantity">−</button><output>${l.qty}</output><button type="button" data-a="inc" ${key} aria-label="Increase quantity" ${l.qty >= l.max ? "disabled" : ""}>+</button></div>`}
      <button class="rm" type="button" data-a="rm" ${key}>Remove</button></div></div></div>`;
  }).join("");
  box.innerHTML = `<div class="cartgrid"><div class="panel">${rows}</div><div class="panel"><h2>Order summary</h2>
    ${trimmed ? '<div class="msg info">Some quantities were reduced to the stock we have.</div>' : ""}
    <div class="tot"><span>Subtotal</span><span>${money(s.sub)}</span></div>
    <div class="tot"><span>Delivery</span><span>${s.fee ? money(s.fee) : "FREE"}</span></div>
    <div class="tot big"><span>Total</span><span>${money(s.total)}</span></div>
    ${s.remaining > 0 ? `<p class="freehint">Add ${money(s.remaining)} more to unlock free delivery.</p>` : lines.some((l) => !l.bad) ? '<p class="freehint ok">You have free delivery.</p>' : ""}
    ${nr.length ? `<div class="msg info sm"><b>Non-returnable:</b> ${esc(nr.join(", "))}. Please check before you order.</div>` : ""}
    <p class="sm muted">Delivery is calculated on the subtotal after discounts. Final price and stock are confirmed when you place the order.</p>
    ${blocked ? '<div class="msg err">Please fix the highlighted item(s) to continue.</div>' : ""}
    <a class="btn primary lg" style="width:100%;${blocked ? "pointer-events:none;opacity:.55" : ""}" href="/checkout" ${blocked ? 'aria-disabled="true"' : ""}>Proceed to checkout</a>
    <a class="btn outline" style="width:100%;margin-top:8px" href="/shop">Continue shopping</a></div></div>`;
}
box.addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const id = Number(b.dataset.id), size = b.dataset.size, v = Number(b.dataset.v) || 0, cur = cart.read().find((x) => x.id === id && x.size === size && (x.v || 0) === v);
  if (b.dataset.a === "rm") cart.remove(id, size, v);
  else if (cur) cart.setQty(id, size, cur.qty + (b.dataset.a === "inc" ? 1 : -1), v);
  draw();
});
load();
