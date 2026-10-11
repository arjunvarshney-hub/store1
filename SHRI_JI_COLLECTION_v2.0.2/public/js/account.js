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
  try { o = (await api("/api/orders/my?number=" + encodeURIComponent(num))).order; }
  catch (e) { box.innerHTML = `<div class="msg err">${esc(e.message)}</div><a class="btn outline" href="/account">My orders</a>`; return; }
  const placed = qs.get("placed");
  const banner = placed === "paid" ? ["Payment received. Your order is confirmed. Thank you!", "ok"] : placed === "cod" ? ["Order placed. You will pay in cash on delivery. Thank you!", "ok"] : placed === "unpaid" ? ["Your order is saved but the payment could not be started. You can pay below or cancel the order.", "info"] : null;
  const canPay = o.payment_method === "ONLINE" && ["pending", "failed"].includes(o.payment_status) && o.order_status === "pending";
  const canCancel = o.order_status === "pending" && o.payment_status !== "paid";
  const cr = o.cancellationRequest;
  const canRequestCancel = ["confirmed", "processing", "packed"].includes(o.order_status) && cr?.status !== "requested";
  const cancellationRequestHtml = cr ? `<div class="return-status"><b>Cancellation request:</b> ${badge(cr.status)}<div class="muted sm">Requested ${fmtDate(cr.created_at)} · ${esc(cr.reason || "No reason provided")}</div>${cr.decision_reason ? `<div class="sm">${esc(cr.decision_reason)}</div>` : ""}</div>` : "";
  const statuses = ["pending", "confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered"];
  const labels = { pending: "Order placed", confirmed: "Order confirmed", processing: "Processing", packed: "Packed", shipped: "Shipped", out_for_delivery: "Out for delivery", delivered: "Delivered" };
  const events = Array.isArray(o.events) ? o.events : [];
  const latest = o.order_status;
  const timeline = latest === "cancelled"
    ? `<div class="timeline-stop active"><span class="timeline-dot"></span><div><b>Cancelled</b><div class="muted sm">${fmtDate(events.find(x => x.new_status === "cancelled")?.created_at || o.updated_at || o.created_at)}</div></div></div>`
    : statuses.filter(s => s !== "processing" || events.some(e => e.new_status === s)).map((st) => {
        const ev = events.find(e => e.new_status === st) || (st === "pending" ? { created_at: o.created_at } : null);
        const done = statuses.indexOf(st) <= statuses.indexOf(latest);
        return `<div class="timeline-stop ${done ? "active" : ""}"><span class="timeline-dot"></span><div><b>${labels[st]}</b>${ev ? `<div class="muted sm">${fmtDate(ev.created_at)}</div>` : ""}</div></div>`;
      }).join("");
  const returnRows = Array.isArray(o.returns) ? o.returns : [];
  const renderReturnAction = (item, idx) => {
    const itemIndex = Number(item.item_index) || idx + 1;
    const active = returnRows.find(r => Number(r.item_index) === itemIndex && !["rejected", "closed"].includes(r.status));
    if (active) return `<div class="return-status"><b>Return / issue request:</b> ${badge(active.status)}${active.return_deadline ? `<div class="muted sm">Request deadline: ${fmtDate(active.return_deadline)}</div>` : ""}${active.decision_reason ? `<div class="sm">${esc(active.decision_reason)}</div>` : ""}${active.refund_status && active.refund_status !== "not_started" ? `<div class="sm">Refund: ${esc(active.refund_status)}${active.refund_amount != null ? ` · ${money(active.refund_amount)}` : ""}</div>` : ""}</div>`;
    const deliveredEvent = events.filter(e => e.new_status === "delivered" || e.event_type === "order_delivered").slice(-1)[0];
    const deliveredAt = o.delivered_at || deliveredEvent?.created_at;
    const eligible = item.return_eligible === true && Number(item.return_window_days) > 0;
    const deadline = deliveredAt && eligible ? Date.parse(deliveredAt) + Number(item.return_window_days) * 86400000 : 0;
    const inWindow = deadline > Date.now();
    if (o.order_status !== "delivered") return `<p class="sm muted">Return requests become available after delivery.</p>`;
    if (!deliveredAt) return `<p class="sm muted">Delivery date is not available, so a standard-return deadline cannot be calculated. Damaged, defective, incorrect or not-as-described items can still be reported.</p><button class="btn outline sm" data-issue-item="${idx}">Report a product issue</button><div id="returnForm-${idx}"></div>`;
    if (eligible && inWindow) return `<p class="sm muted">Return window ends ${fmtDate(new Date(deadline).toISOString())}. ${item.return_conditions ? esc(item.return_conditions) : ""}</p><button class="btn outline sm" data-return-item="${idx}">Request return</button><div id="returnForm-${idx}"></div>`;
    return `<p class="sm muted">${eligible ? "The configured return window has expired." : "Non-returnable under the store's regular policy."} Damaged, defective, incorrect or not-as-described items can still be reported.</p><button class="btn outline sm" data-issue-item="${idx}">Report a product issue</button><div id="returnForm-${idx}"></div>`;
  };
  box.innerHTML = `<a class="link" href="/account">‹ My orders</a><h1 class="h1">Order ${esc(o.order_number)}</h1>${banner ? `<div class="msg ${banner[1]}">${esc(banner[0])}</div>` : ""}<div id="m"></div>
  <div class="panel"><div>${badge(o.order_status)} ${badge(o.payment_status === "paid" ? "paid" : o.payment_status)}</div><p class="sm muted">Placed ${fmtDate(o.created_at)} · ${o.payment_method === "COD" ? "Cash on Delivery" : "Online payment"}</p>
   ${canPay ? '<button class="btn primary lg" style="width:100%" id="pay" type="button">Pay now</button>' : ""}${canCancel ? '<button class="btn danger" style="width:100%;margin-top:8px" id="cancel" type="button">Cancel order</button>' : ""}${cancellationRequestHtml}${canRequestCancel ? '<button class="btn outline" style="width:100%;margin-top:8px" id="cancelRequest" type="button">Request cancellation</button><p class="muted sm">The shop must review this request; the order is not cancelled automatically.</p>' : ""}</div>
  <div class="panel"><h2>Delivery progress</h2><div class="order-timeline">${timeline}</div>${events.filter(e => e.event_type && !["order_created", "status_changed"].includes(e.event_type)).map(e => `<p class="muted sm">${esc(e.note || e.event_type)} · ${fmtDate(e.created_at)}</p>`).join("")}${o.tracking_number ? `<p>Courier tracking: <b>${esc(o.tracking_number)}</b>${o.tracking_url ? ` · <a href="${esc(o.tracking_url)}" target="_blank" rel="noopener">Track shipment</a>` : ""}</p>` : ""}</div>
  <div class="panel"><h2>Items</h2>${o.items.map((i, idx) => `<div class="row order-item"><div>${imgTag(i.image, i.name, { w: 76, h: 76 })}</div><div class="order-item-info"><div class="nm">${i.slug ? `<a href="/product/${esc(i.slug)}">${esc(i.name)}</a>` : esc(i.name)}</div><div class="muted sm">${i.variant_label ? `Variant: ${esc(i.variant_label)} · ` : ""}${i.size ? "Size: " + esc(i.size) + " · " : ""}Qty ${i.qty ?? 1}${Number(i.pack_quantity) > 1 ? ` · Pack of ${Number(i.pack_quantity)} (${Number(i.pack_quantity) * Number(i.qty || 1)} pieces)` : ""}</div><b>${money((i.unit_price ?? i.price ?? 0) * (i.qty ?? 1))}</b><div class="item-return-action">${renderReturnAction(i, idx)}</div></div></div>`).join("")}
   <div class="tot"><span>Subtotal</span><span>${money(o.subtotal)}</span></div><div class="tot"><span>Delivery</span><span>${Number(o.shipping) ? money(o.shipping) : "Free"}</span></div><div class="tot big"><span>Total</span><span>${money(o.total)}</span></div></div>
  <div class="panel"><h2>Delivery address</h2><p style="margin:0">${esc(o.customer_name)}<br>${esc(o.address)}<br>${esc(o.city || "")}, ${esc(o.state || "")} - ${esc(o.pincode || "")}<br>📞 ${esc(o.phone)}</p></div>
  <p class="sm muted">Need help? <a href="https://wa.me/919927892667" target="_blank" rel="noopener">WhatsApp us</a> with order no. ${esc(o.order_number)}.</p>`;
  const uploadPhoto = async (file) => {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) throw new Error("Each photo must be JPG, PNG or WebP and up to 2 MB.");
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("Could not read the selected photo.")); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); });
    const base64 = dataUrl.split(",")[1] || "";
    return (await api("/api/orders?action=return-photo", { method: "POST", body: { data: base64 } })).path;
  };
  const openReturnForm = (idx, issueOnly) => {
    const target = $(`#returnForm-${idx}`); if (!target) return;
    const reasons = issueOnly ? [["damaged", "Arrived damaged"], ["defective", "Defective / not working"], ["wrong_item", "Wrong item received"], ["not_as_described", "Item not as described"]] : [["changed_mind", "Changed my mind"], ["damaged", "Arrived damaged"], ["defective", "Defective / not working"], ["wrong_item", "Wrong item received"], ["not_as_described", "Item not as described"], ["other", "Other reason"]];
    target.innerHTML = `<form class="return-request-form" data-return-form="${idx}" novalidate><label class="f">Reason *<select name="reason" required>${reasons.map(([v,l]) => `<option value="${v}">${l}</option>`).join("")}</select></label><label class="f">Details <textarea name="details" maxlength="1500" rows="3" placeholder="Explain the issue or return reason"></textarea></label><label class="f">Photos (optional, up to 4)<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple></label><p class="sm muted">Maximum 2 MB per photo. Photos are stored privately for shop review.</p><div class="acts"><button class="btn primary sm" type="submit">Submit request</button><button class="btn outline sm" type="button" data-return-close="${idx}">Close</button></div><div data-form-message></div></form>`;
  };
  box.querySelectorAll("[data-return-item]").forEach(b => b.addEventListener("click", () => openReturnForm(Number(b.dataset.returnItem), false)));
  box.querySelectorAll("[data-issue-item]").forEach(b => b.addEventListener("click", () => openReturnForm(Number(b.dataset.issueItem), true)));
  box.querySelectorAll("[data-return-close]").forEach(b => b.addEventListener("click", () => { const t = $(`#returnForm-${b.dataset.returnClose}`); if (t) t.innerHTML = ""; }));
  box.querySelectorAll("[data-return-form]").forEach(form => form.addEventListener("submit", async e => {
    e.preventDefault(); const f = e.currentTarget, submit = f.querySelector('button[type="submit"]'), output = f.querySelector("[data-form-message]");
    if (submit.disabled) return; submit.disabled = true; output.innerHTML = '<p class="muted sm">Submitting request…</p>';
    try {
      const files = [...(f.elements.photos?.files || [])]; if (files.length > 4) throw new Error("Choose no more than 4 photos.");
      const paths = []; for (const file of files) paths.push(await uploadPhoto(file));
      const item = o.items[Number(f.dataset.returnForm)];
      const d = await api("/api/orders?action=returns", { method: "POST", body: { action: "request", orderNumber: o.order_number, itemIndex: Number(f.dataset.returnForm), reason: f.elements.reason.value, details: f.elements.details.value.trim(), photoPaths: paths } });
      msg(output, d.message || "Request submitted for review.", "ok"); await orderDetail(num);
    } catch (err) { msg(output, err.message); submit.disabled = false; }
  }));
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
  $("#cancelRequest")?.addEventListener("click", async (e) => {
    const reason = prompt("Why do you want to cancel this order?", "Change of mind");
    if (reason === null) return;
    e.target.disabled = true;
    try {
      const d = await api("/api/orders?action=cancellations", { method: "POST", body: { orderNumber: o.order_number, reason: reason.trim() } });
      msg($("#m"), d.message || "Cancellation request sent for review.", "ok");
      await orderDetail(num);
    } catch (err) { msg($("#m"), err.message); e.target.disabled = false; }
  });
}

start();
