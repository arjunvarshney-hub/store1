// SHRI JI Assistant. Product facts come from the existing server-side catalogue endpoint.
// Never place an AI provider key in browser code.
const isStorefrontPath = () => {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (["/admin", "/cart", "/checkout", "/account", "/404"].includes(path)) return false;
  return path === "/" || path === "/shop" || path.startsWith("/category/") || path.startsWith("/product/");
};
const make = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};
const rupees = (value) => "₹" + Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export function initAssistant() {
  if (!isStorefrontPath() || document.querySelector(".sjc-assistant-launcher")) return;

  const launcher = make("button", "sjc-assistant-launcher");
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Ask SHRI JI Assistant for shopping help");
  launcher.setAttribute("aria-expanded", "false");
  launcher.setAttribute("aria-controls", "sjcAssistantPanel");
  launcher.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.5-3A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8 11h8M8 14h5"/></svg><span>Need help?</span>';

  const panel = make("section", "sjc-assistant-panel");
  panel.id = "sjcAssistantPanel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "SHRI JI Assistant shopping help");
  panel.innerHTML = `
    <header class="sjc-assistant-head">
      <div class="sjc-assistant-mark" aria-hidden="true">SJC</div>
      <div class="sjc-assistant-headcopy"><h2>SHRI JI Assistant</h2><p>Help finding your next favourite</p></div>
      <button type="button" class="sjc-assistant-close" aria-label="Close shopping assistant">×</button>
    </header>
    <div class="sjc-assistant-mode" id="sjcAssistantMode" role="status">Connecting to shop catalogue…</div>
    <div class="sjc-assistant-quick" aria-label="Suggested questions">
      <button type="button" data-prompt="Show me Laddu Gopal Poshak">Laddu Gopal Poshak</button>
      <button type="button" data-prompt="Show Ladies Wear">Ladies Wear</button>
      <button type="button" data-prompt="Find products under ₹500">Under ₹500</button>
      <button type="button" data-prompt="Which payment options are available?">Payment help</button>
    </div>
    <div class="sjc-assistant-messages" id="sjcAssistantMessages" aria-live="polite" aria-relevant="additions"></div>
    <form class="sjc-assistant-compose" id="sjcAssistantForm">
      <label class="sjc-assistant-sr" for="sjcAssistantInput">Your question</label>
      <textarea id="sjcAssistantInput" name="message" rows="1" maxlength="1000" placeholder="Ask about products, colour, size or budget…" enterkeyhint="send" required></textarea>
      <button type="submit" class="sjc-assistant-send" aria-label="Send message">Send</button>
    </form>
    <p class="sjc-assistant-disclaimer">Product prices and availability are confirmed on the product page and at checkout. Please do not share passwords, payment secrets or private order details here.</p>`;

  document.body.append(launcher, panel);
  const closeButton = panel.querySelector(".sjc-assistant-close");
  const modeEl = panel.querySelector("#sjcAssistantMode");
  const messagesEl = panel.querySelector("#sjcAssistantMessages");
  const form = panel.querySelector("#sjcAssistantForm");
  const input = panel.querySelector("#sjcAssistantInput");
  const sendButton = panel.querySelector(".sjc-assistant-send");
  const history = [];
  let config = { enabled: true, aiConfigured: false };
  let waiting = false;

  function scrollMessages() { messagesEl.scrollTop = messagesEl.scrollHeight; }
  function setOpen(open) {
    panel.hidden = !open;
    launcher.setAttribute("aria-expanded", String(open));
    launcher.hidden = open;
    if (open) input.focus(); else launcher.focus();
  }
  function addMessage(role, text) {
    const wrap = make("article", `sjc-assistant-message ${role === "user" ? "is-user" : "is-assistant"}`);
    const who = make("div", "sjc-assistant-who", role === "user" ? "You" : "SHRI JI Assistant");
    const content = make("p", "sjc-assistant-text", text);
    wrap.append(who, content);
    messagesEl.append(wrap);
    scrollMessages();
    return wrap;
  }
  function addProductCards(products) {
    const ready = (Array.isArray(products) ? products : []).filter((p) => p?.inStock && p?.slug && Number.isFinite(Number(p.currentPrice))).slice(0, 4);
    if (!ready.length) return;
    const container = make("div", "sjc-assistant-products");
    ready.forEach((p) => {
      const card = make("a", "sjc-assistant-product");
      card.href = "/product/" + encodeURIComponent(String(p.slug));
      const imgUrl = typeof p.imageUrl === "string" && (/^https:\/\//i.test(p.imageUrl) || /^\/[^/]/.test(p.imageUrl)) ? p.imageUrl : "";
      if (imgUrl) {
        const img = make("img", "sjc-assistant-product-img");
        img.src = imgUrl;
        img.alt = String(p.name || "Product");
        img.loading = "lazy";
        img.width = 72; img.height = 88;
        img.addEventListener("error", () => img.remove(), { once: true });
        card.append(img);
      }
      const copy = make("span", "sjc-assistant-product-copy");
      copy.append(make("b", "", String(p.name || "Product")), make("span", "sjc-assistant-product-price", rupees(p.currentPrice)));
      if (p.reviewCount > 0 && Number.isFinite(Number(p.averageRating))) {
        copy.append(make("span", "sjc-assistant-product-rating", `★ ${Number(p.averageRating).toFixed(1)} · ${Number(p.reviewCount)} review${Number(p.reviewCount) === 1 ? "" : "s"}`));
      }
      copy.append(make("span", "sjc-assistant-product-link", "View product →"));
      card.append(copy);
      container.append(card);
    });
    if (container.childElementCount) messagesEl.append(container);
    scrollMessages();
  }

  async function sendMessage(text) {
    const message = String(text || "").trim();
    if (!message || waiting) return;
    if (message.length > 1000) { addMessage("assistant", "Please shorten your question to 1,000 characters or less."); return; }
    addMessage("user", message);
    waiting = true;
    input.disabled = true;
    sendButton.disabled = true;
    sendButton.textContent = "…";
    const pending = addMessage("assistant", "One moment — checking the shop catalogue…");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: history.slice(-4) }),
      });
      let data = {};
      try { data = await response.json(); } catch { /* server may return a non-JSON error */ }
      if (!response.ok) throw new Error(data.error || "The assistant couldn't answer right now. Please try again.");
      pending.querySelector(".sjc-assistant-text").textContent = String(data.reply || "I couldn't prepare a reply. Please try another question.");
      if (data.mode === "ai") {
        modeEl.textContent = "AI shopping assistant · Uses current shop catalogue";
      } else {
        modeEl.textContent = "Basic catalogue help · Live AI setup pending or unavailable";
      }
      history.push({ role: "user", content: message }, { role: "assistant", content: String(data.reply || "") });
      if (history.length > 8) history.splice(0, history.length - 8);
      addProductCards(data.products);
    } catch (error) {
      pending.querySelector(".sjc-assistant-text").textContent = error?.message || "I couldn't connect. Please try again in a moment.";
      modeEl.textContent = "Connection issue · The store itself is still available";
    } finally {
      waiting = false;
      input.disabled = false;
      sendButton.disabled = false;
      sendButton.textContent = "Send";
      input.focus();
      scrollMessages();
    }
  }

  launcher.addEventListener("click", () => setOpen(true));
  closeButton.addEventListener("click", () => setOpen(false));
  panel.querySelectorAll("[data-prompt]").forEach((button) => button.addEventListener("click", () => sendMessage(button.dataset.prompt)));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = input.value;
    input.value = "";
    sendMessage(value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !panel.hidden) setOpen(false); });

  // Keep the floating launcher away from important purchase/review actions on product pages.
  if ("IntersectionObserver" in window) {
    const actionTargets = ["#addBtn", "#reviewSubmit", ".buy"].map((selector) => document.querySelector(selector)).filter(Boolean);
    if (actionTargets.length) {
      const observer = new IntersectionObserver((entries) => {
        const actionVisible = entries.some((entry) => entry.isIntersecting);
        launcher.hidden = actionVisible || !panel.hidden;
        if (actionVisible && !panel.hidden) panel.hidden = true;
      }, { threshold: 0.08 });
      actionTargets.forEach((target) => observer.observe(target));
    }
  }

  addMessage("assistant", "Namaste! I can help you explore Thakur Ji Poshak and Ladies Wear. Tell me the product type, colour, size or budget you have in mind.");
  fetch("/api/assistant", { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then((r) => r.ok ? r.json() : null)
    .then((data) => {
      if (data && data.enabled === false) { launcher.remove(); panel.remove(); return; }
      if (data) {
        config = data;
        modeEl.textContent = config.aiConfigured ? "AI shopping assistant · Current catalogue" : "Basic catalogue help · Live AI setup pending";
      }
    }).catch(() => { modeEl.textContent = "Catalogue connection unavailable right now"; });
}
