import { api, cart, esc, money, $, msg } from "./common.js";
import { effPrice, imgTag } from "./render.js";

const box = $("#box");
let products = {}, shipping = { flat: 0, freeAbove: null };

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
function line(i) {
  const p = products[i.id];
  if (!p) return { bad: "No longer available", i };
  if (Number(p.stock) <= 0) return { p, bad: "Sold out", i };
  if (p.sizes?.length && !p.sizes.includes(i.size)) return { p, bad: "Please remove and re-add with a size", i };
  const qty = Math.min(i.qty, Number(p.stock));
  return { p, i, qty, trimmed: qty < i.qty, unit: effPrice(p) };
}
function draw() {
  const items = cart.read();
  if (!items.length) { box.innerHTML = `<div class="empty"><p>Your cart is empty.</p><a class="btn primary" href="/shop">Continue shopping</a></div>`; return; }
  let sub = 0, blocked = false, trimmed = false;
  const rows = items.map((i) => {
    const l = line(i), name = l.p?.name || "Unavailable product";
    if (l.bad) blocked = true; else { sub += l.unit * l.qty; if (l.trimmed) trimmed = true; }
    return `<div class="row"><div>${imgTag(l.p?.image_urls?.[0], name, { w: 76, h: 76 })}</div><div><div class="nm">${l.p ? `<a href="/product/${esc(l.p.slug)}">${esc(name)}</a>` : esc(name)}</div>
      <div class="muted sm">${i.size ? "Size: " + esc(i.size) : ""}${l.bad ? ` <span class="warn">${esc(l.bad)}</span>` : ""}</div>
      ${l.bad ? "" : `<div><b>${money(l.unit)}</b> <span class="muted sm">× ${l.qty}</span></div>`}
      <div class="ctl">${l.bad ? "" : `<div class="qty"><button type="button" data-a="dec" data-id="${i.id}" data-size="${esc(i.size)}" aria-label="Decrease quantity">−</button><output>${l.qty}</output><button type="button" data-a="inc" data-id="${i.id}" data-size="${esc(i.size)}" aria-label="Increase quantity">+</button></div>`}
      <button class="rm" type="button" data-a="rm" data-id="${i.id}" data-size="${esc(i.size)}">Remove</button></div></div></div>`;
  }).join("");
  const ship = shipping.freeAbove && sub >= shipping.freeAbove ? 0 : shipping.flat;
  box.innerHTML = `<div class="cartgrid"><div class="panel">${rows}</div><div class="panel"><h2>Order summary</h2>
    ${trimmed ? '<div class="msg info">Some quantities were reduced to the stock we have.</div>' : ""}
    <div class="tot"><span>Subtotal</span><span>${money(sub)}</span></div>
    <div class="tot"><span>Delivery</span><span>${ship ? money(ship) : "Free"}</span></div>
    <div class="tot big"><span>Total</span><span>${money(sub + ship)}</span></div>
    ${shipping.freeAbove && sub < shipping.freeAbove ? `<p class="sm muted">Free delivery above ${money(shipping.freeAbove)}.</p>` : ""}
    <p class="sm muted">Final price and stock are confirmed when you place the order.</p>
    ${blocked ? '<div class="msg err">Please remove the unavailable item(s) to continue.</div>' : ""}
    <a class="btn primary lg" style="width:100%;${blocked ? "pointer-events:none;opacity:.55" : ""}" href="/checkout" ${blocked ? 'aria-disabled="true"' : ""}>Proceed to checkout</a>
    <a class="btn outline" style="width:100%;margin-top:8px" href="/shop">Continue shopping</a></div></div>`;
}
box.addEventListener("click", (e) => {
  const b = e.target.closest("[data-a]"); if (!b) return;
  const id = Number(b.dataset.id), size = b.dataset.size, cur = cart.read().find((x) => x.id === id && x.size === size);
  if (b.dataset.a === "rm") cart.remove(id, size);
  else if (cur) cart.setQty(id, size, cur.qty + (b.dataset.a === "inc" ? 1 : -1));
  draw();
});
load();
