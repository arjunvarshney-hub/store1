// Return evidence goes to a private Supabase bucket. Files are never exposed as public URLs.
import { route, requireUser, admin, jsonBody, randomId, HttpError } from "../../_lib.js";
import { imageKind } from "../../_validate.js";

const MAX = 2 * 1024 * 1024;
export default route(["POST"], async (req, res) => {
  const user = await requireUser(req, res), b = jsonBody(req);
  const value = String(b.data || "");
  if (!value || value.length > Math.ceil(MAX * 4 / 3) + 16 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new HttpError(413, "Choose one image up to 2 MB.");
  const buf = Buffer.from(value, "base64");
  if (!buf.length || buf.length > MAX) throw new HttpError(413, "Photo is too large (maximum 2 MB).");
  const kind = imageKind(buf);
  if (!kind) throw new HttpError(400, "Only JPG, PNG and WebP photos are allowed.");
  const db = await admin(), path = `${user.id}/${randomId()}.${kind.ext}`;
  const { error } = await db.storage.from("return-photos").upload(path, buf, { contentType: kind.type, upsert: false, cacheControl: "3600" });
  if (error) throw error;
  const { data: signed, error: signError } = await db.storage.from("return-photos").createSignedUrl(path, 3600);
  if (signError) throw signError;
  res.status(201).json({ path, previewUrl: signed?.signedUrl || null });
});
