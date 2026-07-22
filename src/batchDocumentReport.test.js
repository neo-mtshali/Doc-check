import assert from "node:assert/strict";
import test from "node:test";
import { unzipSync } from "fflate";

import { buildBatchDocumentReports, buildBatchDocumentReportZip, safeReportFilename } from "./batchDocumentReport.js";

const savedCases = [{
  caseReference: "PSSPF-1",
  deceasedName: "Nomsa Dlamini",
  caseData: {
    caseReference: "PSSPF-1",
    deceased: { fullName: "Nomsa Dlamini" },
    documentRecords: {
      "claim::death-certificate": { status: "Received but unclear", notes: "Stamp is faint, verify" },
    },
  },
}];
const sections = () => [{
  key: "claim",
  title: "Mandatory Claim Documents",
  subtitle: "Case documents",
  docs: [{ id: "death-certificate", title: "Death certificate", note: "Certified copy" }],
}];

test("batch document reports preserve case, document, status, and review details", () => {
  const [report] = buildBatchDocumentReports(savedCases, sections);
  assert.equal(report.caseReference, "PSSPF-1");
  assert.equal(report.deceasedName, "Nomsa Dlamini");
  assert.equal(report.readiness, "Ready for follow-up");
  assert.deepEqual(report.rows[0], {
    section: "Mandatory Claim Documents",
    sectionDetails: "Case documents",
    document: "Death certificate",
    requirement: "Certified copy",
    status: "Received but unclear",
    reviewNotes: "Stamp is faint, verify",
  });
});

test("batch export creates a ZIP containing one valid PDF per saved case", async () => {
  const files = unzipSync(await buildBatchDocumentReportZip(savedCases, sections));
  assert.deepEqual(Object.keys(files), ["PSSPF-1-document-report.pdf"]);
  assert.equal(new TextDecoder().decode(files["PSSPF-1-document-report.pdf"].slice(0, 5)), "%PDF-");
});

test("PDF report filenames are safe for ZIP extraction", () => {
  assert.equal(safeReportFilename("PSSPF/12: Jane Doe"), "PSSPF-12-Jane-Doe-document-report.pdf");
});
