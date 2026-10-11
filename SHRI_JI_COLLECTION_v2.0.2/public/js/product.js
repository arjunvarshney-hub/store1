import { api, cart, esc, $, $$, msg, toast, money } from "./common.js";
import { priceFor } from "./render.js";

const pdp = $("#pdp");
if (pdp) {
  const id = Number(pdp.dataset.id), baseStock = Number(pdp.dataset.stock) || 0;
  const variants = $$('input[name="variant"]', pdp);
  const hasVariants = variants.length > 0;
  let currentVariant = null;
  let pack = Math.max(1, Number(pdp.dataset.pack) || 1);
  let minimum = Math.max(1, Number(pdp.dataset.min) || 1);
  let availablePackages = Math.floor(baseStock / pack);
  let qty = minimum;
  const out = $("#qVal"), status = $("#pdpMsg"), add = $("#addBtn");
  const main = $("#galMain");
  const photos = $$(".th", pdp);
  let photoIndex = 0;
  const showPhoto = (idx) => {
    if (!photos.length || !main) return;
    photoIndex = (idx + photos.length) % photos.length;
    const b = photos[photoIndex], im = $("img", main);
    if (im) { im.src = b.dataset.src; im.alt = `${pdp.dataset.name} photo ${photoIndex + 1}`; im.classList.remove("zoomed"); }
    photos.forEach((x, i) => x.classList.toggle("on", i === photoIndex));
    const count = $("#galCount"); if (count) count.textContent = `${photoIndex + 1}/${photos.length}`;
    const zoom = $("#galZoom"); if (zoom) zoom.textContent = "⌕";
  };
  photos.forEach((b, i) => { b.addEventListener("click", () => showPhoto(i)); });
  let startX = null;
  main?.addEventListener("touchstart", (e) => { startX = e.changedTouches?.[0]?.clientX ?? null; }, { passive: true });
  main?.addEventListener("touchend", (e) => {
    if (startX == null) return;
    const dx = (e.changedTouches?.[0]?.clientX ?? startX) - startX;
    if (Math.abs(dx) > 40) showPhoto(photoIndex + (dx < 0 ? 1 : -1));
    startX = null;
  }, { passive: true });
  // Pointer fallback supports trackpads / mouse drag without requiring small arrows.
  main?.addEventListener("pointerdown", (e) => { if (e.pointerType === "mouse") startX = e.clientX; });
  main?.addEventListener("pointerup", (e) => { if (startX == null || e.pointerType !== "mouse") return; const dx = e.clientX - startX; if (Math.abs(dx) > 40) showPhoto(photoIndex + (dx < 0 ? 1 : -1)); startX = null; });
  $("#galZoom")?.addEventListener("click", () => {
    const im = $("img", main); if (!im) return;
    im.classList.toggle("zoomed"); $("#galZoom").textContent = im.classList.contains("zoomed") ? "−" : "⌕";
  });
  main?.querySelector("img")?.addEventListener("click", () => { const im = $("img", main); if (im) { im.classList.toggle("zoomed"); $("#galZoom").textContent = im.classList.contains("zoomed") ? "−" : "⌕"; } });

  const showQty = () => { if (out) out.textContent = qty; };
  const setPrice = (regular, sale) => {
    const reg = Number(regular) || 0, sp = sale === "" || sale == null ? NaN : Number(sale), eff = sp > 0 && sp < reg ? sp : reg;
    const value = $("#priceValue"), regularEl = $("#regularPrice"), off = $("#discountValue");
    if (value) value.textContent = money(eff);
    if (regularEl) { regularEl.textContent = money(reg); regularEl.hidden = !(sp > 0 && sp < reg); }
    if (off) { off.textContent = reg > 0 && eff < reg ? `${Math.round((1 - eff / reg) * 100)}% off` : ""; off.hidden = !(reg > 0 && eff < reg); }
  };
  const updateVariant = () => {
    currentVariant = variants.find((x) => x.checked) || null;
    if (!currentVariant) { add.disabled = true; if (status) { status.textContent = "Please choose an option."; status.className = "sm muted"; } return; }
    pack = Math.max(1, Number(currentVariant.dataset.pack) || 1);
    minimum = Math.max(1, Number(currentVariant.dataset.min) || 1);
    availablePackages = Math.floor((Number(currentVariant.dataset.stock) || 0) / pack);
    qty = availablePackages >= minimum ? minimum : Math.max(1, availablePackages);
    showQty(); setPrice(currentVariant.dataset.price, currentVariant.dataset.sale);
    const detail = $("#variantDetail");
    if (detail) detail.textContent = availablePackages < minimum ? "This option is currently unavailable." : `Pack contains ${pack} piece(s). Minimum order: ${minimum} package(s). Available: ${availablePackages} package(s).`;
    if (add) add.disabled = availablePackages < minimum;
    if (status) { status.textContent = ""; status.className = "sm"; }
    const unit = $("#qtyUnit"); if (unit) unit.textContent = `(packages · ${pack} piece${pack === 1 ? "" : "s"} each)`;
  };
  variants.forEach((v) => v.addEventListener("change", updateVariant));
  if (!hasVariants) showQty();

  $("#qMinus")?.addEventListener("click", () => { qty = Math.max(minimum, qty - 1); showQty(); });
  $("#qPlus")?.addEventListener("click", () => { if (qty < Math.min(100, availablePackages)) { qty++; showQty(); } else toast(`Only ${availablePackages} package(s) available`); });
  add?.addEventListener("click", () => {
    if (hasVariants && !currentVariant) { if (status) { status.textContent = "Please select a colour, design or pack option."; status.className = "sm warn"; } $(".variants", pdp)?.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    const hasSizes = !hasVariants && $$('input[name="size"]', pdp).length > 0;
    const size = !hasVariants ? $('input[name="size"]:checked', pdp)?.value || "" : "";
    if (hasSizes && !size) { status.textContent = "Please select a size."; status.className = "sm warn"; $(".sizes", pdp)?.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    if (qty < minimum) { if (status) status.textContent = `Minimum order quantity is ${minimum}.`; return; }
    if (qty > availablePackages) { if (status) status.textContent = "Quantity exceeds available stock."; return; }
    cart.add(id, size, qty, currentVariant?.value || "");
    if (status) { status.textContent = "Added to your cart."; status.className = "sm ok"; }
    $("#goCart").hidden = false; toast("Added to cart");
  });
}

// Product reviews are guest-friendly, server-validated, and held for moderation before publication.
const reviewForm = $("#reviewForm");
if (reviewForm) {
  reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = $("#reviewMsg"), button = $("#reviewSubmit");
    const form = new FormData(reviewForm);
    const name = String(form.get("name") || "").trim();
    const rating = Number(form.get("rating"));
    const comment = String(form.get("comment") || "").trim();
    if (name.length < 2 || name.length > 80) { msg(status, "Enter your name (2–80 characters)."); return; }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) { msg(status, "Choose a rating from 1 to 5 stars."); return; }
    if (comment.length < 5 || comment.length > 1000) { msg(status, "Write a review of 5–1,000 characters."); return; }
    button.disabled = true; button.textContent = "Submitting…"; msg(status, "");
    try {
      const result = await api("/api/products?action=reviews", {
        method: "POST",
        body: { productId: Number($("#pdp")?.dataset.id), name, rating, comment, website: String(form.get("website") || "") },
      });
      msg(status, result.message || "Thank you. Your review has been submitted for approval.", "ok");
      reviewForm.reset();
      toast("Review submitted");
    } catch (error) {
      msg(status, error.message);
    } finally {
      button.disabled = false; button.textContent = "Submit review";
    }
  });
}
