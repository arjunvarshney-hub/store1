import { api, cart, esc, money, $, msg, payOnline } from "./common.js";
import { deliveryAmount, freeDeliveryRemaining } from "./render.js";

const box = $("#box");
const SAVED = "sjc_addr_v1", IDEM = "sjc_idem_v1";
let user, lines = [], shipping = { tiers: [{ from: 0, charge: 50 }, { from: 499, charge: 40 }, { from: 1000, charge: 0 }] }, busy = false;
const saved = () => { try { return JSON.parse(localStorage.getItem(SAVED) || "{}"); } catch { return {}; } };
const sig = (items) => items.map((i) => `${i.id}:${i.size}:${i.variantId || ""}:${i.qty}`).sort().join("|");
function idemKey(items, pm) {
  const s = pm + "#" + sig(items);
  try { const c = JSON.parse(sessionStorage.getItem(IDEM) || "{}"); if (c.sig === s && c.key) return c.key; } catch {}
  const key = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2, 12);
  try { sessionStorage.setItem(IDEM, JSON.stringify({ sig: s, key })); } catch {}
  return key;
}
const priceForVariant = (v) => Number(v?.sale_price) > 0 && Number(v.sale_price) < Number(v.price) ? Number(v.sale_price) : Number(v?.price || 0);
function validateLine(i, p) {
  if (!p) return { bad: "No longer available" };
  const variants = Array.isArray(p.variants) ? p.variants.filter(v => v && v.active !== false) : [];
  if (variants.length) {
    const v = variants.find(x => String(x.id) === String(i.variantId || ""));
    if (!v) return { bad: "Please return to the product page and choose a product option." };
    const pack = Math.max(1, Number(v.pack_quantity) || 1), min = Math.max(1, Number(v.min_order_qty) || 1), stock = Math.max(0, Number(v.stock) || 0), available = Math.floor(stock / pack);
    if (available < min || Number(i.qty) > available) return { bad: `${p.name}: not enough stock for this pack size.` };
    if (Number(i.qty) < min) return { bad: `${p.name}: minimum order is ${min} package(s).` };
    return { i, p, variant: v, pack, min, available, qty: Number(i.qty), unit: priceForVariant(v), label: v.label || Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(" · ") };
  }
  if (i.variantId) return { bad: `${p.name}: this option is no longer available.` };
  const pack = Math.max(1, Number(p.pack_size) || 1), min = Math.max(1, Number(p.min_order_qty) || 1), stock = Math.max(0, Number(p.stock) || 0), available = Math.floor(stock / pack);
  if (p.sizes?.length && !p.sizes.includes(i.size)) return { bad: `${p.name}: please reselect a size.` };
  if (available < min || Number(i.qty) > available) return { bad: `${p.name}: not enough stock available.` };
  if (Number(i.qty) < min) return { bad: `${p.name}: minimum order is ${min} package(s).` };
  const unit = Number(p.sale_price) > 0 && Number(p.sale_price) < Number(p.price) ? Number(p.sale_price) : Number(p.price);
  return { i, p, pack, min, available, qty: Number(i.qty), unit, label: i.size ? `Size: ${i.size}` : "" };
}
async function start() {
  try {
    const me = await api("/api/auth/me"); user = me.user;
    if (!user) { box.innerHTML = `<div class="panel"><h2>Please log in to place your order</h2><p class="muted">Logging in lets you track your order and see it later in My Orders.</p><a class="btn primary lg" style="width:100%" href="/account?next=/checkout">Log in / Create account</a></div>`; return; }
    const items = cart.read();
    if (!items.length) { box.innerHTML = `<div class="empty"><p>Your cart is empty.</p><a class="btn primary" href="/shop">Continue shopping</a></div>`; return; }
    const d = await api("/api/products?ids=" + [...new Set(items.map((i) => i.id))].join(","));
    shipping = d.shipping || shipping;
    const by = Object.fromEntries(d.products.map((p) => [p.id, p]));
    const bad = [];
    lines = items.map((i) => { const l = validateLine(i, by[i.id]); if (l.bad) bad.push(l.bad); return l; });
    if (bad.length) { box.innerHTML = `<div class="msg err">${esc(bad.join(" "))} Please update your cart before checkout.</div><a class="btn primary" href="/cart">Back to cart</a>`; return; }
    draw();
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div><button class="btn outline" id="retry">Try again</button>`; $("#retry").onclick = start; }
}
function draw() {
  const s = saved(), sub = lines.reduce((n, l) => n + l.unit * l.qty, 0), ship = deliveryAmount(sub, shipping), remaining = freeDeliveryRemaining(sub);
  box.innerHTML = `<form id="f" novalidate class="cartgrid"><div>
  <div class="panel"><h2>Delivery details</h2>
   <label class="f">Full name *<input name="name" autocomplete="name" required maxlength="80" value="${esc(s.name || user.name || "")}"></label>
   <label class="f">Mobile number *<input name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" required maxlength="14" placeholder="10-digit mobile number" value="${esc(s.phone || "")}"></label>
   <label class="f">Email <small>(optional, for updates)</small><input name="email" type="email" autocomplete="email" maxlength="120" value="${esc(s.email || user.email || "")}"></label>
   <label class="f">House / Flat, street and locality *<textarea name="address" autocomplete="street-address" required maxlength="300" placeholder="House no., street, locality, landmark">${esc(s.address || "")}</textarea></label>
   <div class="two"><label class="f">City / Town *<input name="city" autocomplete="address-level2" required maxlength="60" value="${esc(s.city || "")}"></label>
   <label class="f">State *<input name="state" autocomplete="address-level1" required maxlength="60" value="${esc(s.state || "Uttar Pradesh")}"></label></div>
   <label class="f">Pincode *<input name="pincode" inputmode="numeric" autocomplete="postal-code" required maxlength="6" pattern="[0-9]{6}" value="${esc(s.pincode || "")}"></label></div>
  <div class="panel"><h2>Payment</h2><div class="paybox">
   <label class="pay"><input type="radio" name="pm" value="COD" checked><span><b>Cash on Delivery</b><small>Pay in cash when your order arrives</small></span></label>
   <label class="pay"><input type="radio" name="pm" value="ONLINE"><span><b>Pay online</b><small>UPI apps, cards and netbanking via Razorpay (based on merchant configuration)</small></span></label></div>
   <p class="note">Never share your UPI PIN or card OTP with anyone. We never ask for it.</p></div></div>
  <div class="panel"><h2>Order summary</h2>${lines.map((l) => `<div class="tot"><span>${esc(l.p.name)}${l.label ? `<br><small class="muted">${esc(l.label)}</small>` : ""}${l.pack > 1 ? `<br><small class="muted">Pack of ${l.pack}</small>` : ""}<br><small class="muted">${l.qty} package(s) · ${l.qty * l.pack} piece(s)</small></span><span>${money(l.unit * l.qty)}</span></div>`).join("")}
   <div class="tot" style="margin-top:8px"><span>Item subtotal</span><span>${money(sub)}</span></div><div class="tot"><span>Delivery</span><span>${ship ? money(ship) : "Free"}</span></div>
   <div class="tot big"><span>Total</span><span>${money(sub + ship)}</span></div>
   ${remaining > 0 ? `<p class="sm muted">Add ${money(remaining)} more to unlock free delivery.</p>` : '<p class="sm ok">You unlocked free delivery.</p>'}
   <div id="m"></div><button class="btn primary lg" style="width:100%" id="go" type="submit">Place order</button>
   <p class="sm muted">The server independently validates item prices, variant, stock and delivery charge before creating the order.</p><p class="sm muted">By placing the order you confirm the details above are correct.</p></div></form>`;
  $("#f").addEventListener("submit", submit);
}
function fail(text) { msg($("#m"), text); busy = false; const b = $("#go"); if (b) { b.disabled = false; b.textContent = "Place order"; } }
function finish(num, text) { cart.clear(); try { sessionStorage.removeItem(IDEM); } catch {} location.href = `/account?order=${encodeURIComponent(num)}&placed=${text}`; }
async function submit(e) {
  e.preventDefault();
  if (busy) return;
  const f = e.target, v = (n) => f.elements[n].value.trim();
  const c = { name: v("name"), phone: v("phone"), email: v("email"), address: v("address"), city: v("city"), state: v("state"), pincode: v("pincode") };
  if (c.name.length < 2) return fail("Please enter your name.");
  if (!/^(\+?91|0)?[6-9]\d{9}$/.test(c.phone.replace(/[\s-]/g, ""))) return fail("Please enter a valid 10-digit mobile number.");
  if (c.address.length < 10) return fail("Please enter your complete address.");
  if (c.city.length < 2 || c.state.length < 2) return fail("Please enter your city and state.");
  if (!/^[1-9]\d{5}$/.test(c.pincode)) return fail("Please enter a valid 6-digit pincode.");
  const pm = f.elements.pm.value;
  busy = true; $("#go").disabled = true; $("#go").textContent = "Placing order…"; msg($("#m"), "");
  try { localStorage.setItem(SAVED, JSON.stringify(c)); } catch {}
  const items = lines.map((l) => ({ productId: l.p.id, qty: l.qty, size: l.i.size || "", ...(l.variant ? { variantId: l.variant.id } : {}) }));
  try {
    const d = await api("/api/orders", { method: "POST", body: { customer: c, items, paymentMethod: pm, idempotencyKey: idemKey(lines.map((l) => ({ id: l.p.id, size: l.i.size || "", variantId: l.variant?.id || "", qty: l.qty })), pm) } });
    if (pm === "COD") return finish(d.orderNumber, "cod");
    if (!d.razorpay) { busy = false; $("#go").disabled = false; $("#go").textContent = "Place order"; msg($("#m"), d.paymentError || "Your order was saved, but online payment could not start. Open My Orders to retry.", "info"); return; }
    $("#go").textContent = "Opening payment…";
    await payOnline({
      orderNumber: d.orderNumber, razorpay: d.razorpay, prefill: { name: c.name, contact: c.phone, email: c.email },
      onPaid: () => finish(d.orderNumber, "paid"),
      onProblem: (t) => { busy = false; box.innerHTML = `<div class="msg err">${esc(t)}</div><p>Order no: <b>${esc(d.orderNumber)}</b></p><a class="btn primary" href="/account?order=${encodeURIComponent(d.orderNumber)}">Open this order</a>`; },
      onDismiss: () => { busy = false; box.innerHTML = `<div class="msg info">Payment was not confirmed. Your order <b>${esc(d.orderNumber)}</b> is saved, and you can retry or cancel it from My Orders.</div><a class="btn primary" href="/account?order=${encodeURIComponent(d.orderNumber)}">Go to my order</a>`; },
    });
  } catch (err) { fail(err.message); }
}
start();
