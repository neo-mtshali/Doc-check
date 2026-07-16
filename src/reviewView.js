const ACTION_STATUSES = new Set(["Missing", "Received but unclear"]);

function documentKey(sectionKey, documentId) {
  return `${sectionKey}::${documentId}`;
}

function documentStatus(records, sectionKey, documentId) {
  return records?.[documentKey(sectionKey, documentId)]?.status || "Missing";
}

export function getReviewView(sections, records, mode) {
  const totalCount = sections.reduce((count, section) => count + section.docs.length, 0);
  const actionCount = sections.reduce(
    (count, section) => count + section.docs.filter((item) =>
      ACTION_STATUSES.has(documentStatus(records, section.key, item.id)),
    ).length,
    0,
  );

  if (mode === "all") {
    return { sections, actionCount, totalCount };
  }

  const actionSections = sections
    .map((section) => ({
      ...section,
      docs: section.docs.filter((item) =>
        ACTION_STATUSES.has(documentStatus(records, section.key, item.id)),
      ),
    }))
    .filter((section) => section.docs.length > 0);

  return { sections: actionSections, actionCount, totalCount };
}

export function resolveReviewMode(preferredMode, actionCount) {
  if (actionCount === 0) return "all";
  return preferredMode === "all" ? "all" : "needs-action";
}
