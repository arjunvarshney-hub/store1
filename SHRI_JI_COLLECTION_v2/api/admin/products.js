// Admin-only product management. Every request re-checks admin_users server-side.
import { route, requireAdmin, admin, jsonBody, HttpError } from "../_lib.js";
import { product, imagePrefix } from "../_validate.js";

const bucketPath = (url) => (url.startsWith(imagePrefix()) ? url.slice(imagePrefix().length) : null);
async function removeImages(db, urls) {
  const paths = urls.map(bucketPath).filter(Boolean);
  if (paths.length) await db.storage.from("product-images").remove(paths).catch(() => {});   // best effort
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
    const { data, error } = await db.from("products").insert(product(b)).select().single();
    if (error) throw error;
    return res.status(201).json({ product: data });
  }
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Invalid product id.");
  const { data: cur, error: e0 } = await db.from("products").select("*").eq("id", id).maybeSingle();
  if (e0) throw e0;
  if (!cur) throw new HttpError(404, "Product not found.");

  if (req.method === "PATCH") {
    const merged = product({ ...cur, ...b });   // partial updates (e.g. {id, active}) are merged then fully validated
    const { data, error } = await db.from("products").update(merged).eq("id", id).select().single();
    if (error) throw error;
    await removeImages(db, (cur.image_urls || []).filter((u) => !merged.image_urls.includes(u)));
    return res.json({ product: data });
  }
  const { error } = await db.from("products").delete().eq("id", id);
  if (error) throw error;
  await removeImages(db, cur.image_urls || []);
  res.json({ ok: true });
});
