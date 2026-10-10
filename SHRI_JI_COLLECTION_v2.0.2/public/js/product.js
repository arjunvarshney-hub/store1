import { api, cart, $, $$, msg, toast } from "./common.js";

const pdp = $("#pdp");
if (pdp) {
  const id = Number(pdp.dataset.id), stock = Number(pdp.dataset.stock);
  const max = Math.max(1, Math.min(10, stock));
  let qty = 1;
  const out = $("#qVal"), msg = $("#pdpMsg");
  const show = () => { out.textContent = qty; };
  // gallery
  $$(".th", pdp).forEach((b) => b.addEventListener("click", () => {
    const main = $("#galMain img"); if (main) { main.src = b.dataset.src; main.removeAttribute("loading"); }
    $$(".th", pdp).forEach((x) => x.classList.toggle("on", x === b));
  }));
  $("#qMinus")?.addEventListener("click", () => { qty = Math.max(1, qty - 1); show(); });
  $("#qPlus")?.addEventListener("click", () => { if (qty < max) qty++; else toast(`Only ${max} available`); show(); });
  $("#addBtn")?.addEventListener("click", () => {
    const hasSizes = $$('input[name="size"]', pdp).length > 0;
    const size = $('input[name="size"]:checked', pdp)?.value || "";
    if (hasSizes && !size) { msg.textContent = "Please select a size."; msg.className = "sm warn"; $(".sizes")?.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    cart.add(id, size, qty);
    msg.textContent = "Added to your cart."; msg.className = "sm";
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
