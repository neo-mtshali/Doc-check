const CHOOSE_VALUE = "Choose";

export function prependBeneficiary(beneficiaries = [], beneficiary) {
  return [beneficiary, ...beneficiaries];
}

function hasText(value) {
  return Boolean(String(value || "").trim());
}

function hasCapturedAge(person = {}) {
  const manualAge = Number.parseInt(person.manualAge, 10);
  if (Number.isFinite(manualAge) && manualAge >= 0) return true;

  const digits = String(person.idNumber || "").replace(/\D/g, "");
  if (digits.length < 6) return false;
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function isSelected(value) {
  return hasText(value) && value !== CHOOSE_VALUE;
}

function isBeneficiaryComplete(person = {}) {
  if (!hasText(person.name) || !isSelected(person.dependencyStatus)) return false;
  return person.relationship !== "Child" || hasCapturedAge(person);
}

function isWitnessComplete(witness = {}) {
  return hasText(witness.name)
    && hasText(witness.idNumber)
    && hasText(witness.relationshipToDeceased);
}

function hasWitnessDetails(witness = {}) {
  return hasText(witness.name)
    || hasText(witness.idNumber)
    || hasText(witness.relationshipToDeceased);
}

export function getPersonSectionSpecs(caseData = {}) {
  return (caseData.beneficiaries || []).map((person) => ({
    id: person.id,
    name: person.name || "",
    relationship: person.relationship || "Other dependant",
    person,
  }));
}

export function hasMissingSpouseBeneficiary(caseData = {}) {
  if (caseData.scenarios?.marriageStatus !== "Married") return false;
  return !(caseData.beneficiaries || []).some((person) => person.relationship === "Spouse");
}

export function filterBeneficiaryDocuments(person = {}, documents = []) {
  if (person.dependencyStatus !== "Stated not dependent") return documents;
  return documents.filter((item) => !/\bbank statement\b/i.test(`${item.title} ${item.note}`));
}

export function getSetupSectionStates(caseData = {}) {
  const scenarios = caseData.scenarios || {};
  const maintenanceRequired = scenarios.marriageStatus === "Divorced"
    || scenarios.previouslyDivorced === "Yes";
  const familyComplete = [
    scenarios.marriageStatus,
    scenarios.previouslyDivorced,
    scenarios.motherStatus,
    scenarios.fatherStatus,
    scenarios.deathType,
  ].every(isSelected) && (!maintenanceRequired || isSelected(scenarios.maintenancePaid));

  const beneficiaries = caseData.beneficiaries || [];
  const witnesses = caseData.witnesses || [];
  const completeWitnesses = witnesses.filter(isWitnessComplete).length;
  const hasPartialWitness = witnesses.some((witness) => hasWitnessDetails(witness) && !isWitnessComplete(witness));

  return [
    {
      id: "case-setup",
      complete: hasText(caseData.caseReference),
      summary: hasText(caseData.caseReference) ? String(caseData.caseReference).trim() : "Reference needed",
    },
    {
      id: "deceased",
      complete: hasText(caseData.deceased?.fullName) && hasCapturedAge(caseData.deceased),
      summary: hasText(caseData.deceased?.fullName) ? caseData.deceased.fullName.trim() : "Member details needed",
    },
    {
      id: "family-background",
      complete: familyComplete,
      summary: familyComplete ? "Background captured" : "Selections needed",
    },
    {
      id: "beneficiaries",
      complete: beneficiaries.length > 0 && beneficiaries.every(isBeneficiaryComplete),
      summary: `${beneficiaries.filter(isBeneficiaryComplete).length} of ${beneficiaries.length} complete`,
    },
    {
      id: "witnesses",
      complete: completeWitnesses >= 2 && !hasPartialWitness,
      summary: `${completeWitnesses} of ${Math.max(2, witnesses.length)} complete`,
    },
  ];
}

export function getInitialOpenPanel(caseData = {}, savedCases = []) {
  if (!hasText(caseData.caseReference) && savedCases.length) return "saved-cases";
  return getSetupSectionStates(caseData).find((section) => !section.complete)?.id || "case-setup";
}

export function validateCaseReference(value) {
  return hasText(value) ? "" : "Enter a case reference before saving.";
}

export function hasMeaningfulCaseData(caseData = {}) {
  if (hasText(caseData.caseReference)) return true;
  if (Object.values(caseData.deceased || {}).some(hasText)) return true;
  if (Object.values(caseData.scenarios || {}).some(isSelected)) return true;
  if ((caseData.beneficiaries || []).some((person) =>
    hasText(person.name)
    || hasText(person.idNumber)
    || hasText(person.manualAge)
    || isSelected(person.dependencyStatus)
    || (hasText(person.relationship) && person.relationship !== "Child"),
  )) return true;
  if ((caseData.witnesses || []).some(hasWitnessDetails)) return true;
  const presenter = caseData.presenter || {};
  if (Object.entries(presenter).some(([key, value]) =>
    key !== "beneficiaryFindings" && hasText(value),
  )) return true;
  if (Object.values(presenter.beneficiaryFindings || {}).some((finding) =>
    Object.entries(finding || {}).some(([key, value]) => key !== "dependencyFinding" && hasText(value)),
  )) return true;
  return Object.keys(caseData.documentRecords || {}).length > 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function caseFingerprint(caseData) {
  return JSON.stringify(canonicalize(caseData));
}

export function getCaseSaveState(caseData = {}, savedCases = []) {
  const reference = String(caseData.caseReference || "").trim();
  if (!reference) return "unsaved";
  const saved = savedCases.find((item) => item.id === reference || item.caseReference === reference);
  if (!saved?.caseData) return "unsaved";
  return caseFingerprint(caseData) === caseFingerprint(saved.caseData) ? "saved" : "unsaved";
}
