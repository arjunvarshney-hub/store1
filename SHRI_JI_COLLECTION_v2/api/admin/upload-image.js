// Admin-only. Receives ONE already-resized image as raw bytes (the admin page shrinks phone photos first).
import { route, requireAdmin, admin, readRaw, randomId, HttpError } from "../_lib.js";
import { imageKind } from "../_validate.js";

export const config = { api: { bodyParser: false } };
const MAX = 3 * 1024 * 1024;   // matches the bucket limit; under Vercel's 4.5 MB request cap

export default route(["POST"], async (req, res) => {
  await requireAdmin(req, res);
  const declared = Number(req.headers["content-length"] || 0);
  if (declared > MAX) throw new HttpError(413, "Photo is too large (max 3 MB). Please choose a smaller photo.");
  const buf = await readRaw(req, MAX);
  const kind = imageKind(buf);                       // magic-byte check: SVG/HTML/anything else is rejected
  if (!kind) throw new HttpError(400, "Only JPG, PNG or WebP photos are allowed.");
  const path = `products/${randomId()}.${kind.ext}`; // server-chosen name: no user-controlled path
  const db = await admin();
  const { error } = await db.storage.from("product-images").upload(path, buf, { contentType: kind.type, upsert: false, cacheControl: "31536000" });
  if (error) throw error;
  res.status(201).json({ url: db.storage.from("product-images").getPublicUrl(path).data.publicUrl });
});
