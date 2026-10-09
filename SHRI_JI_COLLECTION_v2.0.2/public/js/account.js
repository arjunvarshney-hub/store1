import { api, esc, money, $, $$, msg, badge, fmtDate, payOnline } from "./common.js";
import { imgTag } from "./render.js";

const box = $("#box");
const qs = new URLSearchParams(location.search);
// Supabase email links (confirm / reset) land here with tokens in the URL hash.
const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
let user = null;

const nextUrl = () => { const n = qs.get("next"); return n && /^\/[a-z]/i.test(n) && !n.startsWith("//") ? n : null; };

async function start() {
  if (hash.get("type") === "recovery" && hash.get("access_token")) return resetForm(hash.get("access_token"));
  const notice = hash.get("error_description") ? { t: "That link is invalid or has expired. Please request a new one.", k: "err" }
    : hash.get("type") === "signup" || hash.get("access_token") ? { t: "Email confirmed! Please log in.", k: "ok" } : null;
  if (location.hash.length > 1) history.replaceState(null, "", location.pathname + location.search);
  try { const me = await api("/api/auth/me"); user = me.user; var isAdmin = me.isAdmin; } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }
  if (!user) return authForm(notice);
  if (nextUrl()) return (location.href = nextUrl());
  if (qs.get("order")) return orderDetail(qs.get("order"));
  home(isAdmin);
}

function authForm(notice, mode = "login") {
  box.innerHTML = `<h1 class="h1">My account</h1><div class="panel"><div class="tabs" role="tablist"><button type="button" class="${mode === "login" ? "on" : ""}" data-m="login">Log in</button><button type="button" class="${mode === "signup" ? "on" : ""}" data-m="signup">Create account</button></div>
  <div id="m">${notice ? `<div class="msg ${notice.k}">${esc(notice.t)}</div>` : ""}</div>
  <form id="f" novalidate>${mode === "signup" ? '<label class="f">Full name<input name="name" autocomplete="name" maxlength="80"></label>' : ""}
  <label class="f">Email<input name="email" type="email" autocomplete="email" inputmode="email" required></label>
  <label class="f">Password ${mode === "signup" ? "<small>(at least 8 characters)</small>" : ""}<input name="password" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" required minlength="8"></label>
  <button class="btn primary lg" style="width:100%;margin-top:14px" id="go" type="submit">${mode === "signup" ? "Create account" : "Log in"}</button></form>
  ${mode === "login" ? '<button class="link" type="button" id="forgot">Forgot password?</button>' : ""}</div>`;
  $$(".tabs button").forEach((b) => b.addEventListener("click", () => authForm(null, b.dataset.m)));
  $("#forgot")?.addEventListener("click", forgot);
  $("#f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, go = $("#go"), body = { email: f.email.value.trim(), password: f.password.value };
    if (mode === "signup") body.name = f.name.value.trim();
    if (!body.email || !body.password) return msg($("#m"), "Please enter your email and password.");
    go.disabled = true; msg($("#m"), "");
    try {
      const d = await api(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", { method: "POST", body });
      if (mode === "signup" && !d.loggedIn) { msg($("#m"), d.message, "ok"); go.disabled = false; return; }
      start();
    } catch (err) { msg($("#m"), err.message); go.disabled = false; }
  });
}
function forgot() {
  box.innerHTML = `<h1 class="h1">Reset password</h1><div class="panel"><div id="m"></div><form id="f" novalidate><label class="f">Your account email<input name="email" type="email" autocomplete="email" required></label><button class="btn primary lg" style="width:100%;margin-top:14px" type="submit">Send reset link</button></form><button class="link" id="back" type="button">Back to log in</button></div>`;
  $("#back").onclick = () => authForm(); 
  $("#f").addEventListener("submit", async (e) => { e.preventDefault(); try { const d = await api("/api/auth/reset-request", { method: "POST", body: { email: e.target.email.value.trim() } }); msg($("#m"), d.message, "ok"); } catch (err) { msg($("#m"), err.message); } });
}
function resetForm(token) {
  history.replaceState(null, "", location.pathname);
  box.innerHTML = `<h1 class="h1">Set a new password</h1><div class="panel"><div id="m"></div><form id="f" novalidate><label class="f">New password <small>(at least 8 characters)</small><input name="p" type="password" autocomplete="new-password" minlength="8" required></label><button class="btn primary lg" style="width:100%;margin-top:14px" type="submit">Update password</button></form></div>`;
  $("#f").addEventListener("submit", async (e) => { e.preventDefault(); try { await api("/api/auth/update-password", { method: "POST", body: { accessToken: token, password: e.target.p.value } }); authForm({ t: "Password updated. Please log in.", k: "ok" }); } catch (err) { msg($("#m"), err.message); } });
}

async function home(isAdmin) {
  box.innerHTML = `<h1 class="h1">My account</h1><div class="panel"><b>${esc(user.name || "Welcome")}</b><div class="muted sm">${esc(user.email)}</div><div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${isAdmin ? '<a class="btn outline sm" href="/admin">Admin panel</a>' : ""}<button class="btn outline sm" id="out" type="button">Log out</button></div></div>
  <div class="panel"><h2>My orders</h2><div id="orders"><p class="muted">Loading…</p></div></div>`;
  $("#out").onclick = async () => { try { await api("/api/auth/logout", { method: "POST" }); } catch {} location.href = "/"; };
  try {
    const { orders } = await api("/api/orders/my");
    $("#orders").innerHTML = orders.length ? orders.map((o) => `<a class="ocard" href="/account?order=${encodeURIComponent(o.order_number)}"><div class="top2"><span>${esc(o.order_number)}</span><span>${money(o.total)}</span></div><div class="sm muted">${fmtDate(o.created_at)} · ${o.items.reduce((n, i) => n + (i.qty || 0), 0)} item(s)</div><div style="margin-top:4px">${badge(o.order_status)} ${badge(o.payment_status === "paid" ? "paid" : o.payment_method === "COD" ? "COD · pay on delivery" : o.payment_status)}</div></a>`).join("") : '<p class="muted">You have not placed any orders yet.</p><a class="btn primary" href="/shop">Start shopping</a>';
  } catch (e) { $("#orders").innerHTML = `<div class="msg err">${esc(e.message)}</div>`; }
}

async function orderDetail(num) {
  box.innerHTML = '<p class="muted">Loading order…</p>';
  let o;
  try { o = (await api("/api/orders/my?number=" + encodeURIComponent(num))).order; } catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div><a class="btn outline" href="/account">My orders</a>`; return; }
  const placed = qs.get("placed");
  const banner = placed === "paid" ? ["Payment received. Your order is confirmed. Thank you!", "ok"] : placed === "cod" ? ["Order placed. You will pay in cash on delivery. Thank you!", "ok"] : placed === "unpaid" ? ["Your order is saved but the payment could not be started. You can pay below or cancel the order.", "info"] : null;
  const canPay = o.payment_method === "ONLINE" && ["pending", "failed"].includes(o.payment_status) && o.order_status === "pending";
  const canCancel = o.order_status === "pending" && o.payment_status !== "paid";
  box.innerHTML = `<a class="link" href="/account">‹ My orders</a><h1 class="h1">Order ${esc(o.order_number)}</h1>${banner ? `<div class="msg ${banner[1]}">${esc(banner[0])}</div>` : ""}<div id="m"></div>
  <div class="panel"><div>${badge(o.order_status)} ${badge(o.payment_status === "paid" ? "paid" : o.payment_status)}</div><p class="sm muted">Placed ${fmtDate(o.created_at)} · ${o.payment_method === "COD" ? "Cash on Delivery" : "Online payment"}</p>
   ${canPay ? '<button class="btn primary lg" style="width:100%" id="pay" type="button">Pay now</button>' : ""}${canCancel ? '<button class="btn danger" style="width:100%;margin-top:8px" id="cancel" type="button">Cancel order</button>' : ""}</div>
  <div class="panel"><h2>Items</h2>${o.items.map((i) => `<div class="row"><div>${imgTag(i.image, i.name, { w: 76, h: 76 })}</div><div><div class="nm">${i.slug ? `<a href="/product/${esc(i.slug)}">${esc(i.name)}</a>` : esc(i.name)}</div><div class="muted sm">${i.size ? "Size: " + esc(i.size) + " · " : ""}Qty ${i.qty ?? 1}</div><b>${money((i.unit_price ?? i.price ?? 0) * (i.qty ?? 1))}</b></div></div>`).join("")}
   <div class="tot"><span>Subtotal</span><span>${money(o.subtotal)}</span></div><div class="tot"><span>Delivery</span><span>${Number(o.shipping) ? money(o.shipping) : "Free"}</span></div><div class="tot big"><span>Total</span><span>${money(o.total)}</span></div></div>
  <div class="panel"><h2>Delivery address</h2><p style="margin:0">${esc(o.customer_name)}<br>${esc(o.address)}<br>${esc(o.city || "")}, ${esc(o.state || "")} - ${esc(o.pincode || "")}<br>📞 ${esc(o.phone)}</p></div>
  <p class="sm muted">Need help? <a href="https://wa.me/919927892667" target="_blank" rel="noopener">WhatsApp us</a> with order no. ${esc(o.order_number)}.</p>`;
  $("#pay")?.addEventListener("click", async (e) => {
    e.target.disabled = true; msg($("#m"), "");
    try {
      const d = await api("/api/pay", { method: "POST", body: { orderNumber: o.order_number } });
      await payOnline({ orderNumber: o.order_number, razorpay: d.razorpay, prefill: { name: o.customer_name, contact: o.phone, email: o.email || undefined },
        onPaid: () => (location.href = `/account?order=${encodeURIComponent(o.order_number)}&placed=paid`),
        onProblem: (t) => { msg($("#m"), t); e.target.disabled = false; }, onDismiss: () => { e.target.disabled = false; } });
    } catch (err) { msg($("#m"), err.message); e.target.disabled = false; }
  });
  $("#cancel")?.addEventListener("click", async (e) => {
    if (!confirm("Cancel this order?")) return;
    e.target.disabled = true;
    try { await api("/api/orders/my", { method: "POST", body: { action: "cancel", orderNumber: o.order_number } }); location.href = `/account?order=${encodeURIComponent(o.order_number)}`; }
    catch (err) { msg($("#m"), err.message); e.target.disabled = false; }
  });
}
start();
