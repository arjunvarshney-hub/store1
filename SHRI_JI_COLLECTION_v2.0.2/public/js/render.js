// Pure rendering helpers shared by the server (SSR pages) and the browser.
import { GROUPS, CATEGORIES, catName } from "./categories.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
export const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const deliveryAmount = (subtotal, shipping = {}) => {
  const s = Math.max(0, Number(subtotal) || 0);
  if (Array.isArray(shipping.tiers) && shipping.tiers.length) {
    return [...shipping.tiers].sort((a, b) => Number(b.from) - Number(a.from)).find((t) => s >= Number(t.from))?.charge ?? 50;
  }
  // Backward fallback for a cached older API response; the server still recalculates authoritatively.
  return s >= 1000 ? 0 : s >= 499 ? 40 : 50;
};
export const freeDeliveryRemaining = (subtotal) => Math.max(0, 1000 - Math.max(0, Number(subtotal) || 0));
export const priceFor = (p) => {
  const sp = Number(p?.sale_price), pr = Number(p?.price);
  return sp > 0 && sp < pr ? sp : pr;
};
export const effPrice = (p) => {
  const vars = Array.isArray(p?.variants) ? p.variants.filter((v) => v && v.active !== false && Number(v.stock) >= 0) : [];
  return vars.length ? Math.min(...vars.map(priceFor)) : priceFor(p);
};
export const onSale = (p) => effPrice(p) < Number(p.price);
export const pctOff = (p) => (onSale(p) ? Math.round((1 - effPrice(p) / Number(p.price)) * 100) : 0);
// Only https image URLs or same-site paths are ever placed in markup.
export const safeUrl = (u) => (typeof u === "string" && (/^https:\/\//i.test(u) || /^\/[^/]/.test(u)) ? u : "");

export function imgTag(url, alt, { eager = false, cls = "", w = 600, h = 600 } = {}) {
  const u = safeUrl(url);
  if (!u) return `<div class="ph" role="img" aria-label="${esc(alt)}"><span>Photo coming soon</span></div>`;
  return `<img class="${esc(cls)}" src="${esc(u)}" alt="${esc(alt)}" width="${w}" height="${h}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

export function cardHtml(p) {
  const href = "/product/" + encodeURIComponent(p.slug);
  const off = pctOff(p);
  const vars = Array.isArray(p.variants) ? p.variants.filter((v) => v && v.active !== false) : [];
  const out = vars.length ? !vars.some((v) => Number(v.stock) >= Number(v.pack_quantity || 1)) : Number(p.stock) <= 0;
  const categoryLabel = p.category_label || p.custom_category_name || catName(p.category);
  const count = Math.max(0, Number(p.review_count || 0));
  const average = p.average_rating == null ? NaN : Number(p.average_rating);
  const rating = count > 0 && Number.isFinite(average)
    ? `<div class="rating-mini"><span class="stars" role="img" aria-label="${average.toFixed(1)} out of 5 stars">${"★".repeat(Math.max(0, Math.min(5, Math.round(average))))}${"☆".repeat(5 - Math.max(0, Math.min(5, Math.round(average))))}</span><span>${average.toFixed(1)} · ${count} ${count === 1 ? "review" : "reviews"}</span></div>`
    : p.reviews_enabled ? '<div class="rating-mini muted">☆ No reviews yet</div>' : '<div class="rating-mini muted">Ratings coming soon</div>';
  return `<article class="card"><a class="card-img" href="${href}" aria-label="${esc(p.name)}">${imgTag(p.image_urls?.[0], `${p.name} - ${catName(p.category)}`)}${
    out ? '<span class="tag tag-out">Sold out</span>' : off ? `<span class="tag">${off}% OFF</span>` : ""
  }</a><div class="card-body"><a class="card-title" href="${href}">${esc(p.name)}</a><div class="price"><b>${vars.length ? "From " : ""}${money(effPrice(p))}</b>${
    !vars.length && onSale(p) ? ` <s>${money(p.price)}</s>` : ""
  }</div>${rating}<div class="muted sm">${esc(categoryLabel)}</div></div></article>`;
}

const I = {
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
};

export const logoHtml = (logo) =>
  safeUrl(logo) ? `<img class="logo-img" src="${esc(safeUrl(logo))}" alt="SHRI JI COLLECTION" height="48">` : "<span>SHRI JI</span><small>COLLECTION</small>";

export function headerHtml({ logo, categories = CATEGORIES } = {}) {
  const list = Array.isArray(categories) && categories.length ? categories.filter(c => c && c.slug && c.name && !c.is_legacy) : CATEGORIES;
  const grpLinks = (g) => list.filter((c) => c.group === g.slug).map((c) => `<a href="/category/${c.slug}">${esc(c.name)}</a>`).join("");
  const drawerGroups = GROUPS.map((g) => `<div class="mn-group"><a class="mn-head" href="/category/${g.slug}">${esc(g.name)}</a>${grpLinks(g)}</div>`).join("");
  const dd = GROUPS.map((g) => `<div class="dd"><a class="dd-t" href="/category/${g.slug}">${esc(g.name)} <span aria-hidden="true">▾</span></a><div class="dd-panel"><a class="all" href="/category/${g.slug}">All ${esc(g.name)}</a>${grpLinks(g)}</div></div>`).join("");
  return `<div class="strip">Cash on Delivery &bull; UPI &amp; Cards &bull; Sarai Tareen, Sambhal</div>
<div class="wrap bar"><button class="ibtn menu-btn" id="menuBtn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="menuPanel">${I.menu}</button>
<a class="logo" href="/" aria-label="SHRI JI COLLECTION home">${logoHtml(logo)}</a>
<form class="hsearch" action="/shop" method="get" role="search"><input type="search" name="q" placeholder="Search poshak, kurti, mukut…" aria-label="Search products" enterkeyhint="search"><button type="submit" aria-label="Search">${I.search}</button></form>
<nav class="actions" aria-label="Account and cart"><a class="ibtn sbtn" href="/shop" aria-label="Search">${I.search}</a><a class="ibtn" href="/account" aria-label="My account">${I.user}</a><a class="ibtn cartbtn" href="/cart" aria-label="Cart">${I.bag}<span class="cnt" id="cartCount" hidden>0</span></a></nav></div>
<nav class="dnav" aria-label="Categories"><div class="wrap dnav-in"><a href="/shop">All products</a>${dd}<a href="/#contact">Contact</a></div></nav>
<div class="drawer-bg" id="drawerBg" hidden></div>
<aside class="drawer" id="menuPanel" hidden aria-label="Menu"><div class="drawer-h"><b>Menu</b><button class="ibtn dark" id="menuClose" type="button" aria-label="Close menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
<form action="/shop" method="get" class="msearch" role="search"><input type="search" name="q" placeholder="Search products…" aria-label="Search products" enterkeyhint="search"><button class="btn primary" type="submit">Go</button></form>
<div class="mn">${drawerGroups}</div><div class="mn-links"><a href="/shop">All products</a><a href="/account">My account &amp; orders</a><a href="/cart">Cart</a><a href="/#contact">Contact</a></div></aside>`;
}

export function footerHtml(categories = CATEGORIES) {
  const list = Array.isArray(categories) && categories.length ? categories.filter(c => c && c.slug && c.name && !c.is_legacy) : CATEGORIES;
  const featured = list.filter(c => c.group === "thakur-ji-poshak").slice(0, 3);
  const ladies = list.filter(c => c.group === "ladies-wear").slice(0, 2);
  return `<div class="wrap fgrid"><div><div class="logo flogo"><span>SHRI JI</span><small>COLLECTION</small></div><p class="sm">Thakur Ji Poshak, Shringar &amp; Ladies Wear.<br>तीर्थ मंदिर, सराय तरीन (संभल) – 244303</p></div>
<div><b>Shop</b>${[...featured, ...ladies].map(c => `<a href="/category/${encodeURIComponent(c.slug)}">${esc(c.name)}</a>`).join("")}<a href="/shop">All products</a></div>
<div><b>Help</b><a href="/account">My orders</a><a href="/cart">Cart</a><a href="https://wa.me/919927892667" rel="noopener" target="_blank">WhatsApp</a><a href="tel:+919927892667">9927892667</a><a href="tel:+919758673114">9758673114</a></div></div>
<div class="wrap copy">© SHRI JI COLLECTION</div>`;
}
