// Public catalogue queries. Uses the ANON key so Row Level Security applies (active products only).
import { anon } from "./_lib.js";
import { slugsInGroup, bySlug } from "../public/js/categories.js";

export const PRODUCT_COLS = "id,slug,name,category,price,sale_price,description,material,sizes,image_urls,stock,created_at,updated_at";

export async function queryProducts({ ids, slug, category, group, q, sort = "new", page = 1, pageSize = 24, limit } = {}) {
  const db = await anon();
  let qb = db.from("products").select(PRODUCT_COLS, { count: "exact" }).eq("active", true);
  if (ids) qb = qb.in("id", ids);
  if (slug) qb = qb.eq("slug", slug);
  if (category && bySlug[category]) qb = qb.eq("category", category);
  else if (group) qb = qb.in("category", slugsInGroup(group));
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
