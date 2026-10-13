import { api, cart, $, $$, msg, toast, esc, money } from "./common.js";

const pdp = $("#pdp");
if (pdp) {
  const id = Number(pdp.dataset.id), minQ = Number(pdp.dataset.min) || 1;
  const variants = JSON.parse(pdp.dataset.variants || "[]"), axes = JSON.parse(pdp.dataset.axes || "[]");
  const baseStock = Number(pdp.dataset.stock) || 0, basePack = Number(pdp.dataset.pack) || 1;
  let qty = minQ; const sel = {};
  const out = $("#qVal"), note = $("#pdpMsg");
  const eff = (o) => (o.sale_price && o.sale_price < o.price ? o.sale_price : o.price);
  const ok = (v) => v.available && v.stock >= v.pack_qty;
  const fits = (v, except) => axes.every((a) => a === except || !sel[a] || v.options[a] === sel[a]);
  const chosen = () => (variants.length && axes.every((a) => sel[a] || !variants.some((v) => v.options[a])) ? variants.find((v) => ok(v) && axes.every((a) => (v.options[a] || "") === (sel[a] || ""))) : null);
  const maxFor = (v) => Math.max(0, Math.min(50, Math.floor((v ? v.stock / v.pack_qty : baseStock / basePack))));

  function drawOptions() {
    const box = $("#opts"); if (!box) return;
    box.innerHTML = axes.map((a) => {
      const values = [...new Set(variants.map((v) => v.options[a]).filter(Boolean))];
      return `<fieldset class="optgrp"><legend>${esc(a)}</legend><div class="optrow" role="radiogroup" aria-label="${esc(a)}">${values.map((val) => {
        const can = variants.some((v) => ok(v) && v.options[a] === val && fits(v, a));
        return `<button type="button" class="opt${sel[a] === val ? " on" : ""}" role="radio" aria-checked="${sel[a] === val}" data-a="${esc(a)}" data-v="${esc(val)}" ${can ? "" : "disabled"}>${esc(val)}</button>`;
      }).join("")}</div></fieldset>`;
    }).join("");
  }
  function update() {
    const v = chosen(), pb = $("#priceBox"), stockNote = $("#stockNote"), pack = $("#packInfo");
    if (variants.length) {
      if (v) {
        pb.innerHTML = `<b>${money(eff(v))}</b>${eff(v) < v.price ? ` <s>${money(v.price)}</s> <span class="off">${Math.round((1 - eff(v) / v.price) * 100)}% off</span>` : ""}`;
        if (v.sku && $("#skuNow")) $("#skuNow").textContent = v.sku;
      }
    }
    const max = maxFor(v), packQ = v ? v.pack_qty : basePack;
    if (qty > max && max > 0) qty = max;
    if (qty < minQ) qty = Math.min(minQ, Math.max(max, 1));
    if (out) out.textContent = qty;
    if (pack) pack.textContent = packQ > 1 ? `Pack of ${packQ}: each pack has ${packQ} pieces. Ordering ${qty} = ${qty * packQ} pieces.` : "";
    if (stockNote) stockNote.textContent = (variants.length ? v : true) && max > 0 && max <= 5 ? `Only ${max} ${packQ > 1 ? "pack" + (max === 1 ? "" : "s") : ""} left`.replace("  ", " ") : "";
  }
  pdp.addEventListener("click", (e) => {
    const o = e.target.closest(".opt");
    if (o && !o.disabled) { const a = o.dataset.a; sel[a] = sel[a] === o.dataset.v ? "" : o.dataset.v; $("#optMsg").textContent = ""; drawOptions(); update(); $(`.opt.on[data-a="${CSS.escape(a)}"]`, pdp)?.focus(); }
  });
  $("#qMinus")?.addEventListener("click", () => { if (qty <= minQ) toast(`Minimum order is ${minQ}`); qty = Math.max(minQ, qty - 1); update(); });
  $("#qPlus")?.addEventListener("click", () => { const max = maxFor(chosen()); if (qty < max) qty++; else toast(`Only ${max} available`); update(); });
  $("#addBtn")?.addEventListener("click", () => {
    const v = chosen();
    if (variants.length && !v) {
      const miss = axes.filter((a) => variants.some((x) => x.options[a]) && !sel[a]);
      $("#optMsg").textContent = miss.length ? `Please choose: ${miss.join(", ")}.` : "This combination is not available. Please choose another option.";
      $("#opts")?.scrollIntoView({ block: "center", behavior: "smooth" }); return;
    }
    const hasSizes = $$('input[name="size"]', pdp).length > 0, size = $('input[name="size"]:checked', pdp)?.value || "";
    if (hasSizes && !size) { note.textContent = "Please select a size."; note.className = "sm warn"; $(".sizes")?.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    if (qty < minQ) { note.textContent = `Minimum order is ${minQ}.`; note.className = "sm warn"; return; }
    cart.add(id, size, qty, v ? v.id : 0);
    note.textContent = "Added to your cart."; note.className = "sm";
    $("#goCart").hidden = false; toast("Added to cart");
  });
  drawOptions(); update();

  // ----- photo gallery: natural swipe (scroll-snap), thumbnails, "1 / 5" counter, tap-to-zoom -----
  const track = $("#galTrack"), count = $("#galCount"), ths = $$(".gal-th .th", pdp), n = Number($("#gal")?.dataset.n) || 0;
  const slideW = () => track.clientWidth || 1;
  const cur = () => Math.max(0, Math.min(n - 1, Math.round(track.scrollLeft / slideW())));
  const mark = () => { const i = cur(); if (count) count.textContent = `${i + 1} / ${n}`; ths.forEach((t, k) => t.classList.toggle("on", k === i)); };
  const goTo = (i) => track.scrollTo({ left: i * slideW(), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  if (track && n > 1) {
    let raf; track.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(mark); }, { passive: true });
    ths.forEach((t) => t.addEventListener("click", () => goTo(Number(t.dataset.i))));
    track.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { e.preventDefault(); goTo(Math.min(n - 1, cur() + 1)); } if (e.key === "ArrowLeft") { e.preventDefault(); goTo(Math.max(0, cur() - 1)); } });
  }
  const lb = $("#lightbox"), lbImg = $("#lbImg"), lbCount = $("#lbCount"), lbScroll = $("#lbScroll");
  if (lb && n) {
    const srcs = $$(".gal-zoom img", pdp).map((im) => im.currentSrc || im.src);
    let at = 0, sx = 0, last = null;
    const show = (i) => { at = (i + n) % n; lbImg.src = srcs[at]; lbImg.alt = `Photo ${at + 1} of ${n}`; lbImg.classList.remove("zoomed"); lbScroll.scrollTo(0, 0); if (lbCount) lbCount.textContent = `${at + 1} / ${n}`; };
    const open = (i) => { last = document.activeElement; show(i); lb.hidden = false; document.body.style.overflow = "hidden"; $("#lbX").focus(); };
    const close = () => { lb.hidden = true; document.body.style.overflow = ""; goTo(at); last?.focus?.(); };
    $$(".gal-zoom", pdp).forEach((b) => b.addEventListener("click", () => open(Number(b.dataset.i))));
    $("#lbX").addEventListener("click", close);
    $("#lbPrev")?.addEventListener("click", () => show(at - 1)); $("#lbNext")?.addEventListener("click", () => show(at + 1));
    lbImg.addEventListener("click", () => lbImg.classList.toggle("zoomed"));
    lb.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", (e) => { const dx = e.changedTouches[0].clientX - sx; if (!lbImg.classList.contains("zoomed") && Math.abs(dx) > 60 && n > 1) show(at + (dx < 0 ? 1 : -1)); }, { passive: true });
    document.addEventListener("keydown", (e) => { if (lb.hidden) return; if (e.key === "Escape") close(); if (e.key === "ArrowRight") show(at + 1); if (e.key === "ArrowLeft") show(at - 1); });
  }
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
