// /api/admin/products and /api/admin/orders (rewritten to ?action=). Both re-check admin rights on every call.
import products from "./_routes/admin/products.js";
import orders from "./_routes/admin/orders.js";
const actions = { products, orders };
export default (req, res) => {
  const h = Object.hasOwn(actions, req.query?.action) ? actions[req.query.action] : null;
  return h ? h(req, res) : res.status(404).json({ error: "Not found" });
};
