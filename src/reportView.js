import { collectDocumentRows, getProgress, getReadiness } from "./documentProgress.js";

const SETUP_LABELS = {
  "case-setup": "Case setup",
  deceased: "Deceased member details",
  "family-background": "Family background",
  beneficiaries: "Beneficiaries",
  witnesses: "Witnesses",
};

function captured(value) {
  return String(value || "").trim() || "Not captured";
}

function reportItem(row) {
  return {
    key: row.key,
    title: row.title,
    requirement: row.note || "",
    status: row.record.status,
    reviewNote: row.record.notes || "",
  };
}

function groupReportRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const label = row.subtitle ? `${row.group} (${row.subtitle})` : row.group;
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push(reportItem(row));
  }
  return [...grouped.entries()].map(([label, items]) => ({ label, items }));
}

export function buildReportModel({ caseData = {}, sections = [], setupSections = [], generatedAt = new Date().toISOString() }) {
  const rows = collectDocumentRows(sections, caseData.documentRecords);
  const progress = getProgress(sections, caseData.documentRecords);
  return {
    generatedAt,
    caseReference: captured(caseData.caseReference),
    deceasedName: captured(caseData.deceased?.fullName),
    deceasedId: captured(caseData.deceased?.idNumber),
    dateOfDeath: captured(caseData.deceased?.dateOfDeath),
    readiness: getReadiness(progress),
    progress,
    setupWarnings: setupSections
      .filter((section) => !section.complete)
      .map((section) => ({
        id: section.id,
        label: SETUP_LABELS[section.id] || section.id,
        summary: section.summary || "Details needed",
      })),
    missingGroups: groupReportRows(rows.filter((row) => row.record.status === "Missing")),
    unclearGroups: groupReportRows(rows.filter((row) => row.record.status === "Received but unclear")),
    checklistGroups: groupReportRows(rows),
  };
}
