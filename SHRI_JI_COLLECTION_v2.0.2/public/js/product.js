import { cart, $, $$, toast } from "./common.js";

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
