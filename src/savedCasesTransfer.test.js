import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSavedCasesExport,
  extractSavedCaseCandidates,
  mergeSavedCases,
  SAVED_CASES_EXPORT_TYPE,
} from "./savedCasesTransfer.js";

test("saved cases export preserves complete case entries", () => {
  const cases = [{
    id: "PSSPF-1",
    caseReference: "PSSPF-1",
    caseData: {
      caseReference: "PSSPF-1",
      deceased: { fullName: "Nomsa Dlamini", taxNumber: "987" },
      documentRecords: { "claim::id": { status: "Have", notes: "Certified" } },
      presenter: { speakingNotes: "Confirm dependency" },
    },
  }];

  const result = buildSavedCasesExport(cases, "2026-07-22T10:00:00.000Z");
  assert.equal(result.type, SAVED_CASES_EXPORT_TYPE);
  assert.equal(result.caseCount, 1);
  assert.deepEqual(result.cases, cases);
});

test("batch extraction accepts an all-cases backup and individual case JSON", () => {
  const backup = buildSavedCasesExport([
    { id: "PSSPF-1", caseData: { caseReference: "PSSPF-1" } },
    { id: "PSSPF-2", caseData: { caseReference: "PSSPF-2" } },
  ]);
  assert.equal(extractSavedCaseCandidates(backup).length, 2);
  assert.deepEqual(
    extractSavedCaseCandidates({ caseReference: "PSSPF-3", beneficiaries: [] }),
    [{ caseData: { caseReference: "PSSPF-3", beneficiaries: [] } }],
  );
  assert.deepEqual(extractSavedCaseCandidates({ unrelated: true }), []);
});

test("batch merge replaces matching references without duplicating other cases", () => {
  const existing = [
    { id: "PSSPF-1", caseReference: "PSSPF-1", updatedAt: "2026-07-20T00:00:00Z" },
    { id: "PSSPF-2", caseReference: "PSSPF-2", updatedAt: "2026-07-19T00:00:00Z" },
  ];
  const replacement = { id: "PSSPF-1", caseReference: "PSSPF-1", updatedAt: "2026-07-22T00:00:00Z" };
  const merged = mergeSavedCases(existing, [replacement]);

  assert.equal(merged.length, 2);
  assert.equal(merged[0], replacement);
  assert.equal(merged[1].caseReference, "PSSPF-2");
});
