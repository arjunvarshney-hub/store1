// Rich-text safety. The admin editor produces HTML; customers must only ever receive a small, safe subset.
// Allow-list sanitizer (no dependencies): unknown tags are dropped but their text is kept; scripts/styles/frames are
// removed WITH their content; every attribute is removed except a validated link address and a text-alignment class.
const DANGEROUS = new Set(["script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "svg", "math", "template", "noscript", "textarea", "title", "head", "form", "select", "button", "link", "meta", "base"]);
const MAP = { b: "strong", strong: "strong", i: "em", em: "em", u: "u", p: "p", div: "p", h1: "h2", h2: "h2", h3: "h3", h4: "h4", h5: "h4", h6: "h4", ul: "ul", ol: "ol", li: "li", blockquote: "blockquote", br: "br", a: "a" };
const BLOCK = new Set(["p", "h2", "h3", "h4", "ul", "ol", "blockquote"]);
const TEXTY = new Set(["p", "h2", "h3", "h4"]);   // cannot contain other blocks
const ALIGN_OK = new Set(["left", "center", "right", "justify"]);
const SAFE_HREF = /^(https?:\/\/[^\s"'<>`]+|mailto:[^\s"'<>`]+|tel:[+0-9()\-\s]{4,30})$/i;

export const escapeText = (s) => String(s).replace(/&(?!#?[a-zA-Z0-9]{1,10};)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const decodeEntities = (s) => String(s).replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/gi, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", nbsp: " " }[e.toLowerCase()]));

function attr(attrs, name) {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i").exec(attrs);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? "") : "";
}
function alignOf(attrs) {
  const st = /text-align\s*:\s*(left|right|center|justify)/i.exec(attr(attrs, "style"));
  const al = attr(attrs, "align").toLowerCase();
  const cl = /\bta-(left|right|center|justify)\b/.exec(attr(attrs, "class"));
  const v = (st?.[1] || al || cl?.[1] || "").toLowerCase();
  return ALIGN_OK.has(v) && v !== "left" ? v : "";
}

export function sanitizeHtml(input, { max = 20000 } = {}) {
  const src = String(input ?? "").slice(0, max * 2);
  const out = []; const stack = []; let skip = null, skipDepth = 0;
  const closeTop = () => out.push(`</${stack.pop()}>`);
  const closeTo = (name) => { if (!stack.includes(name)) return; while (stack.length) { const t = stack[stack.length - 1]; closeTop(); if (t === name) break; } };
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g;
  let m;
  while ((m = re.exec(src))) {
    const tok = m[0];
    if (tok.startsWith("<!--")) continue;
    if (!m[2]) { if (!skip) out.push(escapeText(tok)); continue; }               // text, or a stray "<"
    const closing = m[1] === "/", raw = m[2].toLowerCase(), attrs = m[3] || "", selfClose = /\/\s*$/.test(attrs);
    if (skip) { if (raw === skip) { if (closing) { if (--skipDepth <= 0) skip = null; } else if (!selfClose) skipDepth++; } continue; }
    if (DANGEROUS.has(raw)) { if (!closing && !selfClose) { skip = raw; skipDepth = 1; } continue; }
    let name = MAP[raw];
    if (!name) continue;                                                           // unknown tag: drop tag, keep its text
    if (closing) { if (name !== "br") closeTo(name); continue; }
    if (name === "br") { out.push("<br>"); continue; }
    if (name === "li" && !stack.includes("ul") && !stack.includes("ol")) name = "p";
    if (name === "a") {
      const href = attr(attrs, "href").trim();
      if (!SAFE_HREF.test(href) || stack.includes("a")) continue;                  // bad link: keep text only
      out.push(`<a href="${escAttr(href)}" rel="noopener noreferrer nofollow" target="_blank">`); stack.push("a"); continue;
    }
    if (BLOCK.has(name)) while (stack.length && (TEXTY.has(stack[stack.length - 1]) || stack[stack.length - 1] === "a" || ["strong", "em", "u"].includes(stack[stack.length - 1]))) closeTop();
    if (name === "li") while (stack.length && stack[stack.length - 1] === "li") closeTop();
    const al = ["p", "h2", "h3", "h4", "li"].includes(name) ? alignOf(attrs) : "";
    out.push(`<${name}${al ? ` class="ta-${al}"` : ""}>`); stack.push(name);
  }
  while (stack.length) closeTop();
  let html = out.join("").replace(/<(p|h2|h3|h4|li|strong|em|u)>\s*<\/\1>/g, "").trim();
  if (html.length > max) html = html.slice(0, max).replace(/<[^>]*$/, "");
  return html;
}
/** Plain text version (search, SEO description, assistant). */
export function htmlToText(html) {
  return decodeEntities(String(html ?? "").replace(/<\s*(br|\/p|\/li|\/h[2-4]|\/blockquote)\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""))
    .replace(/[ \t\u00a0]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").replace(/ *\n */g, "\n").trim();
}
