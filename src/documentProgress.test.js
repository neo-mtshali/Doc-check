import assert from "node:assert/strict";
import test from "node:test";

const progressModule = await import("./documentProgress.js").catch(() => ({}));
const {
  collectDocumentRows,
  getDocumentRecord,
  getProgress,
  getReadiness,
} = progressModule;

const sections = [
  {
    key: "claim",
    title: "Claim documents",
    subtitle: "Core case documents",
    docs: [
      { id: "death-certificate", title: "Death certificate", note: "Certified copy" },
      { id: "member-id", title: "Member ID", note: "Certified ID" },
      { id: "tax", title: "Tax certificate", note: "SARS certificate" },
      { id: "form", title: "Family form", note: "Completed form" },
    ],
  },
];

test("unrecorded and malformed document records normalize to Missing", () => {
  assert.equal(typeof getDocumentRecord, "function", "getDocumentRecord should be implemented");
  assert.deepEqual(getDocumentRecord({}, "claim::member-id"), { status: "Missing", notes: "" });
  assert.deepEqual(getDocumentRecord({ "claim::member-id": { status: "Unknown", notes: "Check scan" } }, "claim::member-id"), {
    status: "Missing",
    notes: "Check scan",
  });
});

test("document rows preserve group context, requirement text, status, and review notes", () => {
  assert.equal(typeof collectDocumentRows, "function", "collectDocumentRows should be implemented");
  const rows = collectDocumentRows(sections, {
    "claim::death-certificate": { status: "Have", notes: "Certified this year" },
  });

  assert.deepEqual(rows[0], {
    key: "claim::death-certificate",
    group: "Claim documents",
    subtitle: "Core case documents",
    title: "Death certificate",
    note: "Certified copy",
    record: { status: "Have", notes: "Certified this year" },
  });
});

test("progress excludes N/A from the denominator and keeps unclear items actionable", () => {
  assert.equal(typeof getProgress, "function", "getProgress should be implemented");
  const progress = getProgress(sections, {
    "claim::death-certificate": { status: "Have" },
    "claim::member-id": { status: "Missing" },
    "claim::tax": { status: "Received but unclear" },
    "claim::form": { status: "N/A" },
  });

  assert.deepEqual(progress, {
    total: 4,
    applicable: 3,
    have: 1,
    missing: 1,
    unclear: 1,
    notApplicable: 1,
    actionable: 2,
    percent: 33,
  });
});

test("readiness follows the existing missing then unclear precedence", () => {
  assert.equal(typeof getReadiness, "function", "getReadiness should be implemented");
  assert.equal(getReadiness({ missing: 1, unclear: 0, have: 2, percent: 67 }), "Not ready");
  assert.equal(getReadiness({ missing: 0, unclear: 1, have: 2, percent: 67 }), "Ready for follow-up");
  assert.equal(getReadiness({ missing: 0, unclear: 0, have: 3, percent: 100 }), "Ready for trustee pack");
});
