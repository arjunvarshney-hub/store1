import { esc, headerHtml, footerHtml, cardHtml, imgTag, money, effPrice, onSale, pctOff, safeUrl } from "../public/js/render.js";
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
<script type="module" src="/js/common.js"></script></body></html>`;
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

export function homePage(site, { products, settings = {} }) {
  const heroArt = safeUrl(settings.hero_url) ? `<div class="hero-art has-img"><img src="${esc(settings.hero_url)}" alt="${BRAND}" width="800" height="600" fetchpriority="high"></div>` : `<div class="hero-art" aria-hidden="true"><div class="ring"><span>SJC</span></div><small>SHRI JI COLLECTION</small></div>`;
  const departmentCards = GROUPS.map((group) => {
    const categoryProducts = products.filter((p) => groupBySlug[bySlug[p.category]?.group]?.slug === group.slug);
    const imageProduct = categoryProducts.find((p) => Array.isArray(p.image_urls) && p.image_urls.some(safeUrl));
    const art = imageProduct
      ? `<div class="department-art">${imgTag(imageProduct.image_urls.find(safeUrl), `${group.name} collection`, { w: 640, h: 480 })}</div>`
      : `<div class="department-art department-art-empty" aria-hidden="true"><span>${group.slug === "thakur-ji-poshak" ? "श्री" : "SJC"}</span><small>${group.slug === "thakur-ji-poshak" ? "POSHAK & SHRINGAR" : "LADIES COLLECTION"}</small></div>`;
    return `<a class="department-card department-${group.slug}" href="/category/${group.slug}">${art}<div class="department-copy"><p class="eyebrow dark">Explore collection</p><h3>${esc(group.name)}</h3><span class="department-link">Shop collection <b aria-hidden="true">→</b></span></div></a>`;
  }).join("");
  const body = `<section class="hero"><div class="wrap hero-in"><div class="hero-txt"><p class="eyebrow">Sarai Tareen, Sambhal</p><h1>Thakur Ji Poshak &amp; Ladies Wear</h1><div class="cta"><a class="btn primary lg" href="/category/thakur-ji-poshak">Shop Thakur Ji Poshak</a><a class="btn outline lg" href="/category/ladies-wear">Explore Ladies Wear</a></div></div>${heroArt}</div></section>
<nav class="catstrip" aria-label="Browse categories"><div class="wrap"><div class="chips">${CATEGORIES.map((c) => `<a class="chip" href="/category/${c.slug}">${esc(c.name)}</a>`).join("")}</div></div></nav>
<section class="wrap department-sec" aria-labelledby="departmentsTitle"><div class="department-head"><div><p class="eyebrow dark">Made for your search</p><h2 class="h2" id="departmentsTitle">Shop by collection</h2></div><p class="muted">Explore devotional poshak and shringar, or find your next favourite style.</p></div><div class="department-grid">${departmentCards}</div></section>
<section class="wrap sec"><div class="sec-title"><p class="eyebrow dark">Just in</p><h2 class="h2">New arrivals</h2></div>${products.length ? `<div class="grid">${products.map(cardHtml).join("")}</div><div class="center more-wrap"><a class="btn outline" href="/shop">View all products</a></div>` : '<p class="muted center">New products are coming soon. Please check back shortly or message us on WhatsApp.</p>'}</section>
<section class="band"><div class="wrap trust"><div><b>Cash on Delivery</b><span>Pay when your order arrives</span></div><div><b>UPI / Cards</b><span>Secure online payment via Razorpay</span></div><div><b>Track orders</b><span>See status in My Orders</span></div></div></section>
<section class="wrap sec" id="contact"><div class="sec-title"><p class="eyebrow dark">Visit or say hello</p><h2 class="h2">Contact us</h2></div><address class="contact center"><b>${BRAND}</b><br>तीर्थ मंदिर, सराय तरीन (संभल) – 244303<br><a href="tel:+919927892667">9927892667</a> &middot; <a href="tel:+919758673114">9758673114</a></address><div class="center"><a class="btn primary" href="https://wa.me/919927892667" target="_blank" rel="noopener">Chat on WhatsApp</a></div></section>`;
  return shell({
    settings,
    title: `${BRAND} | Thakur Ji Poshak & Ladies Wear, Sarai Tareen Sambhal`,
    desc: "SHRI JI COLLECTION, Sarai Tareen (Sambhal): Laddu Gopal poshak, Krishna poshak, mukut, mala, shringar and ladies wear - kurti, suit, dupatta. COD and online payment.",
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
      ? `${count} customer ${count === 1 ? "review" : "reviews"}`
      : "No reviews yet. Be the first to share your experience.";
  const cards = reviews.map((r) => {
    const date = r.created_at && Number.isFinite(Date.parse(r.created_at))
      ? new Date(r.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "";
    return `<article class="review-card"><div class="review-head"><b>${esc(r.customer_name)}</b><time class="muted sm"${date ? ` datetime="${esc(new Date(r.created_at).toISOString())}"` : ""}>${esc(date)}</time></div><div class="review-rating">${starsHtml(r.rating)} <span class="sm">${Number(r.rating)}/5</span></div><p>${esc(r.comment).replace(/\n/g, "<br>")}</p></article>`;
  }).join("");
  const form = data.configured ? `<form id="reviewForm" class="review-form" novalidate>
    <h3>Write a review</h3><p class="sm muted">Tell other customers about your experience. Reviews are checked by our shop before appearing publicly.</p>
    <label class="f">Your name *<input name="name" autocomplete="name" maxlength="80" minlength="2" required placeholder="Enter your name"></label>
    <fieldset class="rating-field"><legend>Your rating *</legend><div class="rating-pick">${[1,2,3,4,5].map((n) => `<label><input type="radio" name="rating" value="${n}" required><span aria-hidden="true">★</span><span class="sr-only">${n} ${n === 1 ? "star" : "stars"}</span></label>`).join("")}</div></fieldset>
    <label class="f">Your review *<textarea name="comment" required minlength="5" maxlength="1000" placeholder="What did you like or what could be better? (5–1,000 characters)"></textarea></label>
    <div class="review-trap" aria-hidden="true"><label>Leave this field empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
    <div id="reviewMsg" aria-live="polite"></div><button class="btn primary" id="reviewSubmit" type="submit">Submit review</button>
  </form>` : `<div class="note" role="status">Ratings and reviews are temporarily unavailable. Please check back soon.</div>`;
  return `<section class="reviews-sec" id="reviews" aria-labelledby="reviewsTitle"><div class="reviews-title"><div><p class="eyebrow dark">Customer feedback</p><h2 class="h2" id="reviewsTitle">Ratings &amp; reviews</h2></div>${count > 0 && average !== null ? `<div class="rating-total">${starsHtml(average)} <b>${average.toFixed(1)}/5</b><span class="sm muted">${count} ${count === 1 ? "review" : "reviews"}</span></div>` : ""}</div><p class="muted sm">${esc(intro)}</p><div class="review-list">${cards || (data.configured ? '<p class="empty">No approved reviews to show yet.</p>' : "")}</div>${form}</section>`;
}

export function productPage(site, p, related, settings = {}, reviewData = { configured: false, reviews: [], summary: null }) {
  const cat = bySlug[p.category];
  const url = `${site}/product/${p.slug}`;
  const imgs = (p.image_urls || []).filter(safeUrl);
  const soldOut = Number(p.stock) <= 0;
  const sizes = p.sizes || [];
  const summary = reviewData.summary || { count: Number(p.review_count || 0), average: p.average_rating ?? null };
  const reviewCount = Math.max(0, Number(summary.count || 0));
  const avg = summary.average == null ? null : Number(summary.average);
  const ratingLine = reviewData.configured && reviewCount > 0 && avg !== null
    ? `<div class="product-rating">${starsHtml(avg)} <b>${avg.toFixed(1)}</b><span class="muted sm">(${reviewCount} ${reviewCount === 1 ? "review" : "reviews"})</span><a href="#reviews">Read reviews</a></div>`
    : reviewData.configured ? `<div class="product-rating">${starsHtml(0)} <span class="muted sm">No reviews yet</span><a href="#reviews">Be the first to review</a></div>`
      : `<div class="product-rating"><span class="muted sm">Customer ratings coming soon</span></div>`;
  const gallery = `<div class="gal"><div class="gal-main" id="galMain">${imgs[0] ? imgTag(imgs[0], `${p.name} - ${catName(p.category)}`, { eager: true, w: 800, h: 800 }) : imgTag("", p.name)}</div>${imgs.length > 1 ? `<div class="gal-th" role="list">${imgs.map((u, i) => `<button type="button" class="th${i ? "" : " on"}" role="listitem" data-src="${esc(u)}" aria-label="Photo ${i + 1}">${imgTag(u, `${p.name} photo ${i + 1}`, { w: 80, h: 80 })}</button>`).join("")}</div>` : ""}</div>`;
  const body = `<div class="wrap sec"><nav class="crumb" aria-label="Breadcrumb"><a href="/">Home</a> / ${cat ? `<a href="/category/${cat.slug}">${esc(cat.name)}</a> / ` : ""}<span>${esc(p.name)}</span></nav>
<div class="pdp" id="pdp" data-id="${p.id}" data-stock="${Number(p.stock) || 0}" data-name="${esc(p.name)}">${gallery}
<div class="pdp-info"><h1 class="h1">${esc(p.name)}</h1>${ratingLine}
<div class="price big"><b>${money(effPrice(p))}</b>${onSale(p) ? ` <s>${money(p.price)}</s> <span class="off">${pctOff(p)}% off</span>` : ""}</div>
<p class="sm muted">Inclusive of all taxes. Delivery charges, if any, are shown at checkout.</p>
${sizes.length ? `<fieldset class="sizes"><legend>Select size</legend>${sizes.map((s) => `<label class="sz"><input type="radio" name="size" value="${esc(s)}"><span>${esc(s)}</span></label>`).join("")}</fieldset>` : ""}
${soldOut ? '<p class="soldout">This product is currently sold out.</p>' : `<div class="qtyrow"><span>Quantity</span><div class="qty"><button type="button" id="qMinus" aria-label="Decrease">−</button><output id="qVal">1</output><button type="button" id="qPlus" aria-label="Increase">+</button></div></div>
<div class="buy"><button class="btn primary lg" id="addBtn" type="button">Add to cart</button><a class="btn outline lg" href="/cart" id="goCart" hidden>View cart</a></div><p id="pdpMsg" class="sm" role="status" aria-live="polite"></p>${Number(p.stock) <= 5 ? `<p class="sm warn">Only ${Number(p.stock)} left</p>` : ""}`}
<dl class="spec">${cat ? `<div><dt>Category</dt><dd><a href="/category/${cat.slug}">${esc(cat.name)}</a></dd></div>` : ""}${p.material ? `<div><dt>Material</dt><dd>${esc(p.material)}</dd></div>` : ""}${sizes.length ? `<div><dt>Sizes</dt><dd>${esc(sizes.join(", "))}</dd></div>` : ""}</dl>
${p.description ? `<div class="desc"><h2>Details</h2><p>${esc(p.description).replace(/\n/g, "<br>")}</p></div>` : ""}
<p class="sm muted">Questions? <a href="https://wa.me/919927892667" target="_blank" rel="noopener">WhatsApp us</a> or call <a href="tel:+919927892667">9927892667</a>.</p></div></div>
${reviewSection(reviewData)}
${related.length ? `<section class="sec"><h2 class="h2">You may also like</h2><div class="grid">${related.map(cardHtml).join("")}</div></section>` : ""}</div>
<script type="module" src="/js/product.js"></script>`;
  const title = `${p.name} - Buy Online | ${BRAND}`;
  const desc = (p.description ? p.description.replace(/\s+/g, " ").slice(0, 140) + " - " : "") + `${catName(p.category)} at ${BRAND}, Sarai Tareen Sambhal. ${money(effPrice(p))}.`;
  const productJsonLd = {
    "@context": "https://schema.org", "@type": "Product", name: p.name, sku: String(p.id), category: catName(p.category), ...(imgs.length ? { image: imgs } : {}), ...(p.description ? { description: p.description.slice(0, 500) } : {}), ...(p.material ? { material: p.material } : {}), brand: { "@type": "Brand", name: BRAND },
    offers: { "@type": "Offer", url, priceCurrency: "INR", price: effPrice(p).toFixed(2), availability: soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock", itemCondition: "https://schema.org/NewCondition", seller: { "@type": "Organization", name: BRAND } },
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
