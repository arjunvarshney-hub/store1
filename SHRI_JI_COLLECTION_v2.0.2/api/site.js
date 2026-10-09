// /sitemap.xml and /robots.txt (rewritten to ?action=).
import sitemap from "./_routes/site/sitemap.js";
import robots from "./_routes/site/robots.js";
export default (req, res) => (req.query?.action === "robots" ? robots(req, res) : sitemap(req, res));
