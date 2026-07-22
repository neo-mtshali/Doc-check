export const DEPENDENCY_FINDINGS = [
  "Undetermined",
  "Dependent",
  "Partially dependent",
  "Not dependent",
];

const PRESENTER_TEXT_FIELDS = [
  "fundBenefitAmount",
  "investigationSummary",
  "interviewHighlights",
  "recommendation",
  "risksAndContradictions",
  "fundQuestions",
  "speakingNotes",
];

export function createEmptyPresenter() {
  return {
    fundBenefitAmount: "",
    investigationSummary: "",
    interviewHighlights: "",
    recommendation: "",
    risksAndContradictions: "",
    fundQuestions: "",
    speakingNotes: "",
    beneficiaryFindings: {},
  };
}

export function createEmptyBeneficiaryFinding() {
  return {
    dependencyFinding: "Undetermined",
    evidenceSummary: "",
    allocationPercentage: "",
    allocationAmount: "",
    allocationRationale: "",
  };
}

export function normalizePresenter(value, beneficiaries = []) {
  const source = value && typeof value === "object" ? value : {};
  const normalized = createEmptyPresenter();
  for (const field of PRESENTER_TEXT_FIELDS) {
    normalized[field] = typeof source[field] === "string" || typeof source[field] === "number"
      ? String(source[field])
      : "";
  }

  const sourceFindings = source.beneficiaryFindings && typeof source.beneficiaryFindings === "object"
    ? source.beneficiaryFindings
    : {};
  const validIds = new Set(beneficiaries.map((person) => person?.id).filter(Boolean));

  for (const [beneficiaryId, findingValue] of Object.entries(sourceFindings)) {
    if (!validIds.has(beneficiaryId)) continue;
    const finding = findingValue && typeof findingValue === "object" ? findingValue : {};
    normalized.beneficiaryFindings[beneficiaryId] = {
      dependencyFinding: DEPENDENCY_FINDINGS.includes(finding.dependencyFinding)
        ? finding.dependencyFinding
        : "Undetermined",
      evidenceSummary: textValue(finding.evidenceSummary),
      allocationPercentage: textValue(finding.allocationPercentage),
      allocationAmount: textValue(finding.allocationAmount),
      allocationRationale: textValue(finding.allocationRationale),
    };
  }

  return normalized;
}

export function removePresenterBeneficiary(presenter, beneficiaryId) {
  const next = {
    ...createEmptyPresenter(),
    ...(presenter || {}),
    beneficiaryFindings: { ...(presenter?.beneficiaryFindings || {}) },
  };
  delete next.beneficiaryFindings[beneficiaryId];
  return next;
}

export function getAllocationSummary(beneficiaryFindings = {}) {
  let percentageTotal = 0;
  let amountTotal = 0;
  let hasPercentages = false;
  let hasAmounts = false;

  for (const finding of Object.values(beneficiaryFindings || {})) {
    const percentage = parseNumericEntry(finding?.allocationPercentage);
    const amount = parseNumericEntry(finding?.allocationAmount);
    if (percentage !== null) {
      percentageTotal += percentage;
      hasPercentages = true;
    }
    if (amount !== null) {
      amountTotal += amount;
      hasAmounts = true;
    }
  }

  percentageTotal = roundCurrency(percentageTotal);
  amountTotal = roundCurrency(amountTotal);
  return {
    percentageTotal,
    amountTotal,
    hasPercentages,
    hasAmounts,
    percentageComplete: hasPercentages && Math.abs(percentageTotal - 100) < 0.001,
  };
}

export function resolveAppView(pathname = "/") {
  return /^\/presenter\/?$/.test(pathname) ? "presenter" : "checklist";
}

function textValue(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function parseNumericEntry(value) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
