// Admin-only product management. Every request re-checks admin_users server-side.
// GET supports search / filters / sorting / pages (all done on the server, so results really change).
import { route, requireAdmin, admin, jsonBody, HttpError, audit } from "../../_lib.js";
import { product, variants as variantsInput, imagePrefix } from "../../_validate.js";
import { categoryInput } from "../../_validate.js";
import { allBySlug, bySlug, CATEGORIES, groupBySlug, nameKey } from "../../../public/js/categories.js";
import { attachVariants } from "../../_catalog.js";
import { loadAllCategories } from "./categories.js";
import { resetCategoryCache } from "../../_catalog.js";

const bucketPath = (url) => (url.startsWith(imagePrefix()) ? url.slice(imagePrefix().length) : null);
/** Deletes photos from storage, except photos another product (for example a duplicate) still uses. */
async function removeUnusedImages(db, urls, exceptId) {
  const paths = urls.map(bucketPath).filter(Boolean);
  if (!paths.length) return;
  const { data } = await db.from("products").select("id,image_urls").neq("id", exceptId).limit(5000);
  const used = new Set((data || []).flatMap((p) => p.image_urls || []));
  const del = urls.filter((u) => !used.has(u)).map(bucketPath).filter(Boolean);
  if (del.length) await db.storage.from("product-images").remove(del).catch(() => {});   // best effort
}
const dbError = (e) => {
  if (e?.code === "23505" && /sku/i.test(`${e.message} ${e.details || ""}`)) return new HttpError(409, "This SKU is already used by another product or variant.");
  return e;
};

// ----- list helpers -----
const effOf = (o) => (o.sale_price && Number(o.sale_price) > 0 && Number(o.sale_price) < Number(o.price) ? Number(o.sale_price) : Number(o.price));
const piecesOf = (p) => (p.variants?.length ? p.variants.reduce((n, v) => n + Number(v.stock || 0), 0) : Number(p.stock || 0));
const pricesOf = (p) => (p.variants?.length ? p.variants.map(effOf) : [effOf(p)]);
const SORTS = {
  new: (a, b) => new Date(b.created_at) - new Date(a.created_at),
  old: (a, b) => new Date(a.created_at) - new Date(b.created_at),
  name_asc: (a, b) => a.name.localeCompare(b.name), name_desc: (a, b) => b.name.localeCompare(a.name),
  price_asc: (a, b) => Math.min(...pricesOf(a)) - Math.min(...pricesOf(b)), price_desc: (a, b) => Math.min(...pricesOf(b)) - Math.min(...pricesOf(a)),
  stock_asc: (a, b) => piecesOf(a) - piecesOf(b), stock_desc: (a, b) => piecesOf(b) - piecesOf(a),
  updated: (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at),
};
function matches(p, f) {
  const has = (s) => String(s ?? "").toLowerCase();
  if (f.q) {
    const q = has(f.q);
    const hay = [p.name, p.sku, p.id, p.slug, p.category, allBySlug[p.category]?.name, p.subcategory, p.brand, ...(p.variants || []).flatMap((v) => [v.sku, v.label])].map(has).join("\n");
    if (!hay.includes(q)) return false;
  }
  if (f.category && p.category !== f.category) return false;
  if (f.group && allBySlug[p.category]?.group !== f.group) return false;
  const status = p.archived ? "archived" : p.active ? "active" : "inactive";
  if (f.status === "all") { /* everything */ } else if (f.status ? status !== f.status : p.archived) return false;
  const pieces = piecesOf(p), low = Number(p.low_stock_threshold ?? 3);
  if (f.stock === "out" && pieces > 0) return false;
  if (f.stock === "in" && pieces <= 0) return false;
  if (f.stock === "low" && !(pieces > 0 && pieces <= low)) return false;
  const lo = Math.min(...pricesOf(p)), hi = Math.max(...pricesOf(p));
  if (f.min_price !== undefined && hi < f.min_price) return false;
  if (f.max_price !== undefined && lo > f.max_price) return false;
  if (f.sale && ![p, ...(p.variants || [])].some((o) => o.sale_price && Number(o.sale_price) > 0 && Number(o.sale_price) < Number(o.price))) return false;
  if (f.returnable === "yes" && p.return_eligible !== true) return false;
  if (f.returnable === "no" && p.return_eligible !== false) return false;
  if (f.returnable === "unset" && p.return_eligible !== null && p.return_eligible !== undefined) return false;
  const opt = (name) => (p.variants || []).map((v) => has(v.options?.[name]));
  if (f.colour && !opt("Colour").some((x) => x.includes(has(f.colour)))) return false;
  if (f.size && !(opt("Size").some((x) => x.includes(has(f.size))) || (p.sizes || []).some((x) => has(x) === has(f.size)))) return false;
  if (f.pack && !((p.variants || []).some((v) => String(v.pack_qty) === String(f.pack) || has(v.options?.["Pack Size"]).includes(has(f.pack))) || String(p.pack_size) === String(f.pack))) return false;
  if (f.recent && Date.now() - new Date(p.created_at).getTime() > f.recent * 86400000) return false;
  if (f.needs_category && bySlug[p.category]) return false;
  return true;
}
const num = (v) => (v === undefined || v === "" || Number.isNaN(Number(v)) ? undefined : Number(v));

async function saveVariants(db, productId, list) {
  if (list === null) return;
  const { data: existing, error: e0 } = await db.from("product_variants").select("id").eq("product_id", productId);
  if (e0) throw e0;
  const have = new Set((existing || []).map((x) => Number(x.id)));
  for (const v of list) if (v.id && !have.has(v.id)) throw new HttpError(400, "A variant does not belong to this product.");
  const keep = new Set(list.filter((v) => v.id).map((v) => v.id));
  const del = [...have].filter((id) => !keep.has(id));
  if (del.length) { const { error } = await db.from("product_variants").delete().in("id", del); if (error) throw error; }
  for (const v of list) {
    const row = { product_id: productId, sku: v.sku, label: v.label, options: v.options, price: v.price, sale_price: v.sale_price, stock: v.stock, pack_qty: v.pack_qty, available: v.available, sort_order: v.sort_order };
    const { error } = v.id ? await db.from("product_variants").update(row).eq("id", v.id).eq("product_id", productId) : await db.from("product_variants").insert(row);
    if (error) throw dbError(error);
  }
}

/** "Others" in the product form: reuse an existing category with the same name, or create a new one. */
async function resolveCategory(db, b, rows, user) {
  if (b.category !== "__other") return b;
  const c = categoryInput({ name: b.custom_category, group: b.custom_group });
  const dup = rows.find((r) => r.slug === c.slug || nameKey(r.name) === nameKey(c.name));
  if (dup) {
    if (!dup.active) throw new HttpError(409, `A category called "${dup.name}" exists but is switched off. Switch it on in Categories first.`);
    return { ...b, category: dup.slug };
  }
  const sort = Math.max(0, ...rows.filter((r) => r.active).map((r) => Number(r.sort_order) || 0)) + 10;
  const { error } = await db.from("categories").insert({ slug: c.slug, name: c.name, group_slug: c.group, sort_order: sort, active: true });
  if (error) throw error;
  await audit(user, "category.create", "category", c.slug, { name: c.name, via: "product form" });
  resetCategoryCache(); await loadAllCategories(db);
  return { ...b, category: c.slug };
}

export default route(["GET", "POST", "PATCH", "DELETE"], async (req, res) => {
  const user = await requireAdmin(req, res);
  const db = await admin();
  const catRows = await loadAllCategories(db).catch(() => []);
  const b = req.method === "GET" ? {} : jsonBody(req);

  if (req.method === "GET") {
    const qs = req.query || {};
    const { data, error } = await db.from("products").select("*").order("created_at", { ascending: false }).limit(2000);
    if (error) throw error;
    const all = await attachVariants(db, data || []);
    const f = { q: String(qs.q || "").trim().slice(0, 80), category: String(qs.category || ""), group: groupBySlug[qs.group] ? qs.group : "", status: ["active", "inactive", "archived", "all"].includes(qs.status) ? qs.status : "",
      stock: ["in", "out", "low"].includes(qs.stock) ? qs.stock : "", min_price: num(qs.min_price), max_price: num(qs.max_price), sale: qs.sale === "1",
      returnable: ["yes", "no", "unset"].includes(qs.returnable) ? qs.returnable : "", colour: String(qs.colour || "").slice(0, 40), size: String(qs.size || "").slice(0, 40), pack: String(qs.pack || "").slice(0, 40),
      recent: num(qs.recent), needs_category: qs.needs_category === "1" };
    const list = all.filter((p) => matches(p, f)).sort(SORTS[qs.sort] || SORTS.new);
    const per = Math.min(Math.max(num(qs.per) || 25, 1), 100), pages = Math.max(1, Math.ceil(list.length / per)), page = Math.min(Math.max(num(qs.page) || 1, 1), pages);
    const items = list.slice((page - 1) * per, page * per).map((p) => ({ ...p, needs_category: !bySlug[p.category] }));
    return res.json({ products: items, total: list.length, page, pages, per, catalogue: all.length, needsCategory: all.filter((p) => !bySlug[p.category] && !p.archived).length });
  }

  if (req.method === "POST") {
    const input = await resolveCategory(db, b, catRows, user);
    const row = product(input);
    const vars = variantsInput(b.variants, row.variant_axes.length ? row.variant_axes : ["Colour", "Size", "Material", "Design", "Pack Size"]);
    const { data, error } = await db.from("products").insert(row).select().single();
    if (error) throw dbError(error);
    try { await saveVariants(db, data.id, vars); }
    catch (e) { await db.from("products").delete().eq("id", data.id); throw e; }       // no half-saved product
    await audit(user, "product.create", "product", data.id, { name: data.name });
    return res.status(201).json({ product: data });
  }

  const id = Number(b.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Invalid product id.");
  const { data: cur, error: e0 } = await db.from("products").select("*").eq("id", id).maybeSingle();
  if (e0) throw e0;
  if (!cur) throw new HttpError(404, "Product not found.");

  if (req.method === "PATCH") {
    if (b.action === "duplicate") {
      const [withVars] = await attachVariants(db, [cur]);
      const row = { ...product({ ...cur, category: bySlug[cur.category] ? cur.category : CATEGORIES[0].slug }), name: `${cur.name} (Copy)`.slice(0, 120), sku: null, active: false, archived: false };
      const { data, error } = await db.from("products").insert(row).select().single();
      if (error) throw dbError(error);
      await saveVariants(db, data.id, withVars.variants.map((v, i) => ({ id: null, sku: null, options: v.options, label: v.label, price: Number(v.price), sale_price: v.sale_price == null ? null : Number(v.sale_price), stock: v.stock, pack_qty: v.pack_qty, available: v.available, sort_order: i })));
      await audit(user, "product.duplicate", "product", data.id, { from: id });
      return res.status(201).json({ product: data });
    }
    const QUICK = { archive: { archived: true, active: false }, unarchive: { archived: false, active: false }, activate: { active: true, archived: false }, deactivate: { active: false } };
    if (QUICK[b.action]) {
      const { data, error } = await db.from("products").update(QUICK[b.action]).eq("id", id).select().single();
      if (error) throw error;
      await audit(user, `product.${b.action}`, "product", id);
      return res.json({ product: data });
    }
    if (b.action === "out_of_stock") {
      const { error } = await db.from("products").update({ stock: 0 }).eq("id", id); if (error) throw error;
      await db.from("product_variants").update({ stock: 0 }).eq("product_id", id);
      await audit(user, "product.out_of_stock", "product", id);
      return res.json({ ok: true });
    }
    const input = await resolveCategory(db, { ...cur, ...b }, catRows, user);
    const merged = product(input);   // partial updates (e.g. {id, price}) are merged then fully validated
    const vars = variantsInput(b.variants, merged.variant_axes.length ? merged.variant_axes : ["Colour", "Size", "Material", "Design", "Pack Size"]);
    const { data, error } = await db.from("products").update(merged).eq("id", id).select().single();
    if (error) throw dbError(error);
    await saveVariants(db, id, vars);
    await removeUnusedImages(db, (cur.image_urls || []).filter((u) => !merged.image_urls.includes(u)), id);
    await audit(user, "product.update", "product", id, { fields: Object.keys(b).filter((k) => k !== "id") });
    return res.json({ product: data });
  }

  // DELETE: products that appear in any order are never deleted (archive them instead).
  const { count, error: ce } = await db.from("orders").select("id", { count: "exact", head: true }).contains("items", [{ product_id: id }]);
  if (ce) throw ce;
  if (Number(count || 0) > 0) throw new HttpError(409, `This product is in ${count} order${count === 1 ? "" : "s"}, so it cannot be deleted (your order history must stay correct). Use "Archive" instead.`);
  const { error } = await db.from("products").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") throw new HttpError(409, "This product has customer reviews, so it cannot be deleted. Use \"Archive\" instead.");
    throw error;
  }
  await removeUnusedImages(db, cur.image_urls || [], id);
  await audit(user, "product.delete", "product", id, { name: cur.name });
  res.json({ ok: true });
});
