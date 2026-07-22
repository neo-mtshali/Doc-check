export const SAVED_CASES_EXPORT_TYPE = "doc-check-saved-cases";
export const SAVED_CASES_EXPORT_VERSION = 1;

export function buildSavedCasesExport(savedCases = [], exportedAt = new Date().toISOString()) {
  return {
    type: SAVED_CASES_EXPORT_TYPE,
    version: SAVED_CASES_EXPORT_VERSION,
    exportedAt,
    caseCount: savedCases.length,
    cases: savedCases,
  };
}

export function extractSavedCaseCandidates(value) {
  if (Array.isArray(value)) return value.flatMap(extractSavedCaseCandidates);
  if (!value || typeof value !== "object") return [];

  if (Array.isArray(value.cases)) return value.cases.flatMap(extractSavedCaseCandidates);
  if (value.caseData && typeof value.caseData === "object") return [value];

  const looksLikeCase = "caseReference" in value
    || "deceased" in value
    || "beneficiaries" in value
    || "documentRecords" in value;
  return looksLikeCase ? [{ caseData: value }] : [];
}

export function mergeSavedCases(existing = [], incoming = []) {
  const byKey = new Map();
  existing.forEach((entry) => byKey.set(caseKey(entry), entry));
  incoming.forEach((entry) => byKey.set(caseKey(entry), entry));
  return [...byKey.values()].sort(
    (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
  );
}

function caseKey(entry) {
  return String(entry?.caseReference || entry?.caseData?.caseReference || entry?.id || "")
    .trim()
    .toLocaleLowerCase();
}
