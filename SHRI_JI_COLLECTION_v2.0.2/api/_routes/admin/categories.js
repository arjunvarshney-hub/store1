// Category registry lives in Supabase; all mutations require a verified admin session.
import { route, requireAdmin, admin, jsonBody, HttpError } from "../../_lib.js";
import { text } from "../../_validate.js";

const slugify = (v) => String(v || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
const groups = new Set(["thakur-ji-poshak", "ladies-wear"]);
const bool = (v, fallback = true) => v === undefined ? fallback : v === true || v === "true";
export default route(["GET", "POST", "PATCH", "DELETE"], async (req, res) => {
  await requireAdmin(req, res);
  const db = await admin();
  if (req.method === "GET") {
    const { data, error } = await db.from("product_categories").select("*").order("group_slug", { ascending: true }).order("sort_order", { ascending: true }).order("name", { ascending: true }).limit(500);
    if (error) throw error;
    return res.json({ categories: data || [] });
  }
  const b = jsonBody(req);
  if (req.method === "POST") {
    const name = text(b.name, "Category name", { min: 2, max: 80, required: true });
    const group_slug = text(b.group_slug, "Category group", { required: true, max: 40 });
    if (!groups.has(group_slug)) throw new HttpError(400, "Choose Thakur Ji Poshak or Ladies Wear.");
    const suffix = slugify(b.slug || name);
    if (!suffix) throw new HttpError(400, "Category name must contain letters or numbers.");
    const slug = suffix.startsWith("custom-") ? suffix : `custom-${suffix}`;
    const row = { slug, name, group_slug, sort_order: Math.max(0, Math.min(10000, Math.trunc(Number(b.sort_order) || 1000))), active: bool(b.active, true), is_legacy: false, updated_at: new Date().toISOString() };
    const { data, error } = await db.from("product_categories").insert(row).select().single();
    if (error?.code === "23505") throw new HttpError(409, "A category with this name/slug already exists. Reuse it instead of creating a duplicate.");
    if (error) throw error;
    return res.status(201).json({ category: data });
  }
  const id = Number(b.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Invalid category id.");
  const { data: current, error: e0 } = await db.from("product_categories").select("*").eq("id", id).maybeSingle();
  if (e0) throw e0;
  if (!current) throw new HttpError(404, "Category not found.");
  if (req.method === "PATCH") {
    const patch = {};
    if (b.name !== undefined) patch.name = text(b.name, "Category name", { min: 2, max: 80, required: true });
    if (b.group_slug !== undefined) {
      const g = text(b.group_slug, "Category group", { required: true, max: 40 });
      if (!groups.has(g)) throw new HttpError(400, "Choose a valid category group.");
      patch.group_slug = g;
    }
    if (b.sort_order !== undefined) {
      const n = Number(b.sort_order); if (!Number.isInteger(n) || n < 0 || n > 10000) throw new HttpError(400, "Sort order must be 0–10,000."); patch.sort_order = n;
    }
    if (b.active !== undefined) {
      patch.active = bool(b.active);
      if (current.is_legacy && patch.active) throw new HttpError(409, "Legacy categories are hidden from the shop. Reassign or archive their products instead.");
    }
    if (!Object.keys(patch).length) throw new HttpError(400, "Nothing to update.");
    patch.updated_at = new Date().toISOString();
    const { data, error } = await db.from("product_categories").update(patch).eq("id", id).select().single();
    if (error) throw error;
    return res.json({ category: data });
  }
  const { data: used, error: usedError } = await db.from("products").select("id").eq("category", current.slug).limit(1);
  if (usedError) throw usedError;
  if (used?.length || current.is_legacy) {
    const { data, error } = await db.from("product_categories").update({ active: false, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return res.json({ ok: true, archived: true, category: data, message: "Category is used by products or is legacy, so it was deactivated instead of deleted." });
  }
  const { error } = await db.from("product_categories").delete().eq("id", id);
  if (error) throw error;
  res.json({ ok: true, archived: false });
});
