// Admin-only product management. Every request re-checks admin_users server-side.
import { route, requireAdmin, admin, jsonBody, HttpError } from "../../_lib.js";
import { product, imagePrefix } from "../../_validate.js";

const bucketPath = (url) => (url.startsWith(imagePrefix()) ? url.slice(imagePrefix().length) : null);
async function removeImages(db, urls) {
  const paths = urls.map(bucketPath).filter(Boolean);
  if (paths.length) await db.storage.from("product-images").remove(paths).catch(() => {});   // best effort
}
async function ensureCategory(db, data) {
  if (!String(data.category || "").startsWith("custom-")) return;
  const row = { slug: data.category, name: data.custom_category_name || data.category.slice(7).replace(/-/g, " "), group_slug: data.custom_category_group || "thakur-ji-poshak", active: true, is_legacy: false, sort_order: 1000, updated_at: new Date().toISOString() };
  const { error } = await db.from("product_categories").upsert(row, { onConflict: "slug", ignoreDuplicates: true });
  if (error) throw error;
}

export default route(["GET", "POST", "PATCH", "DELETE"], async (req, res) => {
  await requireAdmin(req, res);
  const db = await admin();
  const b = req.method === "GET" ? {} : jsonBody(req);
  const id = Number(b.id);

  if (req.method === "GET") {
    const { data, error } = await db.from("products").select("*").order("created_at", { ascending: false }).limit(1000);
    if (error) throw error;
    return res.json({ products: data || [] });
  }
  if (req.method === "POST") {
    const clean = product(b);
    await ensureCategory(db, clean);
    const { data, error } = await db.from("products").insert(clean).select().single();
    if (error) throw error;
    return res.status(201).json({ product: data });
  }
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Invalid product id.");
  const { data: cur, error: e0 } = await db.from("products").select("*").eq("id", id).maybeSingle();
  if (e0) throw e0;
  if (!cur) throw new HttpError(404, "Product not found.");

  if (req.method === "PATCH") {
    const merged = product({ ...cur, ...b });   // partial updates (e.g. {id, active}) are merged then fully validated
    await ensureCategory(db, merged);
    const { data, error } = await db.from("products").update(merged).eq("id", id).select().single();
    if (error) throw error;
    await removeImages(db, (cur.image_urls || []).filter((u) => !merged.image_urls.includes(u)));
    return res.json({ product: data });
  }
  // Historical orders keep their purchased item snapshots. Never hard-delete a product referenced by an order.
  const { data: linked, error: linkError } = await db.from("orders").select("id").contains("items", [{ product_id: id }]).limit(1);
  if (linkError) throw linkError; // fail closed if history cannot be checked
  if (linked?.length) {
    const { data, error } = await db.from("products").update({ active: false, archived_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return res.json({ ok: true, archived: true, product: data, message: "This product is referenced by order history and was archived instead of deleted." });
  }
  const { error } = await db.from("products").delete().eq("id", id);
  if (error) {
    // A foreign-key reference can exist outside the standard item snapshot; preserve the product in that case too.
    const { data, error: archiveError } = await db.from("products").update({ active: false, archived_at: new Date().toISOString() }).eq("id", id).select().single();
    if (archiveError) throw error;
    return res.json({ ok: true, archived: true, product: data, message: "Product was archived to preserve linked records." });
  }
  await removeImages(db, cur.image_urls || []);
  res.json({ ok: true, archived: false });
});
