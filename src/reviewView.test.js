import assert from "node:assert/strict";
import test from "node:test";

const reviewView = await import("./reviewView.js").catch(() => ({}));
const { getReviewView, resolveReviewMode } = reviewView;

const sections = [
  {
    key: "claim",
    title: "Claim documents",
    docs: [
      { id: "death-certificate", title: "Death certificate" },
      { id: "member-id", title: "Member ID" },
    ],
  },
  {
    key: "witnesses",
    title: "Witnesses",
    docs: [
      { id: "witness-one", title: "Witness one" },
      { id: "witness-two", title: "Witness two" },
    ],
  },
];

test("action view includes only missing and unclear documents", () => {
  assert.equal(typeof getReviewView, "function", "getReviewView should be implemented");

  const result = getReviewView(sections, {
    "claim::death-certificate": { status: "Have" },
    "claim::member-id": { status: "Missing" },
    "witnesses::witness-one": { status: "Received but unclear" },
    "witnesses::witness-two": { status: "N/A" },
  }, "needs-action");

  assert.equal(result.actionCount, 2);
  assert.equal(result.totalCount, 4);
  assert.deepEqual(result.sections.map((section) => section.docs.map((item) => item.id)), [
    ["member-id"],
    ["witness-one"],
  ]);
});

test("documents without a record are treated as missing", () => {
  assert.equal(typeof getReviewView, "function", "getReviewView should be implemented");

  const result = getReviewView(sections, {}, "needs-action");

  assert.equal(result.actionCount, 4);
  assert.equal(result.sections.length, 2);
});

test("all view preserves every document and section", () => {
  assert.equal(typeof getReviewView, "function", "getReviewView should be implemented");

  const result = getReviewView(sections, {
    "claim::death-certificate": { status: "Have" },
  }, "all");

  assert.equal(result.totalCount, 4);
  assert.deepEqual(result.sections, sections);
});

test("review mode defaults to action view and returns to all when complete", () => {
  assert.equal(typeof resolveReviewMode, "function", "resolveReviewMode should be implemented");

  assert.equal(resolveReviewMode(null, 3), "needs-action");
  assert.equal(resolveReviewMode("all", 3), "all");
  assert.equal(resolveReviewMode("needs-action", 0), "all");
  assert.equal(resolveReviewMode(null, 0), "all");
});
