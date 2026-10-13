// Single source of truth for categories, shared by the server and the browser.
// The shop owner edits categories in the admin panel (database table "categories"). The exports below are live
// REGISTRIES: setCategories() refills them in place, so every file that imports them always sees the current list.
// The defaults here are used until the database list has been loaded (and if the database is not upgraded yet).
export const GROUPS = [
  { slug: "thakur-ji-poshak", name: "Thakur Ji Poshak" },       // PRIMARY business: always listed first
  { slug: "ladies-wear", name: "Ladies Wear" },
];
const d = (slug, name, group, sort, active = true) => ({ slug, name, group, sort, active });
export const DEFAULT_CATEGORIES = [
  d("laddu-gopal-poshak", "Laddu Gopal Poshak", "thakur-ji-poshak", 10),
  d("krishna-poshak", "Krishna Poshak", "thakur-ji-poshak", 20),
  d("devi-poshak", "Devi Poshak", "thakur-ji-poshak", 30),
  d("mukut", "Mukut", "thakur-ji-poshak", 40),
  d("mala-necklace", "Mala and Necklace", "thakur-ji-poshak", 50),
  d("bansuri", "Bansuri", "thakur-ji-poshak", 60),
  d("jhula", "Jhula", "thakur-ji-poshak", 70),
  d("singhasan", "Singhasan", "thakur-ji-poshak", 80),
  d("thakur-ji-shringar", "Thakur Ji Shringar", "thakur-ji-poshak", 90),
  d("other-thakur-ji-accessories", "Other Thakur Ji Accessories", "thakur-ji-poshak", 100),
  d("kurti", "Kurti", "ladies-wear", 110),
  d("suit", "Suit", "ladies-wear", 120),
  d("dupatta", "Dupatta", "ladies-wear", 130),
  d("plazo", "Plazo", "ladies-wear", 140),
  // Removed from the shop. Kept (switched off) so old product records stay readable and can be reassigned.
  d("mala", "Mala", "thakur-ji-poshak", 900, false), d("necklace", "Necklace", "thakur-ji-poshak", 901, false),
  d("fall-and-astar", "Fall and Astar", "ladies-wear", 902, false), d("maxi", "Maxi", "ladies-wear", 903, false),
  d("gown", "Gown", "ladies-wear", 904, false), d("dress-material", "Dress Material", "ladies-wear", 905, false),
];
export const groupBySlug = Object.fromEntries(GROUPS.map((x) => [x.slug, x]));
export const ALL_CATEGORIES = [];   // active + switched-off
export const CATEGORIES = [];       // ACTIVE only (customer navigation, filters, product form)
export const bySlug = {};           // ACTIVE only: what a product may be saved with
export const allBySlug = {};        // every category: used only to show names of old products

/** Accepts database rows ({slug,name,group_slug,sort_order,active}) or default objects ({group,sort}). */
export function setCategories(rows) {
  const list = (Array.isArray(rows) ? rows : [])
    .map((r) => ({ slug: String(r.slug), name: String(r.name), group: String(r.group ?? r.group_slug), sort: Number(r.sort ?? r.sort_order ?? 100), active: r.active !== false }))
    .filter((r) => r.slug && r.name && groupBySlug[r.group])
    .sort((a, b) => groupIndex(a.group) - groupIndex(b.group) || a.sort - b.sort || a.name.localeCompare(b.name));
  ALL_CATEGORIES.length = 0; ALL_CATEGORIES.push(...list);
  CATEGORIES.length = 0; CATEGORIES.push(...list.filter((x) => x.active));
  for (const o of [bySlug, allBySlug]) for (const k of Object.keys(o)) delete o[k];
  for (const x of list) allBySlug[x.slug] = x;
  for (const x of CATEGORIES) bySlug[x.slug] = x;
}
const groupIndex = (g) => GROUPS.findIndex((x) => x.slug === g);
export const catName = (slug) => allBySlug[slug]?.name || slug || "";
export const slugsInGroup = (g) => CATEGORIES.filter((x) => x.group === g).map((x) => x.slug);
/** URL-safe id from a category name (also used to detect duplicates). */
/** Comparison key: "Mala & Necklace", "mala  and necklace" and "MALA AND NECKLACE" are the same category. */
export const nameKey = (name) => String(name || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9\u0900-\u097f]+/g, " ").trim();
export const slugify = (name) => String(name || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
setCategories(DEFAULT_CATEGORIES);
