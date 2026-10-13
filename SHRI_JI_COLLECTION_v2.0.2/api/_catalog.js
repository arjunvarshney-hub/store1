// Public catalogue queries. Uses the ANON key so Row Level Security applies (active products only).
import { anon } from "./_lib.js";
import { slugsInGroup, bySlug, CATEGORIES, setCategories, DEFAULT_CATEGORIES } from "../public/js/categories.js";

// Public columns only (cost_price and other internal fields are never selected, and the database blocks them for visitors too).
export const PRODUCT_COLS = "id,slug,sku,name,category,subcategory,brand,price,sale_price,short_description,description,description_html,material,sizes,image_urls,stock,specs,min_order_qty,pack_size,weight_g,dimensions,variant_axes,return_eligible,return_days,return_conditions,return_instructions,refund_policy,created_at,updated_at";
// Used automatically if the v4 database upgrade has not been applied yet, so the shop keeps working during deployment.
const LEGACY_COLS = "id,slug,name,category,price,sale_price,description,material,sizes,image_urls,stock,created_at,updated_at";
export const VARIANT_COLS = "id,product_id,sku,label,options,price,sale_price,stock,pack_qty,available,sort_order";

let catLoadedAt = 0;
export const resetCategoryCache = () => { catLoadedAt = 0; };
/** Loads the owner-managed category list into the shared registry (cached 30 s per server instance). */
export async function loadCategories({ force = false } = {}) {
  if (!force && Date.now() - catLoadedAt < 30_000) return;
  catLoadedAt = Date.now();
  try {
    const db = await anon();
    const { data, error } = await db.from("product_categories").select("slug,name,group_slug,sort_order,active");
    if (!error && Array.isArray(data) && data.some((r) => r?.slug && r?.group_slug)) {
      setCategories(data);
      if (!CATEGORIES.length) setCategories(DEFAULT_CATEGORIES);   // never leave the shop without a menu
    }
  } catch { /* table not created yet: built-in list stays */ }
}
export const publicCategories = () => CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, group: c.group }));

/** Adds `variants` (array) to each product. Never throws: a product without variants is a normal product. */
export async function attachVariants(db, products) {
  const by = new Map();
  for (const p of products) { p.variants = []; by.set(Number(p.id), p); }
  if (!by.size) return products;
  try {
    const { data, error } = await db.from("product_variants").select(VARIANT_COLS).in("product_id", [...by.keys()]).order("sort_order", { ascending: true });
    if (!error && Array.isArray(data)) for (const v of data) by.get(Number(v.product_id))?.variants.push(v);
  } catch { /* variants table not created yet */ }
  return products;
}

export async function queryProducts({ ids, slug, category, group, q, sort = "new", page = 1, pageSize = 24, limit } = {}) {
  await loadCategories();
  const db = await anon();
  const term = String(q || "").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  const size = Math.min(Math.max(Number(limit || pageSize) || 24, 1), 60);
  const from = (Math.max(Number(page) || 1, 1) - 1) * size;
  const run = (cols) => {
    let qb = db.from("products").select(cols, { count: "exact" }).eq("active", true).in("category", CATEGORIES.map((c) => c.slug));   // products in switched-off categories are hidden
    if (ids) qb = qb.in("id", ids);
    if (slug) qb = qb.eq("slug", slug);
    if (category && bySlug[category]) qb = qb.eq("category", category);
    else if (group) qb = qb.in("category", slugsInGroup(group));
    if (term) qb = qb.or(`name.ilike.%${term}%,material.ilike.%${term}%,description.ilike.%${term}%`);
    qb = sort === "price_asc" ? qb.order("price", { ascending: true }) : sort === "price_desc" ? qb.order("price", { ascending: false }) : qb.order("created_at", { ascending: false });
    return qb.range(from, from + size - 1);
  };
  let { data, error, count } = await run(PRODUCT_COLS);
  if (error && /does not exist|42703|column/i.test(`${error.code} ${error.message}`)) ({ data, error, count } = await run(LEGACY_COLS));
  if (error) throw error;
  const products = data || [];
  await attachVariants(db, products);
  // Ratings are optional until the additive product_reviews migration is applied. A review-feature
  // setup problem must never take the core product catalogue offline.
  if (products.length) {
    try {
      const { data: summaries, error: summaryError } = await db.rpc("get_product_review_summary", {
        p_product_ids: products.map((p) => Number(p.id)).filter(Number.isSafeInteger),
      });
      if (!summaryError && Array.isArray(summaries)) {
        const byId = new Map(summaries.map((r) => [Number(r.product_id), r]));
        for (const p of products) {
          const summary = byId.get(Number(p.id));
          p.reviews_enabled = true;
          p.review_count = Number(summary?.review_count || 0);
          p.average_rating = summary?.average_rating == null ? null : Number(summary.average_rating);
        }
      }
    } catch { /* review migration not yet applied or temporarily unavailable */ }
  }
  for (const p of products) { p.reviews_enabled ??= false; p.review_count ??= 0; p.average_rating ??= null; }
  return { products, total: count ?? products.length, page: Math.max(Number(page) || 1, 1), pageSize: size };
}

/** Read only public/approved reviews. Missing review schema is reported as not configured, never as a fake zero rating. */
export async function getProductReviewData(productId) {
  try {
    const db = await anon();
    const { data, error } = await db.from("product_reviews")
      .select("id,product_id,customer_name,rating,comment,created_at")
      .eq("product_id", Number(productId)).eq("status", "approved")
      .order("created_at", { ascending: false }).limit(20);
    if (error) return { configured: false, reviews: [], summary: null };
    const { data: summaries, error: summaryError } = await db.rpc("get_product_review_summary", { p_product_ids: [Number(productId)] });
    if (summaryError || !Array.isArray(summaries)) return { configured: false, reviews: [], summary: null };
    const summary = summaries.find((r) => Number(r.product_id) === Number(productId));
    return {
      configured: true,
      reviews: data || [],
      summary: { count: Number(summary?.review_count || 0), average: summary?.average_rating == null ? null : Number(summary.average_rating) },
    };
  } catch {
    return { configured: false, reviews: [], summary: null };
  }
}

/** Logo + home picture. Never throws: if the table is missing the site simply shows the text logo. */
export async function getSettings() {
  try {
    const db = await anon();
    const { data, error } = await db.from("site_settings").select("key,value");
    if (error || !data) return {};
    const o = {};
    for (const r of data) if (["logo_url", "hero_url", "chat_enabled"].includes(r.key) && r.value) o[r.key] = r.value;
    return o;
  } catch { return {}; }
}
