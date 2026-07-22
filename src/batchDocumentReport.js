import { collectDocumentRows, getProgress, getReadiness } from "./documentProgress.js";

export function buildBatchDocumentReports(savedCases = [], buildSections = () => []) {
  return savedCases.map((entry, index) => {
    const caseData = entry.caseData || {};
    const sections = buildSections(caseData);
    const progress = getProgress(sections, caseData.documentRecords);
    const caseReference = caseData.caseReference || entry.caseReference || `case-${index + 1}`;
    return {
      caseReference,
      deceasedName: caseData.deceased?.fullName || entry.deceasedName || "Not captured",
      readiness: getReadiness(progress),
      progress,
      filename: safeReportFilename(caseReference, index),
      rows: collectDocumentRows(sections, caseData.documentRecords).map((row) => ({
        section: row.group,
        sectionDetails: row.subtitle || "",
        document: row.title,
        requirement: row.note || "",
        status: row.record.status,
        reviewNotes: row.record.notes || "",
      })),
    };
  });
}

export async function buildBatchDocumentReportZip(savedCases = [], buildSections = () => []) {
  const [{ zipSync }, { jsPDF }] = await Promise.all([import("fflate"), import("jspdf")]);
  const reports = buildBatchDocumentReports(savedCases, buildSections);
  const files = Object.fromEntries(reports.map((report) => [report.filename, createReportPdf(report, jsPDF)]));
  return zipSync(files, { level: 6 });
}

export function safeReportFilename(caseReference, index = 0) {
  const safeReference = String(caseReference || `case-${index + 1}`)
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || `case-${index + 1}`;
  return `${safeReference}-document-report.pdf`;
}

function createReportPdf(report, PdfDocument) {
  const pdf = new PdfDocument({ unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  const addPage = () => {
    pdf.addPage();
    y = 16;
    drawPageHeader();
  };
  const ensureSpace = (height) => {
    if (y + height > pageHeight - 14) addPage();
  };
  const drawPageHeader = () => {
    pdf.setFillColor(8, 42, 89);
    pdf.rect(0, 0, pageWidth, 8, "F");
    pdf.setTextColor(8, 42, 89);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("DOC-CHECK 37C", margin, 13);
  };

  drawPageHeader();
  y = 22;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(8, 42, 89);
  pdf.text("Case document progress report", margin, y);
  y += 9;

  pdf.setFontSize(10);
  pdf.setTextColor(23, 32, 51);
  const facts = [
    ["Case reference", report.caseReference],
    ["Deceased member", report.deceasedName],
    ["Readiness", report.readiness],
    ["Completion", `${report.progress.percent}% (${report.progress.have} of ${report.progress.applicable} applicable documents)`],
  ];
  for (const [label, value] of facts) {
    pdf.setFont("helvetica", "bold");
    pdf.text(`${label}:`, margin, y);
    pdf.setFont("helvetica", "normal");
    pdf.text(String(value), margin + 34, y);
    y += 6;
  }
  y += 3;

  if (!report.rows.length) {
    pdf.setTextColor(100, 112, 132);
    pdf.text("No document requirements were generated for this saved case.", margin, y);
  }

  let currentSection = "";
  for (const row of report.rows) {
    const sectionLabel = row.sectionDetails ? `${row.section} — ${row.sectionDetails}` : row.section;
    if (sectionLabel !== currentSection) {
      ensureSpace(14);
      y += currentSection ? 4 : 0;
      pdf.setFillColor(231, 240, 255);
      pdf.roundedRect(margin, y - 4, contentWidth, 8, 1.5, 1.5, "F");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(10);
      pdf.setTextColor(8, 42, 89);
      pdf.text(sectionLabel, margin + 3, y + 1);
      y += 9;
      currentSection = sectionLabel;
    }

    const requirementLines = pdf.splitTextToSize(row.requirement || "No additional requirement", contentWidth - 6);
    const noteLines = row.reviewNotes ? pdf.splitTextToSize(`Review notes: ${row.reviewNotes}`, contentWidth - 6) : [];
    const rowHeight = 13 + requirementLines.length * 4 + noteLines.length * 4;
    ensureSpace(rowHeight);

    pdf.setDrawColor(219, 226, 234);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(margin, y - 3, contentWidth, rowHeight - 2, 1.5, 1.5, "FD");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(23, 32, 51);
    pdf.text(row.document, margin + 3, y + 2);
    pdf.setTextColor(...statusColor(row.status));
    pdf.text(row.status, pageWidth - margin - 3, y + 2, { align: "right" });
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 112, 132);
    pdf.text(requirementLines, margin + 3, y);
    y += requirementLines.length * 4;
    if (noteLines.length) {
      pdf.setTextColor(78, 92, 110);
      pdf.text(noteLines, margin + 3, y + 1);
      y += noteLines.length * 4;
    }
    y += 7;
  }

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(100, 112, 132);
    pdf.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 7, { align: "right" });
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}

function statusColor(status) {
  if (status === "Have") return [13, 141, 87];
  if (status === "Missing") return [201, 53, 53];
  if (status === "Received but unclear") return [155, 97, 0];
  return [100, 112, 132];
}
