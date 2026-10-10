import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, "../public/style.css"), "utf8");

test("mobile hero actions stack and stay full width on phone screens", () => {
  assert.match(css, /@media\s*\(max-width:\s*599px\)/);
  assert.match(css, /\.cta\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.cta\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.cta \.btn\s*\{[^}]*width:\s*100%/s);
});

test("department product photos preserve garment/poshak details instead of cropping", () => {
  assert.match(css, /\.department-art img\s*\{[^}]*object-fit:\s*contain/s);
});

test("phone assistant launcher is compact and retains screen-reader label", () => {
  assert.match(css, /\.sjc-assistant-launcher\s*\{[^}]*width:\s*48px[^}]*height:\s*48px/s);
  assert.match(css, /\.sjc-assistant-launcher span\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/s);
});

test("very narrow phones have a compact header without hiding the menu search", () => {
  assert.match(css, /@media\s*\(max-width:\s*359px\)/);
  assert.match(css, /\.actions \.sbtn\s*\{[^}]*display:\s*none/s);
  assert.match(css, /\.msearch/);
});

test("landscape phones keep a compact assistant launcher and viewport-bound chat panel", () => {
  assert.match(css, /@media\s*\(max-height:\s*480px\) and \(orientation:\s*landscape\)/);
  assert.match(css, /\.sjc-assistant-panel\s*\{[^}]*max-height:\s*calc\(100dvh/s);
});

test("phone product grid uses minmax columns and rating text can wrap", () => {
  assert.match(css, /\.grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.rating-mini\s*\{[^}]*font-size:\s*11px[^}]*line-height:\s*1\.35/s);
});
