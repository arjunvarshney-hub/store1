// POST /api/orders = create order. Also: ?action=my (/api/orders/my), pay (/api/pay), verify (/api/verify-payment).
import create from "./_routes/orders/create.js";
import my from "./_routes/orders/my.js";
import pay from "./_routes/orders/pay.js";
import verify from "./_routes/orders/verify.js";
import returns from "./_routes/orders/returns.js";
import returnPhoto from "./_routes/orders/return-photo.js";
import cancellations from "./_routes/orders/cancellations.js";
const actions = { my, pay, verify, returns, cancellations, "return-photo": returnPhoto };
export default (req, res) => {
  const a = req.query?.action;
  if (!a) return create(req, res);
  return Object.hasOwn(actions, a) ? actions[a](req, res) : res.status(404).json({ error: "Not found" });
};
