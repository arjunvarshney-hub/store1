// /sitemap.xml, /robots.txt and /api/site-settings (rewritten to ?action=).
import sitemap from "./_routes/site/sitemap.js";
import robots from "./_routes/site/robots.js";
import settings from "./_routes/site/settings.js";
export default (req, res) => {
  const a = req.query?.action;
  return a === "robots" ? robots(req, res) : a === "settings" ? settings(req, res) : sitemap(req, res);
};
