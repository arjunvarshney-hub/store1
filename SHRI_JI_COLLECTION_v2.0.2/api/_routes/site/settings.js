import { route } from "../../_lib.js";
import { getSettings } from "../../_catalog.js";
export default route(["GET"], async (req, res) => {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.json({ settings: await getSettings() });
});
