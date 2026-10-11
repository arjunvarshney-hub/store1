// Single source of truth for customer-facing categories. Legacy categories remain
// available to admins so existing product records can be reassigned safely.
export const GROUPS = [
  { slug: "thakur-ji-poshak", name: "Thakur Ji Poshak" },
  { slug: "ladies-wear", name: "Ladies Wear" },
];
const c = (slug, name, group) => ({ slug, name, group });
export const CATEGORIES = [
  c("laddu-gopal-poshak", "Laddu Gopal Poshak", "thakur-ji-poshak"),
  c("krishna-poshak", "Krishna Poshak", "thakur-ji-poshak"),
  c("devi-poshak", "Devi Poshak", "thakur-ji-poshak"),
  c("mukut", "Mukut", "thakur-ji-poshak"),
  c("mala", "Mala", "thakur-ji-poshak"),
  c("necklace", "Necklace", "thakur-ji-poshak"),
  c("bansuri", "Bansuri", "thakur-ji-poshak"),
  c("jhula", "Jhula", "thakur-ji-poshak"),
  c("singhasan", "Singhasan", "thakur-ji-poshak"),
  c("thakur-ji-shringar", "Thakur Ji Shringar", "thakur-ji-poshak"),
  c("other-thakur-ji-accessories", "Other Thakur Ji Accessories", "thakur-ji-poshak"),
  c("kurti", "Kurti", "ladies-wear"),
  c("suit", "Suit", "ladies-wear"),
  c("dupatta", "Dupatta", "ladies-wear"),
  c("plazo", "Plazo", "ladies-wear"),
];
export const LEGACY_CATEGORIES = [
  c("dress-material", "Dress Material", "ladies-wear"),
  c("maxi", "Maxi", "ladies-wear"),
  c("gown", "Gown", "ladies-wear"),
  c("fall-and-astar", "Fall and Astar", "ladies-wear"),
  c("saree", "Saree", "ladies-wear"),
];
export const bySlug = Object.fromEntries(CATEGORIES.map((x) => [x.slug, x]));
export const allBySlug = Object.fromEntries([...CATEGORIES, ...LEGACY_CATEGORIES].map((x) => [x.slug, x]));
export const groupBySlug = Object.fromEntries(GROUPS.map((x) => [x.slug, x]));
export const catName = (slug) => allBySlug[slug]?.name || slug || "";
export const slugsInGroup = (g) => CATEGORIES.filter((x) => x.group === g).map((x) => x.slug);
