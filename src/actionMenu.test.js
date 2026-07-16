import assert from "node:assert/strict";
import test from "node:test";

const actionMenu = await import("./actionMenu.js").catch(() => ({}));
const { getNextActionMenuState } = actionMenu;

test("toggle opens and closes the action menu", () => {
  assert.equal(typeof getNextActionMenuState, "function", "getNextActionMenuState should be implemented");

  assert.equal(getNextActionMenuState(false, "toggle"), true);
  assert.equal(getNextActionMenuState(true, "toggle"), false);
});

test("dismissal actions always close the action menu", () => {
  assert.equal(typeof getNextActionMenuState, "function", "getNextActionMenuState should be implemented");

  assert.equal(getNextActionMenuState(true, "escape"), false);
  assert.equal(getNextActionMenuState(true, "outside"), false);
  assert.equal(getNextActionMenuState(true, "select"), false);
});

test("unrelated actions preserve the current menu state", () => {
  assert.equal(typeof getNextActionMenuState, "function", "getNextActionMenuState should be implemented");

  assert.equal(getNextActionMenuState(true, "unknown"), true);
  assert.equal(getNextActionMenuState(false, "unknown"), false);
});
