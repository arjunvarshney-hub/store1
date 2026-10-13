// Delivery charge rules. ONE definition used by the server (authoritative), the cart and the checkout page.
//   subtotal below ₹499          -> ₹50
//   ₹499 up to ₹999.99           -> ₹40
//   ₹1,000 or more               -> FREE
// "subtotal" = merchandise value AFTER product discounts (sale prices), BEFORE delivery, taxes or other fees.
export const DELIVERY_TIERS = [{ min: 0, fee: 50 }, { min: 499, fee: 40 }, { min: 1000, fee: 0 }];
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sorted = (tiers) => [...(Array.isArray(tiers) && tiers.length ? tiers : DELIVERY_TIERS)].sort((a, b) => a.min - b.min);

export function deliveryFee(subtotal, tiers = DELIVERY_TIERS) {
  const s = round2(subtotal);
  let fee = sorted(tiers)[0].fee;
  for (const t of sorted(tiers)) if (s >= t.min) fee = t.fee;
  return fee;
}
/** Rupees still needed to reach free delivery (0 when already free or no free tier exists). */
export function freeDeliveryRemaining(subtotal, tiers = DELIVERY_TIERS) {
  const free = sorted(tiers).find((t) => t.fee === 0);
  if (!free) return 0;
  return Math.max(0, round2(free.min - round2(subtotal)));
}
