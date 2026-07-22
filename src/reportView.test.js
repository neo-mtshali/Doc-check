import assert from "node:assert/strict";
import test from "node:test";

const appViewModule = await import("./appView.js").catch(() => ({}));
const reportModule = await import("./reportView.js").catch(() => ({}));
const { resolveAppView } = appViewModule;
const { buildReportModel } = reportModule;

const sections = [
  {
    key: "claim",
    title: "Mandatory Claim Documents",
    subtitle: "Appears once per case",
    docs: [
      { id: "death-certificate", title: "Death certificate", note: "Certified copy" },
      { id: "member-id", title: "Member ID", note: "Certified ID" },
    ],
  },
  {
    key: "beneficiary:1",
    title: "Lerato - Spouse",
    subtitle: "dependency: Stated dependent",
    docs: [
      { id: "bank", title: "3-month bank statement", note: "Bank statement" },
      { id: "affidavit", title: "Spouse affidavit", note: "Support history" },
    ],
  },
];

const caseData = {
  caseReference: "PSSPF-482716",
  deceased: {
    fullName: "Thabo Mokoena",
    idNumber: "7001010000000",
    dateOfDeath: "2026-06-10",
  },
  documentRecords: {
    "claim::death-certificate": { status: "Have", notes: "Certified in 2026" },
    "claim::member-id": { status: "Missing", notes: "Family to provide" },
    "beneficiary:1::bank": { status: "Received but unclear", notes: "Only one month received" },
    "beneficiary:1::affidavit": { status: "N/A", notes: "Dependency withdrawn" },
  },
  presenter: {
    recommendation: "Allocate 60% to spouse",
    risksAndContradictions: "Private contradiction",
    speakingNotes: "Private speaking note",
  },
};

const setupSections = [
  { id: "case-setup", complete: true, summary: "PSSPF-482716" },
  { id: "deceased", complete: true, summary: "Thabo Mokoena" },
  { id: "family-background", complete: false, summary: "Selections needed" },
  { id: "beneficiaries", complete: true, summary: "1 of 1 complete" },
  { id: "witnesses", complete: false, summary: "1 of 2 complete" },
];

test("route resolution recognizes checklist, Presenter, and report paths", () => {
  assert.equal(typeof resolveAppView, "function", "resolveAppView should be implemented");
  assert.equal(resolveAppView("/"), "checklist");
  assert.equal(resolveAppView("/presenter/"), "presenter");
  assert.equal(resolveAppView("/report"), "report");
  assert.equal(resolveAppView("/reports"), "checklist");
});

test("report model separates Missing and Received but unclear items", () => {
  assert.equal(typeof buildReportModel, "function", "buildReportModel should be implemented");
  const report = buildReportModel({
    caseData,
    sections,
    setupSections,
    generatedAt: "2026-07-22T08:00:00.000Z",
  });

  assert.deepEqual(report.missingGroups.map((group) => group.items.map((item) => item.title)), [["Member ID"]]);
  assert.deepEqual(report.unclearGroups.map((group) => group.items.map((item) => item.title)), [["3-month bank statement"]]);
  assert.equal(report.progress.actionable, 2);
});

test("report model flags incomplete setup areas by operational label", () => {
  const report = buildReportModel({ caseData, sections, setupSections, generatedAt: "2026-07-22T08:00:00.000Z" });

  assert.deepEqual(report.setupWarnings, [
    { id: "family-background", label: "Family background", summary: "Selections needed" },
    { id: "witnesses", label: "Witnesses", summary: "1 of 2 complete" },
  ]);
});

test("full checklist appendix retains Have, Missing, unclear, and N/A items", () => {
  const report = buildReportModel({ caseData, sections, setupSections, generatedAt: "2026-07-22T08:00:00.000Z" });
  const statuses = report.checklistGroups.flatMap((group) => group.items.map((item) => item.status));

  assert.deepEqual(statuses, ["Have", "Missing", "Received but unclear", "N/A"]);
  assert.equal(report.progress.notApplicable, 1);
});

test("report model excludes all private Presenter data", () => {
  const report = buildReportModel({ caseData, sections, setupSections, generatedAt: "2026-07-22T08:00:00.000Z" });
  const serialized = JSON.stringify(report);

  assert.doesNotMatch(serialized, /Allocate 60%|Private contradiction|Private speaking note/);
  assert.equal(report.caseReference, "PSSPF-482716");
  assert.equal(report.deceasedName, "Thabo Mokoena");
});

test("report model uses Not captured placeholders for incomplete identifiers", () => {
  const report = buildReportModel({
    caseData: { deceased: {}, documentRecords: {} },
    sections: [],
    setupSections: [],
    generatedAt: "2026-07-22T08:00:00.000Z",
  });

  assert.equal(report.caseReference, "Not captured");
  assert.equal(report.deceasedName, "Not captured");
  assert.equal(report.deceasedId, "Not captured");
  assert.equal(report.dateOfDeath, "Not captured");
});
