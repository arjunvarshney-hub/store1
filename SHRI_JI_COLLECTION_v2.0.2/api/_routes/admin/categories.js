// Admin-only category manager: add, rename, sort, switch on/off, delete (only when empty), reassign products.
import { route, requireAdmin, admin, jsonBody, HttpError, audit } from "../../_lib.js";
import { categoryInput } from "../../_validate.js";
import { setCategories, groupBySlug, nameKey } from "../../../public/js/categories.js";
import { resetCategoryCache } from "../../_catalog.js";

export async function loadAllCategories(db) {
  const { data, error } = await db.from("categories").select("slug,name,group_slug,sort_order,active");
  if (error) throw error;
  if (Array.isArray(data) && data.length) setCategories(data);
  return data || [];
}
const countByCategory = async (db) => {
  const { data, error } = await db.from("products").select("category").limit(5000);
  if (error) throw error;
  const n = {}; for (const r of data || []) n[r.category] = (n[r.category] || 0) + 1;
  return n;
};
const fresh = () => resetCategoryCache();

export default route(["GET", "POST", "PATCH", "DELETE"], async (req, res) => {
  const user = await requireAdmin(req, res);
  const db = await admin();
  const rows = await loadAllCategories(db);
  const b = req.method === "GET" ? {} : jsonBody(req);

  if (req.method === "GET") {
    const n = await countByCategory(db);
    const list = rows.map((r) => ({ ...r, products: n[r.slug] || 0 })).sort((a, c) => a.sort_order - c.sort_order);
    const orphans = Object.keys(n).filter((k) => !rows.some((r) => r.slug === k && r.active)).map((k) => ({ slug: k, products: n[k] }));
    return res.json({ categories: list, needsCategory: orphans });
  }

  if (req.method === "POST" && b.action === "reassign") {
    const from = String(b.from || ""), to = String(b.to || "");
    const target = rows.find((r) => r.slug === to && r.active);
    if (!target) throw new HttpError(400, "Please choose an active category to move the products to.");
    if (from === to) throw new HttpError(400, "Choose a different category.");
    const { error } = await db.from("products").update({ category: to }).eq("category", from);
    if (error) throw error;
    await audit(user, "category.reassign", "category", from, { to });
    fresh();
    return res.json({ ok: true });
  }
  if (req.method === "POST" && b.action === "archive") {
    const from = String(b.from || "");
    const { error } = await db.from("products").update({ archived: true, active: false }).eq("category", from);
    if (error) throw error;
    await audit(user, "category.archive_products", "category", from);
    fresh();
    return res.json({ ok: true });
  }

  if (req.method === "POST") {
    const c = categoryInput(b);
    const dup = rows.find((r) => r.slug === c.slug || nameKey(r.name) === nameKey(c.name));
    if (dup) throw new HttpError(409, dup.active ? `The category "${dup.name}" already exists.` : `A category called "${dup.name}" exists but is switched off. Switch it on in Categories instead of creating it again.`, { existing: dup.slug });
    const sort = Math.max(0, ...rows.filter((r) => r.active).map((r) => Number(r.sort_order) || 0)) + 10;
    const { data, error } = await db.from("categories").insert({ slug: c.slug, name: c.name, group_slug: c.group, sort_order: sort, active: true }).select().single();
    if (error) throw error;
    await audit(user, "category.create", "category", c.slug, { name: c.name });
    fresh(); await loadAllCategories(db);
    return res.status(201).json({ category: data });
  }

  const slug = String(b.slug || "");
  const cur = rows.find((r) => r.slug === slug);
  if (!cur) throw new HttpError(404, "Category not found.");

  if (req.method === "PATCH") {
    const patch = {};
    if (b.name !== undefined) {
      const name = categoryInput({ name: b.name, group: cur.group_slug }).name;
      if (rows.some((r) => r.slug !== slug && nameKey(r.name) === nameKey(name))) throw new HttpError(409, "Another category already has this name.");
      patch.name = name;
    }
    if (b.group !== undefined) { if (!groupBySlug[b.group]) throw new HttpError(400, "Invalid group."); patch.group_slug = b.group; }
    if (b.sort_order !== undefined) { const n = Number(b.sort_order); if (!Number.isInteger(n) || n < 0 || n > 100000) throw new HttpError(400, "Invalid order."); patch.sort_order = n; }
    if (b.active !== undefined) patch.active = b.active === true || b.active === "true";
    if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to update.");
    const { data, error } = await db.from("categories").update(patch).eq("slug", slug).select().single();
    if (error) throw error;
    await audit(user, "category.update", "category", slug, patch);
    fresh(); await loadAllCategories(db);
    return res.json({ category: data });
  }

  const n = (await countByCategory(db))[slug] || 0;       // DELETE
  if (n > 0) throw new HttpError(409, `${n} product${n === 1 ? " is" : "s are"} in this category. Move or archive them first, or switch the category off instead of deleting it.`);
  const { error } = await db.from("categories").delete().eq("slug", slug);
  if (error) throw error;
  await audit(user, "category.delete", "category", slug);
  fresh();
  res.json({ ok: true });
});
