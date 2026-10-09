import { api, cart, esc, money, $, msg, payOnline } from "./common.js";
import { effPrice } from "./render.js";

const box = $("#box");
const SAVED = "sjc_addr_v1", IDEM = "sjc_idem_v1";
let user, lines = [], shipping = { flat: 0, freeAbove: null }, busy = false;

const saved = () => { try { return JSON.parse(localStorage.getItem(SAVED) || "{}"); } catch { return {}; } };
const sig = (items) => items.map((i) => `${i.id}:${i.size}:${i.qty}`).sort().join("|");
function idemKey(items, pm) {   // same key for retries of the SAME cart => the server never creates a duplicate order
  const s = pm + "#" + sig(items);
  try { const c = JSON.parse(sessionStorage.getItem(IDEM) || "{}"); if (c.sig === s && c.key) return c.key; } catch {}
  const key = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2, 12);
  try { sessionStorage.setItem(IDEM, JSON.stringify({ sig: s, key })); } catch {}
  return key;
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
    lines = items.map((i) => {
      const p = by[i.id];
      if (!p || Number(p.stock) <= 0 || (p.sizes?.length && !p.sizes.includes(i.size))) { bad.push(p?.name || "An item"); return null; }
      return { i, p, qty: Math.min(i.qty, Number(p.stock)), unit: effPrice(p) };
    }).filter(Boolean);
    if (bad.length) { box.innerHTML = `<div class="msg err">${esc(bad.join(", "))} is unavailable. Please update your cart.</div><a class="btn primary" href="/cart">Back to cart</a>`; return; }
    draw();
  } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div><button class="btn outline" id="retry">Try again</button>`; $("#retry").onclick = start; }
}

function draw() {
  const s = saved(), sub = lines.reduce((n, l) => n + l.unit * l.qty, 0), ship = shipping.freeAbove && sub >= shipping.freeAbove ? 0 : shipping.flat;
  box.innerHTML = `<form id="f" novalidate class="cartgrid"><div>
  <div class="panel"><h2>Delivery details</h2>
   <label class="f">Full name *<input name="name" autocomplete="name" required maxlength="80" value="${esc(s.name || user.name || "")}"></label>
   <label class="f">Mobile number *<input name="phone" type="tel" inputmode="numeric" autocomplete="tel-national" required maxlength="14" placeholder="10-digit mobile number" value="${esc(s.phone || "")}"></label>
   <label class="f">Email <small>(optional, for updates)</small><input name="email" type="email" autocomplete="email" maxlength="120" value="${esc(s.email || user.email || "")}"></label>
   <label class="f">Full address *<textarea name="address" autocomplete="street-address" required maxlength="300" placeholder="House no., street, landmark, village / area">${esc(s.address || "")}</textarea></label>
   <div class="two"><label class="f">City / Town *<input name="city" autocomplete="address-level2" required maxlength="60" value="${esc(s.city || "")}"></label>
   <label class="f">State *<input name="state" autocomplete="address-level1" required maxlength="60" value="${esc(s.state || "Uttar Pradesh")}"></label></div>
   <label class="f">Pincode *<input name="pincode" inputmode="numeric" autocomplete="postal-code" required maxlength="6" pattern="[0-9]{6}" value="${esc(s.pincode || "")}"></label></div>
  <div class="panel"><h2>Payment</h2><div class="paybox">
   <label class="pay"><input type="radio" name="pm" value="COD" checked><span><b>Cash on Delivery</b><small>Pay in cash when your order arrives</small></span></label>
   <label class="pay"><input type="radio" name="pm" value="ONLINE"><span><b>Pay online</b><small>UPI / Google Pay / PhonePe / cards / netbanking via Razorpay</small></span></label></div>
   <p class="note">Never share your UPI PIN or card OTP with anyone. We never ask for it.</p></div></div>
  <div class="panel"><h2>Order summary</h2>${lines.map((l) => `<div class="tot"><span>${esc(l.p.name)}${l.i.size ? ` (${esc(l.i.size)})` : ""} × ${l.qty}</span><span>${money(l.unit * l.qty)}</span></div>`).join("")}
   <div class="tot" style="margin-top:8px"><span>Subtotal</span><span>${money(sub)}</span></div><div class="tot"><span>Delivery</span><span>${ship ? money(ship) : "Free"}</span></div>
   <div class="tot big"><span>Total</span><span>${money(sub + ship)}</span></div>
   <div id="m"></div><button class="btn primary lg" style="width:100%" id="go" type="submit">Place order</button>
   <p class="sm muted">By placing the order you confirm the details above are correct.</p></div></form>`;
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
  const items = lines.map((l) => ({ productId: l.p.id, qty: l.qty, size: l.i.size }));
  try {
    const d = await api("/api/orders", { method: "POST", body: { customer: c, items, paymentMethod: pm, idempotencyKey: idemKey(lines.map((l) => ({ id: l.p.id, size: l.i.size, qty: l.qty })), pm) } });
    if (pm === "COD") return finish(d.orderNumber, "cod");
    if (!d.razorpay) { cart.clear(); return finish(d.orderNumber, "unpaid"); }
    $("#go").textContent = "Opening payment…";
    await payOnline({
      orderNumber: d.orderNumber, razorpay: d.razorpay, prefill: { name: c.name, contact: c.phone, email: c.email },
      onPaid: () => finish(d.orderNumber, "paid"),
      onProblem: (t) => { cart.clear(); box.innerHTML = `<div class="msg err">${esc(t)}</div><p>Order no: <b>${esc(d.orderNumber)}</b></p><a class="btn primary" href="/account?order=${encodeURIComponent(d.orderNumber)}">Open this order</a>`; },
      onDismiss: () => { cart.clear(); box.innerHTML = `<div class="msg info">Payment was not completed. Your order <b>${esc(d.orderNumber)}</b> is saved, and you can pay or cancel it from My Orders.</div><a class="btn primary" href="/account?order=${encodeURIComponent(d.orderNumber)}">Go to my order</a>`; },
    });
  } catch (err) { fail(err.message); }
}
start();
