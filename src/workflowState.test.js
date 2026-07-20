import assert from "node:assert/strict";
import test from "node:test";

const workflowState = await import("./workflowState.js").catch(() => ({}));

const {
  caseFingerprint,
  filterBeneficiaryDocuments,
  getCaseSaveState,
  getInitialOpenPanel,
  getPersonSectionSpecs,
  getSetupSectionStates,
  hasMeaningfulCaseData,
  hasMissingSpouseBeneficiary,
  prependBeneficiary,
  validateCaseReference,
} = workflowState;

function completeCase(overrides = {}) {
  return {
    caseReference: "PSSPF-482716",
    deceased: {
      fullName: "Thabo Mokoena",
      idNumber: "",
      manualAge: "47",
      dateOfDeath: "",
    },
    scenarios: {
      marriageStatus: "Married",
      previouslyDivorced: "No",
      maintenancePaid: "Choose",
      motherStatus: "Alive",
      fatherStatus: "Passed away",
      deathType: "Natural",
    },
    beneficiaries: [
      {
        id: "beneficiary-1",
        name: "Lerato Mokoena",
        idNumber: "",
        manualAge: "43",
        relationship: "Spouse",
        dependencyStatus: "Stated dependent",
      },
    ],
    witnesses: [
      { id: "witness-1", name: "Naledi Khumalo", idNumber: "9001010000000", relationshipToDeceased: "Neighbour" },
      { id: "witness-2", name: "Sello Dlamini", idNumber: "8802020000000", relationshipToDeceased: "Colleague" },
    ],
    documentRecords: {},
    ...overrides,
  };
}

test("person document sections come only from named beneficiary rows", () => {
  assert.equal(typeof getPersonSectionSpecs, "function", "getPersonSectionSpecs should be implemented");

  const caseData = completeCase({
    scenarios: {
      ...completeCase().scenarios,
      marriageStatus: "Married",
      motherStatus: "Alive",
      fatherStatus: "Alive",
    },
    beneficiaries: [],
    documentRecords: {
      "auto-beneficiary:spouse::spouse-affidavit": { status: "Have" },
      "parent-beneficiary:mother::mother-parent-affidavit": { status: "Have" },
    },
  });

  assert.deepEqual(getPersonSectionSpecs(caseData), []);
});

test("explicit spouse and parent beneficiaries each create one person section", () => {
  assert.equal(typeof getPersonSectionSpecs, "function", "getPersonSectionSpecs should be implemented");

  const caseData = completeCase({
    beneficiaries: [
      completeCase().beneficiaries[0],
      {
        id: "beneficiary-2",
        name: "Nomsa Mokoena",
        idNumber: "",
        manualAge: "68",
        relationship: "Parent",
        dependencyStatus: "Stated dependent",
      },
    ],
  });

  const specs = getPersonSectionSpecs(caseData);
  assert.equal(specs.length, 2);
  assert.deepEqual(specs.map((item) => item.relationship), ["Spouse", "Parent"]);
  assert.deepEqual(specs.map((item) => item.name), ["Lerato Mokoena", "Nomsa Mokoena"]);
});

test("non-dependent beneficiaries do not request bank statements", () => {
  assert.equal(typeof filterBeneficiaryDocuments, "function", "filterBeneficiaryDocuments should be implemented");

  const documents = [
    { id: "certified-id", title: "Certified ID", note: "Certified identity document" },
    { id: "bank", title: "3-month bank statement", note: "Bank statement" },
  ];
  const person = { dependencyStatus: "Stated not dependent" };

  assert.deepEqual(filterBeneficiaryDocuments(person, documents).map((item) => item.id), ["certified-id"]);
});

test("setup completion reports every finished panel", () => {
  assert.equal(typeof getSetupSectionStates, "function", "getSetupSectionStates should be implemented");

  const states = getSetupSectionStates(completeCase());
  assert.deepEqual(Object.fromEntries(states.map((item) => [item.id, item.complete])), {
    "case-setup": true,
    deceased: true,
    "family-background": true,
    beneficiaries: true,
    witnesses: true,
  });
});

test("accordion defaults to saved cases or the first incomplete setup panel", () => {
  assert.equal(typeof getInitialOpenPanel, "function", "getInitialOpenPanel should be implemented");

  const emptyCase = completeCase({
    caseReference: "",
    deceased: { fullName: "", idNumber: "", manualAge: "", dateOfDeath: "" },
  });
  assert.equal(getInitialOpenPanel(emptyCase, [{ id: "saved-1" }]), "saved-cases");

  const activeIncompleteCase = completeCase({
    deceased: { fullName: "", idNumber: "", manualAge: "", dateOfDeath: "" },
  });
  assert.equal(getInitialOpenPanel(activeIncompleteCase, [{ id: "saved-1" }]), "deceased");
});

test("case reference validation rejects blank values", () => {
  assert.equal(typeof validateCaseReference, "function", "validateCaseReference should be implemented");
  assert.equal(validateCaseReference("  "), "Enter a case reference before saving.");
  assert.equal(validateCaseReference("PSSPF-482716"), "");
});

test("save state distinguishes an unchanged saved case from draft changes", () => {
  assert.equal(typeof getCaseSaveState, "function", "getCaseSaveState should be implemented");

  const caseData = completeCase();
  const savedCases = [{ id: caseData.caseReference, caseData }];
  assert.equal(getCaseSaveState(caseData, savedCases), "saved");

  const changed = {
    ...caseData,
    deceased: { ...caseData.deceased, fullName: "Thabo Simon Mokoena" },
  };
  assert.equal(getCaseSaveState(changed, savedCases), "unsaved");
});

test("case fingerprints are stable across object key order", () => {
  assert.equal(typeof caseFingerprint, "function", "caseFingerprint should be implemented");

  assert.equal(
    caseFingerprint({ b: 2, a: { d: 4, c: 3 } }),
    caseFingerprint({ a: { c: 3, d: 4 }, b: 2 }),
  );
});

test("married cases warn only when no spouse beneficiary exists", () => {
  assert.equal(typeof hasMissingSpouseBeneficiary, "function", "hasMissingSpouseBeneficiary should be implemented");

  assert.equal(hasMissingSpouseBeneficiary(completeCase({ beneficiaries: [] })), true);
  assert.equal(hasMissingSpouseBeneficiary(completeCase()), false);
  assert.equal(hasMissingSpouseBeneficiary(completeCase({
    scenarios: { ...completeCase().scenarios, marriageStatus: "Never married" },
    beneficiaries: [],
  })), false);
});

test("meaningful draft detection ignores untouched starter rows", () => {
  assert.equal(typeof hasMeaningfulCaseData, "function", "hasMeaningfulCaseData should be implemented");

  const untouched = completeCase({
    caseReference: "",
    deceased: { fullName: "", idNumber: "", manualAge: "", dateOfDeath: "" },
    scenarios: {
      marriageStatus: "Choose",
      previouslyDivorced: "Choose",
      maintenancePaid: "Choose",
      motherStatus: "Choose",
      fatherStatus: "Choose",
      deathType: "Choose",
    },
    beneficiaries: [{
      id: "beneficiary-empty",
      name: "",
      idNumber: "",
      manualAge: "",
      relationship: "Child",
      dependencyStatus: "Choose",
    }],
    witnesses: [
      { id: "witness-empty-1", name: "", idNumber: "", relationshipToDeceased: "" },
      { id: "witness-empty-2", name: "", idNumber: "", relationshipToDeceased: "" },
    ],
    documentRecords: {},
  });

  assert.equal(hasMeaningfulCaseData(untouched), false);
  assert.equal(hasMeaningfulCaseData({ ...untouched, caseReference: "PSSPF-1" }), true);
  assert.equal(hasMeaningfulCaseData({
    ...untouched,
    documentRecords: { "claim::death-certificate": { status: "Have", notes: "" } },
  }), true);
});

test("new beneficiaries are inserted before existing beneficiary rows", () => {
  const existing = [{ id: "first" }, { id: "second" }];
  const added = { id: "new" };

  assert.deepEqual(prependBeneficiary(existing, added), [added, ...existing]);
  assert.deepEqual(existing, [{ id: "first" }, { id: "second" }]);
});
