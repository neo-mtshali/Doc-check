export const DOCUMENT_STATUSES = ["Have", "Missing", "N/A", "Received but unclear"];

export function documentKey(sectionKey, documentId) {
  return `${sectionKey}::${documentId}`;
}

export function emptyDocumentRecord(status = "Missing") {
  return { status, notes: "" };
}

export function getDocumentRecord(records, key) {
  const record = records?.[key];
  if (record && typeof record === "object" && !Array.isArray(record)) {
    return {
      status: DOCUMENT_STATUSES.includes(record.status) ? record.status : (record.checked ? "Have" : "Missing"),
      notes: record.notes || "",
    };
  }
  if (record === true) return emptyDocumentRecord("Have");
  return emptyDocumentRecord("Missing");
}

export function collectDocumentRows(sections = [], records = {}) {
  return sections.flatMap((section) =>
    section.docs.map((item) => {
      const key = documentKey(section.key, item.id);
      return {
        key,
        group: section.title,
        subtitle: section.subtitle,
        title: item.title,
        note: item.note,
        record: getDocumentRecord(records, key),
      };
    }),
  );
}

export function getProgress(sections, records) {
  const rows = collectDocumentRows(sections, records);
  const applicable = rows.filter((row) => row.record.status !== "N/A");
  const have = applicable.filter((row) => row.record.status === "Have").length;
  const missing = applicable.filter((row) => row.record.status === "Missing").length;
  const unclear = applicable.filter((row) => row.record.status === "Received but unclear").length;
  const notApplicable = rows.length - applicable.length;

  return {
    total: rows.length,
    applicable: applicable.length,
    have,
    missing,
    unclear,
    notApplicable,
    actionable: missing + unclear,
    percent: applicable.length ? Math.round((have / applicable.length) * 100) : 100,
  };
}

export function getReadiness(progress) {
  if (progress.missing > 0) return "Not ready";
  if (progress.unclear > 0) return "Ready for follow-up";
  if (progress.have > 0 && progress.percent === 100) return "Ready for trustee pack";
  return "Ready for review";
}
