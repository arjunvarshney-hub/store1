import { esc, headerHtml, footerHtml, cardHtml, catTileHtml, imgTag, money, effPrice, onSale, pctOff, safeUrl, availability } from "../public/js/render.js";
import { sanitizeHtml } from "./_html.js";
import { DELIVERY_TIERS } from "../public/js/delivery.js";
import { GROUPS, CATEGORIES, catName, bySlug, groupBySlug } from "../public/js/categories.js";

export const BRAND = "SHRI JI COLLECTION";
export const BUSINESS = {
  phones: ["+919927892667", "+919758673114"],
  address: { streetAddress: "तीर्थ मंदिर, सराय तरीन", addressLocality: "Sambhal", addressRegion: "Uttar Pradesh", postalCode: "244303", addressCountry: "IN" },
};
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

export function shell({ title, desc, canonical, robots = "index,follow", body, jsonld = [], image, ogType = "website", settings = {} }) {
  const img = safeUrl(image);
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="robots" content="${robots}"><meta name="theme-color" content="#5c1220">
<link rel="canonical" href="${esc(canonical)}"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:site_name" content="${BRAND}"><meta property="og:type" content="${ogType}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}">${img ? `<meta property="og:image" content="${esc(img)}">` : ""}
<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">
<link rel="stylesheet" href="/style.css">${jsonld.map(ld).join("")}</head><body>
<header class="top" id="hdr">${headerHtml({ logo: settings.logo_url })}</header><main id="main">${body}</main><footer class="foot" id="ftr">${footerHtml()}</footer>
<script type="module" src="/js/common.js"></script>${settings.chat_enabled === "0" ? "" : '<script type="module" src="/js/chat.js"></script>'}</body></html>`;
}

const crumbs = (site, list) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: list.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: site + path })),
});
const pager = (base, page, total, size) => {
  const pages = Math.ceil(total / size);
  if (pages <= 1) return "";
  const sep = base.includes("?") ? "&" : "?";
  return `<nav class="pager" aria-label="Pages">${page > 1 ? `<a class="btn outline" rel="prev" href="${esc(base + sep + "page=" + (page - 1))}">Previous</a>` : "<span></span>"}<span class="sm muted">Page ${page} of ${pages}</span>${page < pages ? `<a class="btn outline" rel="next" href="${esc(base + sep + "page=" + (page + 1))}">Next</a>` : "<span></span>"}</nav>`;
};

export function homePage(site, { products = [], thakur = [], ladies = [], catImages = {}, catCounts = {}, settings = {} }) {
  const heroArt = safeUrl(settings.hero_url) ? `<div class="hero-art has-img"><img src="${esc(settings.hero_url)}" alt="${BRAND}" width="800" height="600" fetchpriority="high"></div>` : `<div class="hero-art" aria-hidden="true"><div class="ring"><span>SJC</span></div><small>SHRI JI COLLECTION</small></div>`;
  const tCats = CATEGORIES.filter((c) => c.group === "thakur-ji-poshak"), lCats = CATEGORIES.filter((c) => c.group === "ladies-wear");
  const fresh = thakur.length ? thakur : products;      // (older callers pass only `products`)
  const grid = (list) => `<div class="grid">${list.map(cardHtml).join("")}</div>`;
  const body = `<section class="hero"><div class="wrap hero-in"><div class="hero-txt"><p class="eyebrow">Sarai Tareen, Sambhal</p><h1>Thakur Ji Poshak &amp; Shringar</h1><p class="lead">Laddu Gopal, Krishna and Devi poshak, mukut, mala, bansuri, jhula and more for your Thakur Ji.</p><div class="cta"><a class="btn primary lg" href="/category/thakur-ji-poshak">Shop Thakur Ji Poshak</a><a class="btn outline lg" href="/category/laddu-gopal-poshak">Laddu Gopal Poshak</a></div><a class="textlink" href="/category/ladies-wear">Also see Ladies Wear &rarr;</a></div>${heroArt}</div></section>
<section class="wrap sec" id="thakur"><div class="sec-title"><p class="eyebrow dark">Our main collection</p><h2 class="h2">Thakur Ji Poshak &amp; Shringar</h2></div><div class="cat-tiles">${(tCats.some((c) => catCounts[c.slug]) ? tCats.filter((c) => catCounts[c.slug]) : tCats).map((c) => catTileHtml(c, catImages[c.slug], catCounts[c.slug])).join("")}</div></section>
<section class="wrap sec"><div class="sec-title"><p class="eyebrow dark">Just in</p><h2 class="h2">New for Thakur Ji</h2></div>${fresh.length ? `${grid(fresh)}<div class="center more-wrap"><a class="btn outline" href="/category/thakur-ji-poshak">View all Thakur Ji Poshak</a></div>` : '<p class="muted center">New products are coming soon. Please check back shortly or message us on WhatsApp.</p>'}</section>
<section class="band"><div class="wrap trust"><div><b>Free delivery from ₹1,000</b><span>₹50 below ₹499 &middot; ₹40 for ₹499 to ₹999.99</span></div><div><b>Cash on Delivery</b><span>Pay when your order arrives</span></div><div><b>UPI / Cards</b><span>Secure online payment via Razorpay</span></div><div><b>Track orders</b><span>See status in My Orders</span></div></div></section>
${lCats.length ? `<section class="wrap sec ladies"><div class="sec-title"><p class="eyebrow dark">Also at SHRI JI</p><h2 class="h2">Ladies Wear</h2></div><div class="chips center">${lCats.map((c) => `<a class="chip" href="/category/${c.slug}">${esc(c.name)}</a>`).join("")}</div>${ladies.length ? `${grid(ladies)}<div class="center more-wrap"><a class="btn outline" href="/category/ladies-wear">View all Ladies Wear</a></div>` : ""}</section>` : ""}
<section class="wrap sec" id="contact"><div class="sec-title"><p class="eyebrow dark">Visit or say hello</p><h2 class="h2">Contact us</h2></div><address class="contact center"><b>${BRAND}</b><br>तीर्थ मंदिर, सराय तरीन (संभल) – 244303<br><a href="tel:+919927892667">9927892667</a> &middot; <a href="tel:+919758673114">9758673114</a></address><div class="center"><a class="btn primary" href="https://wa.me/919927892667" target="_blank" rel="noopener">Chat on WhatsApp</a></div></section>`;
  return shell({
    settings,
    title: `${BRAND} | Thakur Ji Poshak, Shringar & Ladies Wear, Sarai Tareen Sambhal`,
    desc: "SHRI JI COLLECTION, Sarai Tareen (Sambhal): Laddu Gopal poshak, Krishna poshak, Devi poshak, mukut, mala, necklace and Thakur Ji shringar; also kurti, suit, dupatta and plazo. COD and online payment.",
    canonical: site + "/", body,
    jsonld: [
      { "@context": "https://schema.org", "@type": "WebSite", name: BRAND, url: site + "/", potentialAction: { "@type": "SearchAction", target: `${site}/shop?q={search_term_string}`, "query-input": "required name=search_term_string" } },
      { "@context": "https://schema.org", "@type": "ClothingStore", name: BRAND, url: site + "/", telephone: BUSINESS.phones, address: { "@type": "PostalAddress", ...BUSINESS.address }, areaServed: "IN" },
    ],
  });
}

export function listingPage(site, { products, total, page, pageSize, category, group, q, sort, settings = {} }) {
  const cat = category && bySlug[category], grp = group && groupBySlug[group];
  const name = cat ? cat.name : grp ? grp.name : q ? `Search: ${q}` : "All products";
  const basePath = cat ? `/category/${cat.slug}` : grp ? `/category/${grp.slug}` : "/shop";
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (sort && sort !== "new") params.set("sort", sort);
  const base = basePath + (params.toString() ? "?" + params : "");
  const chips = CATEGORIES.map((c) => `<a class="chip${c.slug === category ? " on" : ""}" href="/category/${c.slug}">${esc(c.name)}</a>`).join("");
  const body = `<div class="wrap sec"><nav class="crumb" aria-label="Breadcrumb"><a href="/">Home</a> / ${cat ? `<a href="/category/${cat.group}">${esc(groupBySlug[cat.group].name)}</a> / ` : ""}<span>${esc(name)}</span></nav>
<h1 class="h1">${esc(name)}</h1>
<form class="filters" action="${esc(basePath)}" method="get" role="search"><input type="search" name="q" value="${esc(q || "")}" placeholder="Search in ${esc(cat ? cat.name : "all products")}" aria-label="Search products" enterkeyhint="search"><select name="sort" aria-label="Sort"><option value="new"${sort === "new" || !sort ? " selected" : ""}>Newest</option><option value="price_asc"${sort === "price_asc" ? " selected" : ""}>Price: low to high</option><option value="price_desc"${sort === "price_desc" ? " selected" : ""}>Price: high to low</option></select><button class="btn primary" type="submit">Go</button></form>
<div class="chips" aria-label="Categories">${chips}</div>
${products.length ? `<div class="grid">${products.map(cardHtml).join("")}</div>${pager(base, page, total, pageSize)}` : `<p class="empty">No products found${q ? ` for “${esc(q)}”` : " here yet"}. <a href="/shop">See all products</a></p>`}
${cat || grp ? `<p class="seo muted sm">Buy ${esc(name)} online from ${BRAND}, Sarai Tareen, Sambhal. Cash on Delivery and online payment available.</p>` : ""}</div>`;
  const list = [["Home", "/"], ...(cat ? [[groupBySlug[cat.group].name, "/category/" + cat.group]] : []), [name, basePath]];
  return shell({
    settings,
    title: cat || grp ? `${name} Online | ${BRAND}, Sarai Tareen Sambhal` : q ? `Search results for “${q}” | ${BRAND}` : `Shop all Thakur Ji Poshak & Ladies Wear | ${BRAND}`,
    desc: cat || grp ? `Shop ${name} at ${BRAND}, Sarai Tareen, Sambhal. Cash on Delivery and UPI / card payment. Order online.` : `Browse all products at ${BRAND}: Thakur Ji Poshak, shringar and ladies wear.`,
    canonical: site + basePath + (page > 1 ? `?page=${page}` : ""),
    robots: q || sort && sort !== "new" ? "noindex,follow" : "index,follow",
    body, jsonld: [crumbs(site, list)],
    image: products[0]?.image_urls?.[0],
  });
}

const starsHtml = (rating) => {
  const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `<span class="stars" role="img" aria-label="${n} out of 5 stars">${"★".repeat(n)}${"☆".repeat(5 - n)}</span>`;
};

function reviewSection(data = {}) {
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  const summary = data.summary || { count: 0, average: null };
  const count = Math.max(0, Number(summary.count || 0));
  const average = summary.average == null ? null : Number(summary.average);
  const intro = !data.configured
    ? "Customer ratings and reviews are not available right now. Please check back soon."
    : count > 0
      ? `${count} customer ${count === 1 ? "review" : "reviews"} · written by customers, not purchase-verified`
      : "No reviews yet. Be the first to share your experience.";
  const cards = reviews.map((r) => {
    const date = r.created_at && Number.isFinite(Date.parse(r.created_at))
      ? new Date(r.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "";
    return `<article class="review-card"><div class="review-head"><b>${esc(r.customer_name)}</b><time class="muted sm"${date ? ` datetime="${esc(new Date(r.created_at).toISOString())}"` : ""}>${esc(date)}</time></div><div class="review-rating">${starsHtml(r.rating)} <span class="sm">${Number(r.rating)}/5</span></div><p>${esc(r.comment).replace(/\n/g, "<br>")}</p></article>`;
  }).join("");
  const form = data.configured ? `<form id="reviewForm" class="review-form" novalidate>
    <h3>Write a review</h3><p class="sm muted">Tell other customers about your experience. Reviews are checked by our shop before appearing publicly. They are written by customers and are not purchase-verified.</p>
    <label class="f">Your name *<input name="name" autocomplete="name" maxlength="80" minlength="2" required placeholder="Enter your name"></label>
    <fieldset class="rating-field"><legend>Your rating *</legend><div class="rating-pick">${[1,2,3,4,5].map((n) => `<label><input type="radio" name="rating" value="${n}" required><span aria-hidden="true">★</span><span class="sr-only">${n} ${n === 1 ? "star" : "stars"}</span></label>`).join("")}</div></fieldset>
    <label class="f">Your review *<textarea name="comment" required minlength="5" maxlength="1000" placeholder="What did you like or what could be better? (5–1,000 characters)"></textarea></label>
    <div class="review-trap" aria-hidden="true"><label>Leave this field empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
    <div id="reviewMsg" aria-live="polite"></div><button class="btn primary" id="reviewSubmit" type="submit">Submit review</button>
  </form>` : `<div class="note" role="status">Ratings and reviews are temporarily unavailable. Please check back soon.</div>`;
  return `<section class="reviews-sec" id="reviews" aria-labelledby="reviewsTitle"><div class="reviews-title"><div><p class="eyebrow dark">Customer feedback</p><h2 class="h2" id="reviewsTitle">Ratings &amp; reviews</h2></div>${count > 0 && average !== null ? `<div class="rating-total">${starsHtml(average)} <b>${average.toFixed(1)}/5</b><span class="sm muted">${count} ${count === 1 ? "review" : "reviews"}</span></div>` : ""}</div><p class="muted sm">${esc(intro)}</p><div class="review-list">${cards || (data.configured ? '<p class="empty">No approved reviews to show yet.</p>' : "")}</div>${form}</section>`;
}

const nl2br = (t) => esc(t).replace(/\n/g, "<br>");
export const descriptionHtml = (p) => (p.description_html ? sanitizeHtml(p.description_html) : p.description ? `<p>${nl2br(p.description)}</p>` : "");

/** Return policy comes ONLY from what the shop owner entered for this product. Nothing is invented. */
export function returnBlock(p) {
  if (p.return_eligible === true) {
    const days = Number(p.return_days) || 0;
    return `<section class="ret ok" aria-label="Return policy"><b>Returnable${days ? ` within ${days} day${days === 1 ? "" : "s"} of delivery` : ""}</b>${p.return_conditions ? `<p class="sm"><i>Conditions:</i> ${nl2br(p.return_conditions)}</p>` : ""}${p.return_instructions ? `<p class="sm"><i>How to return:</i> ${nl2br(p.return_instructions)}</p>` : ""}${p.refund_policy ? `<p class="sm"><i>Refund:</i> ${nl2br(p.refund_policy)}</p>` : ""}</section>`;
  }
  if (p.return_eligible === false) {
    return `<section class="ret no" aria-label="Return policy"><b>Non-Returnable</b><p class="sm">This product cannot be returned or exchanged. If you receive a damaged, defective or wrong item, please contact us at once: your legal rights as a consumer are not affected.</p>${p.refund_policy ? `<p class="sm">${nl2br(p.refund_policy)}</p>` : ""}</section>`;
  }
  return "";
}
/** Specification table: owner-defined rows plus basic facts. Rows with no value are hidden. */
export function specRows(p) {
  const cat = bySlug[p.category];
  const rows = [["Category", cat ? `<a href="/category/${cat.slug}">${esc(cat.name)}</a>` : ""], ["Brand", esc(p.brand)], ["Material", esc(p.material)], ["SKU", esc(p.sku)],
    ["Sizes", (p.sizes || []).length ? esc(p.sizes.join(", ")) : ""], ["Pack size", Number(p.pack_size) > 1 ? `${Number(p.pack_size)} pieces per pack` : ""], ["Weight", p.weight_g ? `${Number(p.weight_g)} g` : ""], ["Dimensions", esc(p.dimensions)]];
  for (const r of Array.isArray(p.specs) ? p.specs : []) if (r?.label && String(r.value || "").trim()) rows.push([esc(r.label), esc(r.value)]);
  const shown = rows.filter(([, v]) => v);
  return shown.length ? `<section class="specs" aria-labelledby="specTitle"><h2 id="specTitle">Specifications</h2><table><tbody>${shown.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join("")}</tbody></table></section>` : "";
}

export function productPage(site, p, related, settings = {}, reviewData = { configured: false, reviews: [], summary: null }) {
  const cat = bySlug[p.category];
  const url = `${site}/product/${p.slug}`;
  const imgs = (p.image_urls || []).filter(safeUrl);
  const av = availability(p), soldOut = !av.inStock;
  const vars = (Array.isArray(p.variants) ? p.variants : []).filter((v) => v && v.id);
  const sizes = vars.length ? [] : p.sizes || [];
  const axes = (p.variant_axes || []).filter((a) => vars.some((v) => v.options?.[a]));
  const minQ = Math.max(1, Number(p.min_order_qty) || 1);
  const summary = reviewData.summary || { count: Number(p.review_count || 0), average: p.average_rating ?? null };
  const reviewCount = Math.max(0, Number(summary.count || 0));
  const avg = summary.average == null ? null : Number(summary.average);
  const ratingLine = reviewData.configured && reviewCount > 0 && avg !== null
    ? `<div class="product-rating">${starsHtml(avg)} <b>${avg.toFixed(1)}</b><span class="muted sm">(${reviewCount} ${reviewCount === 1 ? "review" : "reviews"})</span><a href="#reviews">Read reviews</a></div>`
    : reviewData.configured ? `<div class="product-rating"><a href="#reviews">Be the first to review</a></div>` : "";
  const pub = vars.map((v) => ({ id: v.id, sku: v.sku, label: v.label, options: v.options || {}, price: Number(v.price), sale_price: v.sale_price == null ? null : Number(v.sale_price), stock: Number(v.stock), pack_qty: Number(v.pack_qty) || 1, available: !!v.available }));
  const gallery = `<div class="gal" id="gal" data-n="${imgs.length}"><div class="gal-track" id="galTrack" tabindex="0" aria-label="Product photos. Swipe left or right to see more.">${imgs.length ? imgs.map((u, i) => `<div class="gal-slide"><button type="button" class="gal-zoom" data-i="${i}" aria-label="Zoom photo ${i + 1} of ${imgs.length}">${imgTag(u, `${p.name} - photo ${i + 1}`, { eager: i === 0, w: 800, h: 1000 })}</button></div>`).join("") : `<div class="gal-slide">${imgTag("", p.name)}</div>`}</div>${imgs.length > 1 ? `<div class="gal-count" id="galCount" aria-live="polite">1 / ${imgs.length}</div><div class="gal-th" role="list">${imgs.map((u, i) => `<button type="button" class="th${i ? "" : " on"}" role="listitem" data-i="${i}" aria-label="Show photo ${i + 1}">${imgTag(u, `${p.name} thumbnail ${i + 1}`, { w: 80, h: 80 })}</button>`).join("")}</div>` : ""}</div>
<div class="lightbox" id="lightbox" hidden role="dialog" aria-modal="true" aria-label="Zoomed photo"><button type="button" class="lb-x" id="lbX" aria-label="Close zoom">&times;</button><div class="lb-scroll" id="lbScroll"><img id="lbImg" alt=""></div>${imgs.length > 1 ? '<button type="button" class="lb-nav prev" id="lbPrev" aria-label="Previous photo">&#8249;</button><button type="button" class="lb-nav next" id="lbNext" aria-label="Next photo">&#8250;</button>' : ""}<div class="gal-count lb-count" id="lbCount"></div><p class="lb-hint">Tap the photo to zoom in or out</p></div>`;
  const priceHtml = `<div class="price big" id="priceBox">${av.hasRange ? '<span class="muted sm">From</span> ' : ""}<b>${money(av.from)}</b>${!vars.length && onSale(p) ? ` <s>${money(p.price)}</s> <span class="off">${pctOff(p)}% off</span>` : ""}</div>`;
  const body = `<div class="wrap sec"><nav class="crumb" aria-label="Breadcrumb"><a href="/">Home</a> / ${cat ? `<a href="/category/${cat.slug}">${esc(cat.name)}</a> / ` : ""}<span>${esc(p.name)}</span></nav>
<div class="pdp" id="pdp" data-id="${p.id}" data-name="${esc(p.name)}" data-min="${minQ}" data-pack="${Math.max(1, Number(p.pack_size) || 1)}" data-stock="${Number(p.stock) || 0}" data-axes="${esc(JSON.stringify(axes))}" data-variants="${esc(JSON.stringify(pub))}">${gallery}
<div class="pdp-info"><h1 class="h1">${esc(p.name)}</h1>${p.short_description ? `<p class="short">${esc(p.short_description)}</p>` : ""}${ratingLine}
${priceHtml}
<p class="sm muted" id="deliveryNote">Delivery: ₹${DELIVERY_TIERS[0].fee} below ₹${DELIVERY_TIERS[1].min}; ₹${DELIVERY_TIERS[1].fee} from ₹${DELIVERY_TIERS[1].min} to ₹${DELIVERY_TIERS[2].min - 0.01}; <b>FREE from ₹${DELIVERY_TIERS[2].min.toLocaleString("en-IN")}</b> (on the order subtotal).</p>
${axes.length ? `<div class="opts" id="opts" aria-label="Choose options"></div><p class="sm warn" id="optMsg" role="status"></p>` : ""}
${sizes.length ? `<fieldset class="sizes"><legend>Select size</legend>${sizes.map((s) => `<label class="sz"><input type="radio" name="size" value="${esc(s)}"><span>${esc(s)}</span></label>`).join("")}</fieldset>` : ""}
${soldOut ? '<p class="soldout">This product is currently sold out.</p>' : `<p class="sm" id="packInfo"></p>${minQ > 1 ? `<p class="sm"><b>Minimum order: ${minQ}</b></p>` : ""}<div class="qtyrow"><span>Quantity</span><div class="qty"><button type="button" id="qMinus" aria-label="Decrease">−</button><output id="qVal">${minQ}</output><button type="button" id="qPlus" aria-label="Increase">+</button></div></div>
<div class="buy"><button class="btn primary lg" id="addBtn" type="button">Add to cart</button><a class="btn outline lg" href="/cart" id="goCart" hidden>View cart</a></div><p id="pdpMsg" class="sm" role="status" aria-live="polite"></p><p class="sm warn" id="stockNote"></p>`}
${returnBlock(p)}
${descriptionHtml(p) ? `<div class="desc rich"><h2>Details</h2>${descriptionHtml(p)}</div>` : ""}
${specRows(p)}
<p class="sm muted">Questions? <a href="https://wa.me/919927892667" target="_blank" rel="noopener">WhatsApp us</a> or call <a href="tel:+919927892667">9927892667</a>.</p></div></div>
${reviewSection(reviewData)}
${related.length ? `<section class="sec"><h2 class="h2">You may also like</h2><div class="grid">${related.map(cardHtml).join("")}</div></section>` : ""}</div>
<script type="module" src="/js/product.js"></script>`;
  const plain = (p.description || p.short_description || "").replace(/\s+/g, " ");
  const title = `${p.name} - Buy Online | ${BRAND}`;
  const desc = (plain ? plain.slice(0, 140) + " - " : "") + `${catName(p.category)} at ${BRAND}, Sarai Tareen Sambhal. ${money(av.from)}.`;
  const offer = av.hasRange
    ? { "@type": "AggregateOffer", url, priceCurrency: "INR", lowPrice: av.from.toFixed(2), highPrice: av.to.toFixed(2), offerCount: vars.length, availability: soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", seller: { "@type": "Organization", name: BRAND } }
    : { "@type": "Offer", url, priceCurrency: "INR", price: av.from.toFixed(2), availability: soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition", seller: { "@type": "Organization", name: BRAND } };
  const productJsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: p.name, sku: String(p.sku || p.id), category: catName(p.category), ...(imgs.length ? { image: imgs } : {}), ...(plain ? { description: plain.slice(0, 500) } : {}), ...(p.material ? { material: p.material } : {}), brand: { "@type": "Brand", name: p.brand || BRAND },
    offers: offer,
    ...(reviewData.configured && reviewCount > 0 && avg !== null ? {
      aggregateRating: { "@type": "AggregateRating", ratingValue: avg.toFixed(1), reviewCount: String(reviewCount), bestRating: "5", worstRating: "1" },
      review: reviewData.reviews.map((r) => ({ "@type": "Review", author: { "@type": "Person", name: r.customer_name }, reviewRating: { "@type": "Rating", ratingValue: Number(r.rating), bestRating: "5", worstRating: "1" }, reviewBody: r.comment, ...(Number.isFinite(Date.parse(r.created_at || "")) ? { datePublished: new Date(r.created_at).toISOString().slice(0, 10) } : {}) })),
    } : {}),
  };
  return shell({
    settings, title, desc: desc.slice(0, 160), canonical: url, body, image: imgs[0], ogType: "product",
    jsonld: [productJsonLd,
      crumbs(site, [["Home", "/"], ...(cat ? [[cat.name, "/category/" + cat.slug]] : []), [p.name, "/product/" + p.slug]]),
    ],
  });
}

export function notFoundPage(site, what = "Page", settings = {}) {
  return shell({ settings, title: `${what} not found | ${BRAND}`, desc: `${what} not found.`, canonical: site + "/", robots: "noindex,follow",
    body: `<div class="wrap sec center"><h1 class="h1">${esc(what)} not found</h1><p class="muted">It may have been removed or is no longer available.</p><a class="btn primary" href="/shop">Browse all products</a></div>` });
}
