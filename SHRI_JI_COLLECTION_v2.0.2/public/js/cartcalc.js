// Cart maths shared by the cart and checkout pages (display only: the server recalculates everything when the order is placed).
import { effPrice } from "./render.js";
import { deliveryFee, freeDeliveryRemaining, round2 } from "./delivery.js";

/** items = cart lines [{id,size,qty,v}], products = {id: product (with variants)} */
export function resolveLines(items, products) {
  const lines = items.map((i) => {
    const p = products[i.id];
    if (!p) return { i, bad: "No longer available" };
    const vars = Array.isArray(p.variants) ? p.variants : [];
    let v = null, unit, stock, pack, label = "";
    if (vars.length) {
      v = vars.find((x) => x.id === i.v);
      if (!v || !v.available) return { i, p, bad: "Please remove it and choose the options again" };
      unit = effPrice(v); stock = Number(v.stock); pack = Math.max(1, Number(v.pack_qty) || 1); label = v.label;
    } else {
      if (p.sizes?.length && !p.sizes.includes(i.size)) return { i, p, bad: "Please remove it and add again with a size" };
      unit = effPrice(p); stock = Number(p.stock); pack = Math.max(1, Number(p.pack_size) || 1);
    }
    const max = Math.min(50, Math.floor(stock / pack));
    if (max < 1) return { i, p, bad: "Sold out" };
    const qty = Math.min(i.qty, max);
    return { i, p, v, unit, pack, label, max, qty, trimmed: qty < i.qty, size: i.size };
  });
  // Minimum order quantity is checked on the combined quantity of every line of the same product.
  const per = {};
  for (const l of lines) if (!l.bad) per[l.p.id] = (per[l.p.id] || 0) + l.qty;
  for (const l of lines) if (!l.bad) { const min = Math.max(1, Number(l.p.min_order_qty) || 1); if ((per[l.p.id] || 0) < min) l.minIssue = min; }
  return lines;
}
export function summarize(lines, tiers) {
  const good = lines.filter((l) => !l.bad);
  const sub = round2(good.reduce((n, l) => n + l.unit * l.qty, 0));
  const fee = good.length ? deliveryFee(sub, tiers) : 0;
  return { sub, fee, total: round2(sub + fee), remaining: good.length ? freeDeliveryRemaining(sub, tiers) : 0 };
}
export const packText = (l) => (l.pack > 1 ? `Pack of ${l.pack} (${l.pack} pieces per pack)` : "");
export const nonReturnable = (lines) => lines.filter((l) => !l.bad && l.p.return_eligible === false).map((l) => l.p.name);
