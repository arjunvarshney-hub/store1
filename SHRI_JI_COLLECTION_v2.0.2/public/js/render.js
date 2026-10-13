// Pure rendering helpers shared by the server (SSR pages) and the browser.
import { GROUPS, CATEGORIES, catName } from "./categories.js";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
export const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const effPrice = (p) => {
  const sp = Number(p.sale_price), pr = Number(p.price);
  return sp > 0 && sp < pr ? sp : pr;
};
export const onSale = (p) => effPrice(p) < Number(p.price);
const anySale = (p) => onSale(p) || (Array.isArray(p.variants) && p.variants.some(onSale));
/** What a customer can really buy. Stock is counted in single pieces; a pack of 3 uses 3 pieces. */
export function availability(p) {
  const vars = Array.isArray(p.variants) ? p.variants : [];
  if (vars.length) {
    const ok = vars.filter((v) => v.available && Number(v.stock) >= Math.max(1, Number(v.pack_qty) || 1));
    const packs = ok.reduce((m, v) => Math.max(m, Math.floor(Number(v.stock) / (Number(v.pack_qty) || 1))), 0);
    const prices = (ok.length ? ok : vars).map(effPrice);
    const from = Math.min(...prices), to = Math.max(...prices);
    return { inStock: ok.length > 0, packs, from, to, hasRange: from !== to, variant: true };
  }
  const pack = Math.max(1, Number(p.pack_size) || 1), min = Math.max(1, Number(p.min_order_qty) || 1);
  const packs = Math.floor(Number(p.stock) / pack);
  return { inStock: packs >= min, packs, from: effPrice(p), to: effPrice(p), hasRange: false, variant: false };
}
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
  const av = availability(p), off = av.variant ? 0 : pctOff(p), sale = anySale(p);
  const count = Math.max(0, Number(p.review_count || 0));
  const average = p.average_rating == null ? NaN : Number(p.average_rating);
  const shown = count > 0 && Number.isFinite(average);
  const rating = shown   // a rating line is shown ONLY when real approved reviews exist
    ? `<div class="rating-mini"><span class="stars" role="img" aria-label="${average.toFixed(1)} out of 5 stars">${"★".repeat(Math.max(0, Math.min(5, Math.round(average))))}${"☆".repeat(5 - Math.max(0, Math.min(5, Math.round(average))))}</span><span>${average.toFixed(1)} · ${count} ${count === 1 ? "review" : "reviews"}</span></div>` : "";
  const minq = Number(p.min_order_qty) > 1 ? `<div class="muted sm">Minimum order: ${Number(p.min_order_qty)}</div>` : "";
  return `<article class="card"><a class="card-img" href="${href}" aria-label="${esc(p.name)}">${imgTag(p.image_urls?.[0], `${p.name} - ${catName(p.category)}`)}${
    !av.inStock ? '<span class="tag tag-out">Sold out</span>' : off ? `<span class="tag">${off}% OFF</span>` : sale ? '<span class="tag">SALE</span>' : ""
  }</a><div class="card-body"><a class="card-title" href="${href}">${esc(p.name)}</a><div class="price">${av.hasRange ? '<span class="muted sm">From</span> ' : ""}<b>${money(av.from)}</b>${
    !av.variant && onSale(p) ? ` <s>${money(p.price)}</s>` : ""
  }</div>${rating}<div class="muted sm">${esc(catName(p.category))}</div>${minq}</div></article>`;
}

/** Large picture tile for a category (home page: Thakur Ji categories). */
export function catTileHtml(c, img, n) {
  return `<a class="cat-tile" href="/category/${esc(c.slug)}"><span class="cat-img">${imgTag(img, c.name, { w: 400, h: 500 })}</span><span class="cat-name">${esc(c.name)}</span>${n ? `<span class="muted sm">${n} item${n === 1 ? "" : "s"}</span>` : ""}</a>`;
}

const I = {
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
};

export const logoHtml = (logo) =>
  safeUrl(logo) ? `<img class="logo-img" src="${esc(safeUrl(logo))}" alt="SHRI JI COLLECTION" height="48">` : "<span>SHRI JI</span><small>COLLECTION</small>";

export function headerHtml({ logo } = {}) {
  const grpLinks = (g) => CATEGORIES.filter((c) => c.group === g.slug).map((c) => `<a href="/category/${c.slug}">${esc(c.name)}</a>`).join("");
  const drawerGroups = GROUPS.map((g) => `<div class="mn-group"><a class="mn-head" href="/category/${g.slug}">${esc(g.name)}</a>${grpLinks(g)}</div>`).join("");
  const dd = GROUPS.map((g) => `<div class="dd"><a class="dd-t" href="/category/${g.slug}">${esc(g.name)} <span aria-hidden="true">▾</span></a><div class="dd-panel"><a class="all" href="/category/${g.slug}">All ${esc(g.name)}</a>${grpLinks(g)}</div></div>`).join("");
  return `<div class="strip">Free delivery on orders of ₹1,000 and above &bull; Cash on Delivery &bull; UPI &amp; Cards</div>
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

export function footerHtml() {
  const list = (g, n) => CATEGORIES.filter((c) => c.group === g).slice(0, n).map((c) => `<a href="/category/${c.slug}">${esc(c.name)}</a>`).join("");
  return `<div class="wrap fgrid"><div><div class="logo flogo"><span>SHRI JI</span><small>COLLECTION</small></div><p class="sm">Thakur Ji Poshak, Shringar &amp; Ladies Wear.<br>तीर्थ मंदिर, सराय तरीन (संभल) – 244303</p></div>
<div><b>Thakur Ji Poshak</b>${list("thakur-ji-poshak", 6)}<a href="/category/thakur-ji-poshak">All Thakur Ji Poshak</a></div>
<div><b>Ladies Wear</b>${list("ladies-wear", 4)}<a href="/shop">All products</a></div>
<div><b>Help</b><a href="/account">My orders</a><a href="/cart">Cart</a><a href="https://wa.me/919927892667" rel="noopener" target="_blank">WhatsApp</a><a href="tel:+919927892667">9927892667</a><a href="tel:+919758673114">9758673114</a></div></div>
<div class="wrap copy">© SHRI JI COLLECTION</div>`;
}
