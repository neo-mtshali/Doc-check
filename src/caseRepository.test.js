import test from "node:test";
import assert from "node:assert/strict";
import {
  combineCaseSnapshot,
  normalizeCaseReference,
  splitCaseSnapshot,
  toSavedCaseEntry,
} from "./caseRepository.js";

test("external case snapshots never contain private Presenter data", () => {
  const source = {
    caseReference: "PSSPF-1",
    deceased: { fullName: "Example Member" },
    presenter: { speakingNotes: "Private conclusion" },
  };

  const { externalCaseData, presenter } = splitCaseSnapshot(source);
  assert.equal("presenter" in externalCaseData, false);
  assert.deepEqual(presenter, { speakingNotes: "Private conclusion" });
  assert.deepEqual(combineCaseSnapshot(externalCaseData, presenter), source);
});

test("remote rows map to the existing saved-case interface", () => {
  const entry = toSavedCaseEntry({
    id: "case-uuid",
    case_reference: "PSSPF-2",
    deceased_name: "Member",
    case_data: { deceased: { fullName: "Member" } },
    readiness: "Not ready",
    progress_percent: 25,
    progress_have: 1,
    progress_applicable: 4,
    progress_actionable: 3,
    progress_missing: 2,
    progress_unclear: 1,
    updated_at: "2026-07-28T12:00:00.000Z",
    version: 4,
    owner_id: "owner-uuid",
    archived_at: null,
  }, { presenter: { recommendation: "Review" } }, { display_name: "Tracer One" });

  assert.equal(entry.remoteId, "case-uuid");
  assert.equal(entry.remoteVersion, 4);
  assert.equal(entry.progress.actionable, 3);
  assert.equal(entry.ownerName, "Tracer One");
  assert.equal(entry.caseData.presenter.recommendation, "Review");
});

test("case references retain display casing while trimming whitespace", () => {
  assert.equal(normalizeCaseReference("  PSSPF-ABC  "), "PSSPF-ABC");
});
