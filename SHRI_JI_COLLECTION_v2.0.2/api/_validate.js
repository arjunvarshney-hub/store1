// Input validation. Pure functions: easy to unit-test, never trust the browser.
import { HttpError } from "./_lib.js";
import { bySlug, slugify, groupBySlug } from "../public/js/categories.js";
import { sanitizeHtml, htmlToText } from "./_html.js";

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
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) throw new HttpError(400, "Quantity must be between 1 and 50.");
    const out = { productId, qty, size: text(it?.size, "Size", { max: 20 }) };
    if (it?.variantId !== undefined && it?.variantId !== null && it?.variantId !== "" && Number(it.variantId) !== 0) {
      const variantId = Number(it.variantId);
      if (!Number.isSafeInteger(variantId) || variantId < 1) throw new HttpError(400, "Invalid product option in cart.");
      out.variantId = variantId;
    }
    return out;
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
const multiline = (v, field, max) => {
  if (v == null || v === "") return "";
  if (typeof v !== "string") throw new HttpError(400, `${field} is invalid.`);
  const t = v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim();
  if (t.length > max) throw new HttpError(400, `${field} is too long (max ${max} characters).`);
  return t;
};
const money2 = (n) => Math.round(n * 100) / 100;
const intIn = (v, field, min, max, dflt) => {
  if (v === undefined || v === null || v === "") return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${field} must be a whole number from ${min} to ${max}.`);
  return n;
};
const optMoney = (v, field) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (!(n >= 0 && n <= 1000000)) throw new HttpError(400, `${field} is invalid.`);
  return money2(n);
};
export const VARIANT_AXES = ["Colour", "Size", "Material", "Design", "Pack Size"];

/** Specification rows the owner adds (label + value). Empty values are allowed (hidden on the shop). */
export function specs(v) {
  if (v == null || v === "") return [];
  let arr = v;
  if (typeof v === "string") { try { arr = JSON.parse(v); } catch { throw new HttpError(400, "Specifications are invalid."); } }
  if (!Array.isArray(arr)) throw new HttpError(400, "Specifications are invalid.");
  if (arr.length > 30) throw new HttpError(400, "Maximum 30 specification rows.");
  return arr.map((r) => ({ label: text(r?.label, "Specification name", { min: 1, max: 60, required: true }), value: text(r?.value, "Specification value", { max: 300 }) }));
}

/** Variants (colour / size / material / design / pack). Each has its own SKU, price, sale price, stock and pack quantity. */
export function variants(list, axes) {
  if (list === undefined || list === null) return null;            // null = leave variants untouched
  if (!Array.isArray(list)) throw new HttpError(400, "Variants are invalid.");
  if (list.length > 60) throw new HttpError(400, "Maximum 60 variants per product.");
  const seen = new Set(), skus = new Set();
  const out = list.map((x, i) => {
    const options = {};
    for (const ax of axes) { const val = text(x?.options?.[ax], ax, { max: 40 }); if (val) options[ax] = val; }
    if (!Object.keys(options).length) throw new HttpError(400, `Variant ${i + 1}: choose at least one option (for example a colour).`);
    const key = JSON.stringify(axes.map((ax) => (options[ax] || "").toLowerCase()));
    if (seen.has(key)) throw new HttpError(400, `Variant ${i + 1} repeats an option combination that already exists.`);
    seen.add(key);
    const price = Number(x?.price);
    if (!(price > 0 && price <= 1000000)) throw new HttpError(400, `Variant ${i + 1}: price must be greater than 0.`);
    let sale_price = null;
    if (x?.sale_price !== undefined && x?.sale_price !== null && x?.sale_price !== "") {
      sale_price = Number(x.sale_price);
      if (!(sale_price > 0 && sale_price < price)) throw new HttpError(400, `Variant ${i + 1}: sale price must be lower than the price.`);
    }
    const sku = text(x?.sku, "Variant SKU", { max: 40 }) || null;
    if (sku) { if (skus.has(sku.toLowerCase())) throw new HttpError(400, `Variant SKU "${sku}" is used twice.`); skus.add(sku.toLowerCase()); }
    const id = x?.id === undefined || x?.id === null || x?.id === "" ? null : Number(x.id);
    if (id !== null && (!Number.isSafeInteger(id) || id < 1)) throw new HttpError(400, "Invalid variant id.");
    return {
      id, sku, options, label: axes.map((ax) => options[ax]).filter(Boolean).join(" / "),
      price: money2(price), sale_price: sale_price === null ? null : money2(sale_price),
      stock: intIn(x?.stock, `Variant ${i + 1}: stock`, 0, 100000, 0), pack_qty: intIn(x?.pack_qty, `Variant ${i + 1}: pack quantity`, 1, 1000, 1),
      available: x?.available === undefined ? true : x.available === true || x.available === "true", sort_order: i,
    };
  });
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

  // Rich-text description: sanitised HTML is stored for display; plain text is kept for search/SEO/assistant.
  const rawHtml = typeof b.description_html === "string" ? b.description_html : "";
  if (rawHtml.length > 40000) throw new HttpError(400, "Description is too long.");
  const description_html = sanitizeHtml(rawHtml) || null;
  const description = description_html ? htmlToText(description_html).slice(0, 3000) || null : text(b.description, "Description", { max: 3000 }) || null;

  // Status: active / inactive / archived (archived products are never visible and keep their order history).
  let active = b.active === undefined ? true : b.active === true || b.active === "true";
  let archived = b.archived === true || b.archived === "true";
  if (b.status !== undefined && b.status !== null && b.status !== "") {
    if (!["active", "inactive", "archived"].includes(b.status)) throw new HttpError(400, "Invalid product status.");
    active = b.status === "active"; archived = b.status === "archived";
  }
  if (archived) active = false;

  const axes = Array.isArray(b.variant_axes) ? [...new Set(b.variant_axes.map(String))].filter((a) => VARIANT_AXES.includes(a)) : [];
  const returnEligible = b.return_eligible === true || b.return_eligible === "true" ? true : b.return_eligible === false || b.return_eligible === "false" ? false : null;
  const return_days = returnEligible ? intIn(b.return_days, "Return window", 1, 365, null) : null;
  if (returnEligible && return_days === null) throw new HttpError(400, "Please enter the return window in days (for example 7).");
  const sku = text(b.sku, "SKU", { max: 40 }) || null;
  if (sku && !/^[A-Za-z0-9._\-\/ ]+$/.test(sku)) throw new HttpError(400, "SKU may contain letters, numbers, space and . _ - / only.");
  return {
    name: text(b.name, "Product name", { min: 2, max: 120, required: true }),
    sku,
    category,
    subcategory: text(b.subcategory, "Subcategory", { max: 60 }) || null,
    brand: text(b.brand, "Brand", { max: 60 }) || null,
    price: money2(price),
    sale_price: sale_price === null ? null : money2(sale_price),
    cost_price: optMoney(b.cost_price, "Cost price"),
    short_description: text(b.short_description, "Short description", { max: 300 }) || null,
    description, description_html,
    material: text(b.material, "Material", { max: 100 }) || null,
    sizes: sizes(b.sizes),
    specs: specs(b.specs),
    image_urls: imgs,
    stock,
    low_stock_threshold: intIn(b.low_stock_threshold, "Low stock alert", 0, 100000, 3),
    min_order_qty: intIn(b.min_order_qty, "Minimum order quantity", 1, 50, 1),
    pack_size: intIn(b.pack_size, "Pack size", 1, 1000, 1),
    weight_g: optMoney(b.weight_g, "Weight"),
    dimensions: text(b.dimensions, "Dimensions", { max: 100 }) || null,
    variant_axes: axes,
    return_eligible: returnEligible,
    return_days,
    return_conditions: multiline(b.return_conditions, "Return conditions", 1000) || null,
    return_instructions: multiline(b.return_instructions, "Return instructions", 1000) || null,
    refund_policy: multiline(b.refund_policy, "Refund policy", 1000) || null,
    active, archived,
  };
}

/** Category created from the product form ("Others") or the category manager. */
export function categoryInput(b) {
  b = b && typeof b === "object" ? b : {};
  const name = text(b.name, "Category name", { min: 2, max: 60, required: true });
  const group = String(b.group ?? "");
  if (!groupBySlug[group]) throw new HttpError(400, "Please choose Thakur Ji Poshak or Ladies Wear for this category.");
  const slug = slugify(name);
  if (!slug) throw new HttpError(400, "Please use letters or numbers in the category name.");
  return { name, group, slug };
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
