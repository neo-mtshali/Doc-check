import assert from "node:assert/strict";
import test from "node:test";

const presenterView = await import("./presenterView.js").catch(() => ({}));

const {
  createEmptyPresenter,
  getAllocationSummary,
  normalizePresenter,
  removePresenterBeneficiary,
  resolveAppView,
} = presenterView;

const beneficiaries = [
  { id: "beneficiary-1", name: "Lerato Mokoena" },
  { id: "beneficiary-2", name: "Neo Mokoena" },
];

test("empty Presenter data contains every case-level note field", () => {
  assert.equal(typeof createEmptyPresenter, "function", "createEmptyPresenter should be implemented");

  assert.deepEqual(createEmptyPresenter(), {
    fundBenefitAmount: "",
    investigationSummary: "",
    interviewHighlights: "",
    recommendation: "",
    risksAndContradictions: "",
    fundQuestions: "",
    speakingNotes: "",
    beneficiaryFindings: {},
  });
});

test("Presenter normalization keeps current beneficiaries and removes orphaned findings", () => {
  assert.equal(typeof normalizePresenter, "function", "normalizePresenter should be implemented");

  const normalized = normalizePresenter({
    investigationSummary: "Household interviews completed.",
    beneficiaryFindings: {
      "beneficiary-1": {
        dependencyFinding: "Dependent",
        evidenceSummary: "Supported monthly",
        allocationPercentage: "60.5",
      },
      removed: {
        dependencyFinding: "Partially dependent",
        allocationPercentage: "39.5",
      },
    },
  }, beneficiaries);

  assert.equal(normalized.investigationSummary, "Household interviews completed.");
  assert.deepEqual(Object.keys(normalized.beneficiaryFindings), ["beneficiary-1"]);
  assert.deepEqual(normalized.beneficiaryFindings["beneficiary-1"], {
    dependencyFinding: "Dependent",
    evidenceSummary: "Supported monthly",
    allocationPercentage: "60.5",
    allocationAmount: "",
    allocationRationale: "",
  });
});

test("Presenter normalization rejects unsupported dependency findings", () => {
  const normalized = normalizePresenter({
    beneficiaryFindings: {
      "beneficiary-1": { dependencyFinding: "Probably dependent" },
    },
  }, beneficiaries);

  assert.equal(normalized.beneficiaryFindings["beneficiary-1"].dependencyFinding, "Undetermined");
});

test("allocation summary totals decimal percentages and ZAR amounts", () => {
  assert.equal(typeof getAllocationSummary, "function", "getAllocationSummary should be implemented");

  const summary = getAllocationSummary({
    "beneficiary-1": { allocationPercentage: "60.5", allocationAmount: "125000.25" },
    "beneficiary-2": { allocationPercentage: "39.5", allocationAmount: "75000" },
  });

  assert.deepEqual(summary, {
    percentageTotal: 100,
    amountTotal: 200000.25,
    hasPercentages: true,
    hasAmounts: true,
    percentageComplete: true,
  });
});

test("allocation summary flags a non-100 percent proposal without rejecting it", () => {
  const summary = getAllocationSummary({
    "beneficiary-1": { allocationPercentage: "55", allocationAmount: "" },
    "beneficiary-2": { allocationPercentage: "", allocationAmount: "" },
  });

  assert.equal(summary.percentageTotal, 55);
  assert.equal(summary.hasPercentages, true);
  assert.equal(summary.percentageComplete, false);
});

test("removing a beneficiary also removes their Presenter finding", () => {
  assert.equal(typeof removePresenterBeneficiary, "function", "removePresenterBeneficiary should be implemented");

  const presenter = normalizePresenter({
    beneficiaryFindings: {
      "beneficiary-1": { dependencyFinding: "Dependent" },
      "beneficiary-2": { dependencyFinding: "Not dependent" },
    },
  }, beneficiaries);

  assert.deepEqual(
    Object.keys(removePresenterBeneficiary(presenter, "beneficiary-1").beneficiaryFindings),
    ["beneficiary-2"],
  );
});

test("only the dedicated Presenter path selects Presenter view", () => {
  assert.equal(typeof resolveAppView, "function", "resolveAppView should be implemented");

  assert.equal(resolveAppView("/presenter"), "presenter");
  assert.equal(resolveAppView("/presenter/"), "presenter");
  assert.equal(resolveAppView("/"), "checklist");
  assert.equal(resolveAppView("/presenter-notes"), "checklist");
});
