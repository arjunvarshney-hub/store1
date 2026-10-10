// Input validation. Pure functions: easy to unit-test, never trust the browser.
import { HttpError } from "./_lib.js";
import { bySlug } from "../public/js/categories.js";

const CTRL = /[\u0000-\u001f\u007f]/g;
export function text(v, field, { min = 0, max = 200, required = false } = {}) {
  const s = typeof v === "string" ? v.replace(CTRL, " ").replace(/\s+/g, " ").trim() : v == null ? "" : null;
  if (s === null) throw new HttpError(400, `${field} is invalid.`);
  if (!s && !required) return "";
  if (s.length < Math.max(min, required ? 1 : 0)) throw new HttpError(400, `${field} is too short.`);
  if (s.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters).`);
  return s;
}
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
export function email(v, { required = false } = {}) {
  const s = text(v, "Email", { max: 120, required }).toLowerCase();
  if (s && !EMAIL_RE.test(s)) throw new HttpError(400, "Please enter a valid email address.");
  return s;
}
export function indianPhone(v) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (!/^[6-9]\d{9}$/.test(d)) throw new HttpError(400, "Please enter a valid 10-digit mobile number.");
  return d;
}
export function customer(c) {
  if (!c || typeof c !== "object") throw new HttpError(400, "Delivery details are missing.");
  const pin = String(c.pincode ?? "").trim();
  if (!/^[1-9]\d{5}$/.test(pin)) throw new HttpError(400, "Please enter a valid 6-digit pincode.");
  return {
    name: text(c.name, "Name", { min: 2, max: 80, required: true }),
    phone: indianPhone(c.phone),
    email: email(c.email),
    address: text(c.address, "Address", { min: 10, max: 300, required: true }),
    city: text(c.city, "City", { min: 2, max: 60, required: true }),
    state: text(c.state, "State", { min: 2, max: 60, required: true }),
    pincode: pin,
  };
}
export function orderItems(items) {
  if (!Array.isArray(items) || items.length < 1) throw new HttpError(400, "Your cart is empty.");
  if (items.length > 20) throw new HttpError(400, "Too many different items in one order (max 20).");
  return items.map((it) => {
    const productId = Number(it?.productId), qty = Number(it?.qty);
    if (!Number.isSafeInteger(productId) || productId < 1) throw new HttpError(400, "Invalid product in cart.");
    if (!Number.isInteger(qty) || qty < 1 || qty > 10) throw new HttpError(400, "Quantity must be between 1 and 10.");
    return { productId, qty, size: text(it?.size, "Size", { max: 20 }) };
  });
}
export function idempotencyKey(v) {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(v)) throw new HttpError(400, "Invalid request key.");
  return v;
}
export function orderNumber(v) {
  if (typeof v !== "string" || !/^SJC-[0-9A-Z-]{6,30}$/.test(v)) throw new HttpError(400, "Invalid order number.");
  return v;
}
/** Only images that live in OUR storage bucket are accepted as product images. */
export const imagePrefix = (supabaseUrl = process.env.SUPABASE_URL || "") =>
  `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/product-images/`;

export function sizes(v) {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const out = [...new Set(arr.map((s) => text(s, "Size", { max: 20 })).filter(Boolean))];
  if (out.length > 15) throw new HttpError(400, "Too many sizes (max 15).");
  return out;
}
/** Validates a full product payload and returns ONLY whitelisted columns. */
export function product(b, prefix = imagePrefix()) {
  b = b && typeof b === "object" ? b : {};
  const category = String(b.category ?? "");
  if (!bySlug[category]) throw new HttpError(400, "Please choose a valid category.");
  const price = Number(b.price);
  if (!(price > 0 && price <= 1000000)) throw new HttpError(400, "Price must be greater than 0.");
  let sale_price = null;
  if (b.sale_price !== null && b.sale_price !== undefined && b.sale_price !== "") {
    sale_price = Number(b.sale_price);
    if (!(sale_price > 0 && sale_price < price)) throw new HttpError(400, "Sale price must be less than the regular price.");
  }
  const stock = Number(b.stock ?? 0);
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) throw new HttpError(400, "Stock must be a whole number (0 or more).");
  const imgs = Array.isArray(b.image_urls) ? b.image_urls : [];
  if (imgs.length > 8) throw new HttpError(400, "Maximum 8 photos per product.");
  for (const u of imgs) if (typeof u !== "string" || !u.startsWith(prefix) || u.length > 400) throw new HttpError(400, "Invalid image. Please upload photos using the uploader.");
  return {
    name: text(b.name, "Product name", { min: 2, max: 120, required: true }),
    category,
    price: Math.round(price * 100) / 100,
    sale_price: sale_price === null ? null : Math.round(sale_price * 100) / 100,
    description: text(b.description, "Description", { max: 3000 }) || null,
    material: text(b.material, "Material", { max: 100 }) || null,
    sizes: sizes(b.sizes),
    image_urls: imgs,
    stock,
    active: b.active === undefined ? true : b.active === true || b.active === "true",
  };
}
export function imageKind(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", type: "image/png" };
  if (buf.length > 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return { ext: "webp", type: "image/webp" };
  return null;
}

/** Site settings (logo / home picture): empty string = remove, otherwise must be an image from OUR bucket. */
export const IMAGE_SETTING_KEYS = ["logo_url", "hero_url"];
export const SETTING_KEYS = [...IMAGE_SETTING_KEYS, "chat_enabled", "chat_faq"];
/** Parses/cleans the FAQ list the owner edits in the admin (max 30 entries). Returns an array of {q,a}. */
export function faqList(input) {
  let arr = input;
  if (typeof input === "string") { try { arr = JSON.parse(input || "[]"); } catch { throw new HttpError(400, "FAQ format is invalid."); } }
  if (!Array.isArray(arr)) throw new HttpError(400, "FAQ format is invalid.");
  if (arr.length > 30) throw new HttpError(400, "Maximum 30 FAQ answers.");
  return arr.map((x) => ({ q: text(x?.q, "FAQ question", { min: 3, max: 200, required: true }), a: text(x?.a, "FAQ answer", { min: 3, max: 600, required: true }) }));
}
/** Site settings: images must live in OUR bucket (or "" to remove); chat_enabled is "1"/"0"; chat_faq is a validated list. */
export function siteSettings(b, prefix = imagePrefix()) {
  b = b && typeof b === "object" ? b : {};
  const out = {};
  for (const k of IMAGE_SETTING_KEYS) {
    if (b[k] === undefined) continue;
    const v = b[k] === null ? "" : b[k];
    if (typeof v !== "string" || (v !== "" && (!v.startsWith(prefix) || v.length > 400))) throw new HttpError(400, "Invalid image. Please upload it using the uploader.");
    out[k] = v;
  }
  if (b.chat_enabled !== undefined) {
    if (!["0", "1", 0, 1, true, false].includes(b.chat_enabled)) throw new HttpError(400, "Invalid assistant setting.");
    out.chat_enabled = b.chat_enabled === "1" || b.chat_enabled === 1 || b.chat_enabled === true ? "1" : "0";
  }
  if (b.chat_faq !== undefined) out.chat_faq = JSON.stringify(faqList(b.chat_faq));
  if (!Object.keys(out).length) throw new HttpError(400, "Nothing to update.");
  return out;
}
