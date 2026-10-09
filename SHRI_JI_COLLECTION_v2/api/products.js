// Public catalogue (active products only; enforced by RLS because this uses the anon key).
import { route, shippingRule, HttpError } from "./_lib.js";
import { queryProducts } from "./_catalog.js";

export default route(["GET"], async (req, res) => {
  const q = req.query || {};
  let ids;
  if (q.ids) {
    ids = String(q.ids).split(",").map(Number).filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, 30);
    if (!ids.length) throw new HttpError(400, "Invalid ids");
  }
  const out = await queryProducts({ ids, slug: q.slug, category: q.category, group: q.group, q: q.q, sort: q.sort, page: q.page, pageSize: 24 });
  res.setHeader("Cache-Control", ids ? "no-store" : "public, s-maxage=30, stale-while-revalidate=300");
  res.json({ ...out, shipping: shippingRule() });
});
