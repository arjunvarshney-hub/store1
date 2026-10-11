// Input validation. Pure functions: easy to unit-test, never trust the browser.
import crypto from "node:crypto";
import { HttpError } from "./_lib.js";
import { bySlug, GROUPS } from "../public/js/categories.js";

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
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) throw new HttpError(400, "Quantity must be between 1 and 100.");
    const variantId = text(it?.variantId, "Variant", { max: 80 });
    if (variantId && !/^[A-Za-z0-9_-]{6,80}$/.test(variantId)) throw new HttpError(400, "Invalid product variant.");
    return { productId, qty, size: text(it?.size, "Size", { max: 40 }), ...(variantId ? { variantId } : {}) };
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
/** Small server-side rich text allow-list. It deliberately discards styles, event handlers and unknown tags. */
export function sanitizeRichText(input) {
  let html = typeof input === "string" ? input.slice(0, 20000) : "";
  html = html.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|video|audio)[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select|video|audio)\b[^>]*\/?\s*>/gi, "");
  const allowed = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "a"]);
  html = html.replace(/<\/?([a-z0-9-]+)\b([^>]*)>/gi, (whole, tag, attrs) => {
    tag = tag.toLowerCase();
    if (!allowed.has(tag)) return "";
    if (tag === "br") return "<br>";
    const closing = /^<\s*\//.test(whole);
    if (closing) return `</${tag}>`;
    if (tag !== "a") return `<${tag}>`;
    const m = String(attrs || "").match(/\bhref\s*=\s*(["'])(.*?)\1/i) || String(attrs || "").match(/\bhref\s*=\s*([^\s>]+)/i);
    if (!m) return "<a>";
    const href = String(m[2] || m[1] || "").trim().replace(/["'<>]/g, "");
    if (!/^(https?:\/\/|mailto:)/i.test(href)) return "<a>";
    return `<a href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer nofollow">`;
  });
  return html.replace(/javascript\s*:/gi, "").trim();
}

function rows(input, field, maxRows = 30) {
  let arr = input;
  if (typeof arr === "string") { try { arr = JSON.parse(arr); } catch { throw new HttpError(400, `${field} format is invalid.`); } }
  if (arr == null || arr === "") return [];
  if (!Array.isArray(arr) || arr.length > maxRows) throw new HttpError(400, `${field} must contain up to ${maxRows} rows.`);
  return arr.map((r, i) => ({
    label: text(r?.label, `${field} label`, { min: 1, max: 80, required: true }),
    value: text(r?.value, `${field} value`, { max: 300 }),
    sort_order: Number.isInteger(Number(r?.sort_order)) && Number(r?.sort_order) >= 0 ? Number(r.sort_order) : i,
  })).filter((r) => r.value);
}

function variants(input) {
  let arr = input;
  if (typeof arr === "string") { try { arr = JSON.parse(arr); } catch { throw new HttpError(400, "Variants format is invalid."); } }
  if (arr == null || arr === "") return [];
  if (!Array.isArray(arr) || arr.length > 50) throw new HttpError(400, "Use no more than 50 variants per product.");
  const ids = new Set(), skus = new Set();
  return arr.map((v, i) => {
    const id = text(v?.id, "Variant ID", { max: 80 }) || `v_${crypto.randomUUID().replaceAll("-", "")}`;
    if (!/^[A-Za-z0-9_-]{6,80}$/.test(id) || ids.has(id)) throw new HttpError(400, "Variant IDs must be unique and valid.");
    ids.add(id);
    const sku = text(v?.sku, "Variant SKU", { max: 80 });
    if (sku && skus.has(sku.toLowerCase())) throw new HttpError(400, "Variant SKUs must be unique within a product.");
    if (sku) skus.add(sku.toLowerCase());
    const price = Number(v?.price);
    if (!(price > 0 && price <= 1000000)) throw new HttpError(400, `Variant ${i + 1}: price must be greater than 0.`);
    let sale_price = null;
    if (v?.sale_price !== null && v?.sale_price !== undefined && v?.sale_price !== "") {
      sale_price = Number(v.sale_price);
      if (!(sale_price > 0 && sale_price < price)) throw new HttpError(400, `Variant ${i + 1}: sale price must be below its regular price.`);
    }
    const stock = Number(v?.stock ?? 0), pack_quantity = Number(v?.pack_quantity ?? 1), min_order_qty = Number(v?.min_order_qty ?? 1);
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) throw new HttpError(400, `Variant ${i + 1}: stock must be a whole number.`);
    if (!Number.isInteger(pack_quantity) || pack_quantity < 1 || pack_quantity > 10000) throw new HttpError(400, `Variant ${i + 1}: pack quantity must be 1–10,000.`);
    if (!Number.isInteger(min_order_qty) || min_order_qty < 1 || min_order_qty > 1000) throw new HttpError(400, `Variant ${i + 1}: minimum order quantity must be 1–1,000.`);
    const attributes = {};
    for (const key of ["Colour", "Size", "Material", "Design", "Pack Size"]) {
      const value = text(v?.attributes?.[key], `${key}`, { max: 80 });
      if (value) attributes[key] = value;
    }
    const label = text(v?.label, "Variant name", { min: 2, max: 120, required: true });
    return { id, label, sku, attributes, price: Math.round(price * 100) / 100,
      sale_price: sale_price === null ? null : Math.round(sale_price * 100) / 100, stock,
      pack_quantity, min_order_qty, active: v?.active === false || v?.active === "false" ? false : true };
  });
}

/** Validates a full product payload and returns ONLY whitelisted columns. */
export function product(b, prefix = imagePrefix()) {
  b = b && typeof b === "object" ? b : {};
  let category = text(b.category, "Category", { max: 80, required: true });
  let custom_category_name = text(b.custom_category_name, "Custom category", { max: 80 });
  if (category === "__other__") {
    if (custom_category_name.length < 2) throw new HttpError(400, "Enter the custom category name.");
    category = "custom-" + custom_category_name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 55);
  }
  const custom_category_group = text(b.custom_category_group, "Custom category group", { max: 40 });
  if (!bySlug[category] && !/^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category)) throw new HttpError(400, "Please choose a valid category.");
  if (custom_category_name && !category.startsWith("custom-")) custom_category_name = "";
  if (custom_category_group && !["thakur-ji-poshak", "ladies-wear"].includes(custom_category_group)) throw new HttpError(400, "Please choose a valid category group.");
  const price = Number(b.price);
  if (!(price > 0 && price <= 1000000)) throw new HttpError(400, "Price must be greater than 0.");
  let sale_price = null;
  if (b.sale_price !== null && b.sale_price !== undefined && b.sale_price !== "") {
    sale_price = Number(b.sale_price);
    if (!(sale_price > 0 && sale_price < price)) throw new HttpError(400, "Sale price must be less than the regular price.");
  }
  let stock = Number(b.stock ?? 0);
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) throw new HttpError(400, "Stock must be a whole number (0 or more).");
  const cost_price = b.cost_price === null || b.cost_price === undefined || b.cost_price === "" ? null : Number(b.cost_price);
  if (cost_price !== null && (!(cost_price >= 0) || cost_price > 1000000)) throw new HttpError(400, "Cost price must be 0 or more.");
  const low_stock_threshold = Number(b.low_stock_threshold ?? 5), min_order_qty = Number(b.min_order_qty ?? 1), pack_size = Number(b.pack_size ?? 1);
  if (!Number.isInteger(low_stock_threshold) || low_stock_threshold < 0 || low_stock_threshold > 100000) throw new HttpError(400, "Low-stock threshold must be a whole number.");
  if (!Number.isInteger(min_order_qty) || min_order_qty < 1 || min_order_qty > 1000) throw new HttpError(400, "Minimum order quantity must be between 1 and 1,000.");
  if (!Number.isInteger(pack_size) || pack_size < 1 || pack_size > 10000) throw new HttpError(400, "Pack size must be between 1 and 10,000 pieces.");
  const weight_grams = b.weight_grams === null || b.weight_grams === undefined || b.weight_grams === "" ? null : Number(b.weight_grams);
  if (weight_grams !== null && (!(weight_grams >= 0) || weight_grams > 10000000)) throw new HttpError(400, "Weight must be 0 or more grams.");
  const dimensions = {};
  for (const k of ["length_cm", "width_cm", "height_cm"]) {
    const raw = b.dimensions?.[k];
    if (raw !== undefined && raw !== null && raw !== "") {
      const n = Number(raw); if (!(n > 0 && n <= 100000)) throw new HttpError(400, `Invalid ${k.replace("_cm", "")} dimension.`); dimensions[k] = n;
    }
  }
  const imgs = Array.isArray(b.image_urls) ? b.image_urls : [];
  if (imgs.length > 8) throw new HttpError(400, "Maximum 8 photos per product.");
  for (const u of imgs) if (typeof u !== "string" || !u.startsWith(prefix) || u.length > 400) throw new HttpError(400, "Invalid image. Please upload photos using the uploader.");
  const return_eligible = b.return_eligible === true || b.return_eligible === "true";
  const return_window_days = Number(b.return_window_days ?? 0);
  if (!Number.isInteger(return_window_days) || return_window_days < 0 || return_window_days > 90) throw new HttpError(400, "Return window must be 0–90 days.");
  const descHtml = sanitizeRichText(b.description_html || "");
  const description = text(b.description, "Description", { max: 5000 }) || (descHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null);
  const sku = text(b.sku, "Product SKU", { max: 80 });
  const brand = text(b.brand, "Brand", { max: 100 });
  const subcategory = text(b.subcategory, "Subcategory", { max: 100 });
  const specs = rows(b.specifications, "Specifications", 40);
  const vars = variants(b.variants);
  if (vars.length) stock = vars.reduce((sum, item) => sum + item.stock, 0); // canonical product stock = sum of individual pieces across variants
  return {
    name: text(b.name, "Product name", { min: 2, max: 120, required: true }),
    category, custom_category_name: custom_category_name || null, custom_category_group: custom_category_group || null,
    sku: sku || null, brand: brand || null, subcategory: subcategory || null,
    price: Math.round(price * 100) / 100, sale_price: sale_price === null ? null : Math.round(sale_price * 100) / 100,
    cost_price: cost_price === null ? null : Math.round(cost_price * 100) / 100,
    description, description_html: descHtml || null, material: text(b.material, "Material", { max: 100 }) || null,
    sizes: sizes(b.sizes), image_urls: imgs, stock, low_stock_threshold, min_order_qty, pack_size,
    weight_grams: weight_grams === null ? null : Math.round(weight_grams * 100) / 100,
    dimensions, variants: vars, specifications: specs,
    return_eligible, return_window_days,
    return_conditions: text(b.return_conditions, "Return conditions", { max: 1500 }) || null,
    return_instructions: text(b.return_instructions, "Return instructions", { max: 1500 }) || null,
    refund_policy: text(b.refund_policy, "Refund policy", { max: 1500 }) || null,
    featured: b.featured === true || b.featured === "true",
    archived_at: b.archived_at ? String(b.archived_at) : null,
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
