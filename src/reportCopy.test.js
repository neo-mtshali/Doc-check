import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./main.jsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("./styles.css", import.meta.url), "utf8");

test("report UI exposes generation and PDF actions", () => {
  assert.match(source, /Generate progress report/);
  assert.match(source, /Case Progress Report/);
  assert.match(source, /Print \/ Save PDF/);
});

test("report UI has dedicated printable styles", () => {
  assert.match(styles, /\.report-shell/);
  assert.match(styles, /\.report-screen-actions/);
  assert.match(styles, /@page\s*\{[^}]*size:\s*A4/s);
});
