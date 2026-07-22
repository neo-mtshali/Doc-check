import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Presenter is framed as a private internal working view", async () => {
  const source = await readFile(new URL("./main.jsx", import.meta.url), "utf8");

  assert.match(source, /Internal presenter notes/);
  assert.match(source, /Private working view/);
  assert.doesNotMatch(source, /Fund presentation brief/);
  assert.doesNotMatch(source, /Fund-facing/);
});
