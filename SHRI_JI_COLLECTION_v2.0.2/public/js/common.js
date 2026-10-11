// Shared browser code: header/footer, API helper, cart, Razorpay launcher.
import { headerHtml, footerHtml, logoHtml, esc, money } from "./render.js";
export { esc, money };

export async function api(url, { method = "GET", body } = {}) {
  let r;
  try {
    r = await fetch(url, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error("No internet connection. Please check your network and try again."); }
  let d = {};
  try { d = await r.json(); } catch { /* non-JSON error page */ }
  if (!r.ok) { const e = new Error(d.error || "Something went wrong. Please try again."); e.status = r.status; throw e; }
  return d;
}
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
export const msg = (el, text, kind = "err") => { el.innerHTML = text ? `<div class="msg ${kind}" role="${kind === "err" ? "alert" : "status"}">${esc(text)}</div>` : ""; };
export const badge = (v) => `<span class="badge b-${esc(v)}">${esc(v)}</span>`;
export const fmtDate = (d) => new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

// ---------- cart (ids/size/qty only; prices are always re-fetched from the server) ----------
const KEY = "sjc_cart_v2";
const ok = (x) => x && Number.isSafeInteger(x.id) && x.id > 0 && Number.isInteger(x.qty) && x.qty >= 1 && x.qty <= 10 && typeof x.size === "string";
export const cart = {
  read() { try { const a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a.filter(ok) : []; } catch { return []; } },
  write(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* private mode */ } cart.badge(); },
  add(id, size, qty) {
    const a = cart.read(), x = a.find((i) => i.id === id && i.size === size);
    if (x) x.qty = Math.min(10, x.qty + qty); else a.push({ id, size, qty: Math.min(10, qty) });
    cart.write(a);
  },
  setQty(id, size, qty) { cart.write(cart.read().map((i) => (i.id === id && i.size === size ? { ...i, qty: Math.max(1, Math.min(10, qty)) } : i))); },
  remove(id, size) { cart.write(cart.read().filter((i) => !(i.id === id && i.size === size))); },
  clear() { cart.write([]); },
  count() { return cart.read().reduce((n, i) => n + i.qty, 0); },
  badge() { const el = $("#cartCount"); if (!el) return; const n = cart.count(); el.textContent = n; el.hidden = !n; },
};

// ---------- Razorpay Checkout ----------
function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = res; s.onerror = () => rej(new Error("Could not load the payment window. Please check your internet connection."));
    document.head.appendChild(s);
  });
}
/** Opens Razorpay. The order is only marked paid by the SERVER after it verifies the signature. */
export async function payOnline({ orderNumber, razorpay, prefill, onPaid, onProblem, onDismiss }) {
  await loadRazorpay();
  const rzp = new window.Razorpay({
    key: razorpay.key, amount: razorpay.amount, currency: razorpay.currency, order_id: razorpay.orderId,
    name: "SHRI JI COLLECTION", description: "Order " + orderNumber, prefill, theme: { color: "#6b1523" },
    modal: { ondismiss: onDismiss, confirm_close: true },
    handler: async (r) => {
      try {
        await api("/api/verify-payment", { method: "POST", body: { razorpay_order_id: r.razorpay_order_id, razorpay_payment_id: r.razorpay_payment_id, razorpay_signature: r.razorpay_signature } });
        onPaid();
      } catch (e) {
        onProblem("We received your payment but could not confirm it yet. Please do NOT pay again. Check My Orders in a few minutes, or call us with order no. " + orderNumber + ".");
      }
    },
  });
  rzp.on("payment.failed", (r) => onProblem((r?.error?.description || "Payment failed") + ". Your order is saved; you can retry from My Orders."));
  rzp.open();
}

// ---------- Paytm JS Checkout ----------
function loadPaytm(host, mid) {
  if (window.Paytm?.CheckoutJS) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-paytm-checkout="true"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Paytm checkout. Please try again.")), { once: true });
      if (window.Paytm?.CheckoutJS) resolve();
      return;
    }
    const s = document.createElement("script");
    s.dataset.paytmCheckout = "true";
    s.src = `${host}/merchantpgpui/checkoutjs/merchants/${encodeURIComponent(mid)}.js`;
    s.crossOrigin = "anonymous";
    s.onload = () => window.Paytm?.CheckoutJS ? resolve() : reject(new Error("Paytm checkout did not initialize."));
    s.onerror = () => reject(new Error("Could not load Paytm checkout. Please check your internet connection."));
    document.head.appendChild(s);
  });
}

/** Launch Paytm CheckoutJS. Browser callback data is never accepted as proof of payment;
 * the backend re-queries Paytm's Transaction Status API and reconciles the result. */
export async function payWithPaytm({ orderNumber, paytm, onPaid, onProblem, onPending, onDismiss }) {
  if (!paytm?.host || !paytm?.mid || !paytm?.orderId || !paytm?.txnToken || !paytm?.amount) {
    throw new Error("Paytm checkout details are incomplete. Open My Orders and retry.");
  }
  await loadPaytm(paytm.host, paytm.mid);
  const checkout = window.Paytm?.CheckoutJS;
  if (!checkout) throw new Error("Paytm checkout is unavailable. Please retry.");

  let settled = false;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const reconcile = async (eventName) => {
    if (settled) return;
    // Paytm may notify before its status API has reached a final state, so reconcile and retry briefly.
    try {
      let result;
      for (let attempt = 0; attempt < 3; attempt++) {
        result = await api("/api/paytm?action=verify", { method: "POST", body: { orderNumber } });
        if (result.status === "paid") {
          settled = true;
          onPaid?.();
          return;
        }
        if (result.status === "failed") {
          settled = true;
          onProblem?.("Paytm reports that this payment failed. Your order is saved; you can retry from My Orders.");
          return;
        }
        if (attempt < 2) await sleep(1400);
      }
      settled = true;
      if (eventName && /CLOSE|CANCEL|FAIL/i.test(String(eventName))) {
        onDismiss?.();
      } else {
        onPending?.("Payment status is still pending. Do not pay again yet; check My Orders in a few moments.");
      }
    } catch {
      settled = true;
      onPending?.("We could not confirm the payment yet. Do not pay again until you check My Orders.");
    }
  };

  const config = {
    root: "",
    flow: "DEFAULT",
    data: { orderId: paytm.orderId, token: paytm.txnToken, tokenType: "TXN_TOKEN", amount: paytm.amount },
    handler: { notifyMerchant: (eventName) => { void reconcile(eventName); } },
  };
  await new Promise((resolve, reject) => {
    try {
      checkout.onLoad(() => {
        checkout.init(config).then(() => { checkout.invoke(); resolve(); }).catch(() => reject(new Error("Could not open Paytm checkout. Please retry from My Orders.")));
      });
    } catch { reject(new Error("Could not open Paytm checkout. Please retry from My Orders.")); }
  });
}

// ---------- header / footer ----------
function init() {
  const h = $("#hdr"), f = $("#ftr");
  const LK = "sjc_logo_v1", cached = () => { try { return localStorage.getItem(LK) || ""; } catch { return ""; } };
  const setCache = (u) => { try { u ? localStorage.setItem(LK, u) : localStorage.removeItem(LK); } catch { /* private mode */ } };
  if (h && !h.firstElementChild) {          // static pages (cart, checkout, account, admin): header built here
    h.innerHTML = headerHtml({ logo: cached() });
    fetch("/api/site-settings", { credentials: "same-origin" }).then((r) => r.json()).then((d) => {
      const u = d?.settings?.logo_url || "", a = $(".logo", h);
      if (a && u !== cached()) { a.innerHTML = logoHtml(u); }
      setCache(u);
    }).catch(() => {});
  } else if (h) setCache($(".logo-img", h)?.getAttribute("src") || "");   // server-rendered pages keep the cache fresh
  if (f && !f.firstElementChild) f.innerHTML = footerHtml();
  const btn = $("#menuBtn"), panel = $("#menuPanel"), bg = $("#drawerBg"), x = $("#menuClose");
  if (btn && panel && bg) {
    const set = (open) => {
      panel.hidden = bg.hidden = !open; btn.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
      (open ? x : btn).focus();
    };
    btn.addEventListener("click", () => set(panel.hidden));
    x.addEventListener("click", () => set(false));
    bg.addEventListener("click", () => set(false));
    panel.addEventListener("click", (e) => e.target.closest("a") && set(false));
    document.addEventListener("keydown", (e) => e.key === "Escape" && !panel.hidden && set(false));
    window.matchMedia("(min-width:900px)").addEventListener("change", (m) => m.matches && !panel.hidden && set(false));
  }
  cart.badge();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
window.addEventListener("storage", () => cart.badge());
window.addEventListener("pageshow", () => cart.badge());
