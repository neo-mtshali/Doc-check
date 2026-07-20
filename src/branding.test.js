import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("browser branding uses the concise Doc-Check name and custom favicon", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /<title>Doc-Check 37C<\/title>/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/);

  const favicon = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
  assert.match(favicon, /<svg/);
  assert.match(favicon, /#07998b/);
});
