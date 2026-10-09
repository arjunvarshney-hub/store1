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
  return { products: data || [], total: count ?? (data || []).length, page: Math.max(Number(page) || 1, 1), pageSize: size };
}
