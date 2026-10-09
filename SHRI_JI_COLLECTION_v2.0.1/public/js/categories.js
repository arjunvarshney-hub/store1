// Single source of truth for categories (used by the server API and the browser).
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
  c("kurti", "Kurti", "ladies-wear"),
  c("suit", "Suit", "ladies-wear"),
  c("dupatta", "Dupatta", "ladies-wear"),
  c("dress-material", "Dress Material", "ladies-wear"),
  c("plazo", "Plazo", "ladies-wear"),
  c("maxi", "Maxi", "ladies-wear"),
  c("gown", "Gown", "ladies-wear"),
  c("fall-and-astar", "Fall and Astar", "ladies-wear"),
];
export const bySlug = Object.fromEntries(CATEGORIES.map((x) => [x.slug, x]));
export const groupBySlug = Object.fromEntries(GROUPS.map((x) => [x.slug, x]));
export const catName = (slug) => bySlug[slug]?.name || slug || "";
export const slugsInGroup = (g) => CATEGORIES.filter((x) => x.group === g).map((x) => x.slug);
