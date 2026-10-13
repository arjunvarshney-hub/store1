import { route } from "../../_lib.js";
import { getSettings, loadCategories, publicCategories } from "../../_catalog.js";
export default route(["GET"], async (req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  await loadCategories();
  res.json({ settings: await getSettings(), categories: publicCategories() });
});
