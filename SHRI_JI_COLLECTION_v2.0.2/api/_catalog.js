// Public catalogue queries. Uses the ANON key so Row Level Security applies (active products only).
import { anon } from "./_lib.js";
import { slugsInGroup, bySlug, CATEGORIES } from "../public/js/categories.js";

export const PRODUCT_COLS = "id,slug,name,category,custom_category_name,custom_category_group,sku,brand,subcategory,price,sale_price,description,description_html,material,sizes,image_urls,stock,low_stock_threshold,min_order_qty,pack_size,weight_grams,dimensions,variants,specifications,return_eligible,return_window_days,return_conditions,return_instructions,refund_policy,featured,created_at,updated_at";

let categoriesCache = { at: 0, data: null };
export async function getPublicCategories(force = false) {
  if (!force && categoriesCache.data && Date.now() - categoriesCache.at < 60_000) return categoriesCache.data;
  try {
    const db = await anon();
    const { data, error } = await db.from("product_categories").select("slug,name,group_slug,sort_order").eq("active", true).eq("is_legacy", false).order("sort_order", { ascending: true }).order("name", { ascending: true });
    if (error) throw error;
    const cleaned = (data || []).filter(c => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug) && typeof c.name === "string").map(c => ({ slug: c.slug, name: c.name, group: c.group_slug, sort_order: Number(c.sort_order) || 0 }));
    categoriesCache = { at: Date.now(), data: cleaned.length ? cleaned : CATEGORIES };
  } catch {
    categoriesCache = { at: Date.now(), data: CATEGORIES };
  }
  return categoriesCache.data;
}

export async function queryProducts({ ids, slug, category, group, q, sort = "new", page = 1, pageSize = 24, limit } = {}) {
  const db = await anon();
  let qb = db.from("products").select(PRODUCT_COLS, { count: "exact" }).eq("active", true).is("archived_at", null);
  const publicCategories = await getPublicCategories();
  const visibleSlugs = publicCategories.map(c => c.slug);
  if (ids) { qb = qb.in("id", ids); if (visibleSlugs.length) qb = qb.in("category", visibleSlugs); }
  if (slug) { qb = qb.eq("slug", slug); if (visibleSlugs.length) qb = qb.in("category", visibleSlugs); }
  if (category) {
    if (!visibleSlugs.includes(category)) return { products: [], total: 0, page: Math.max(Number(page) || 1, 1), pageSize: Math.min(Math.max(Number(limit || pageSize) || 24, 1), 60) };
    qb = qb.eq("category", category);
  } else if (group) {
    const groupSlugs = publicCategories.filter(c => c.group === group).map(c => c.slug);
    if (!groupSlugs.length) return { products: [], total: 0, page: Math.max(Number(page) || 1, 1), pageSize: Math.min(Math.max(Number(limit || pageSize) || 24, 1), 60) };
    qb = qb.in("category", groupSlugs);
  } else if (!ids || ids.length === 0) {
    if (visibleSlugs.length) qb = qb.in("category", visibleSlugs);
  }
  const term = String(q || "").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (term) qb = qb.or(`name.ilike.%${term}%,material.ilike.%${term}%,description.ilike.%${term}%`);
  qb = sort === "price_asc" ? qb.order("price", { ascending: true }) : sort === "price_desc" ? qb.order("price", { ascending: false }) : qb.order("created_at", { ascending: false });
  const size = Math.min(Math.max(Number(limit || pageSize) || 24, 1), 60);
  const from = (Math.max(Number(page) || 1, 1) - 1) * size;
  const { data, error, count } = await qb.range(from, from + size - 1);
  if (error) throw error;
  const products = data || [];
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
  for (const p of products) {
    p.category_label = publicCategories.find(c => c.slug === p.category)?.name || p.custom_category_name || p.category;
    p.reviews_enabled ??= false; p.review_count ??= 0; p.average_rating ??= null;
    // Never return variant SKUs or unknown/admin-only JSON properties to a customer browser.
    p.variants = (Array.isArray(p.variants) ? p.variants : []).filter((v) => v && v.active !== false).map((v) => ({
      id: String(v.id || ""), label: String(v.label || ""), attributes: v.attributes && typeof v.attributes === "object" ? v.attributes : {},
      price: Number(v.price) || Number(p.price), sale_price: v.sale_price == null ? null : Number(v.sale_price),
      stock: Math.max(0, Number(v.stock) || 0), pack_quantity: Math.max(1, Number(v.pack_quantity) || 1), min_order_qty: Math.max(1, Number(v.min_order_qty) || Number(p.min_order_qty) || 1), active: v.active !== false,
    }));
    p.specifications = (Array.isArray(p.specifications) ? p.specifications : []).filter((x) => x && x.label && x.value).slice(0, 40);
  }
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
  const o = {};
  try {
    const db = await anon();
    const { data, error } = await db.from("site_settings").select("key,value");
    if (!error && data) for (const r of data) if (["logo_url", "hero_url", "chat_enabled"].includes(r.key) && r.value) o[r.key] = r.value;
  } catch { /* defaults are intentional */ }
  o.categories = await getPublicCategories();
  return o;
}
