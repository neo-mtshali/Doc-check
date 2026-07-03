import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(__dirname, "public");
const distDir = path.join(__dirname, "dist");
const dataDir = path.join(__dirname, "data");
const enrichedPath = path.join(rootDir, "outputs", "tracer_cases_enriched.json");
const reviewDir = path.join(rootDir, "outputs", "review_submissions");
const reviewJsonPath = path.join(reviewDir, "case_document_reviews.json");
const reviewXlsxPath = path.join(reviewDir, "case-document-reviews.xlsx");
const reviewCsvPath = path.join(reviewDir, "case-document-reviews.csv");
const autoAuditXlsxPath = path.join(reviewDir, "auto-document-audit.xlsx");
const autoAuditCsvPath = path.join(reviewDir, "auto-document-audit.csv");
const port = Number(process.env.PORT || 4173);
const strongKeywords = new Set([
  "death",
  "tax",
  "marriage",
  "birth",
  "bank",
  "sars",
  "school",
  "police",
  "passport",
  "lobola",
  "divorce",
  "maintenance",
  "residence",
  "cohabitation",
  "executorship",
  "nomination",
]);
const mediumKeywords = new Set([
  "id",
  "affidavit",
  "certificate",
  "bs",
  "mc",
  "dc",
  "aff",
  "will",
  "medical",
  "sassa",
  "student",
]);
const lowKeywords = new Set(["document", "proof", "form", "letter", "certified"]);
let spreadsheetToolsPromise;

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".jsx", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
]);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readReviews() {
  try {
    return JSON.parse(await fs.readFile(reviewJsonPath, "utf8")).reviews || [];
  } catch {
    return [];
  }
}

function parseDocumentList(value) {
  if (!value) return [];
  return value.split(" | ").map((item) => item.trim()).filter(Boolean);
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function parseFileName(uploadedItem) {
  return uploadedItem.split(" / ").at(-1) || uploadedItem;
}

async function loadSpreadsheetTools() {
  spreadsheetToolsPromise ??= import("@oai/artifact-tool");
  return spreadsheetToolsPromise;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

async function exportAutoAuditCsv(rows) {
  const headers = [
    "Company",
    "PSSPF",
    "Name",
    "Checklist Document",
    "Requirement",
    "Applies To",
    "Suggested Status",
    "Confidence",
    "Matched Files",
    "Manual Review Needed",
    "Reason",
    "Last Activity",
    "Existing Duplicate Flag",
  ];
  const body = [
    headers,
    ...rows.map((row) => [
      row.company,
      row.psspf,
      row.name,
      row.document,
      row.requirement,
      row.appliesTo,
      row.suggestedStatus,
      row.confidence,
      row.matchedFiles,
      row.manualReviewNeeded,
      row.reason,
      row.lastActivity,
      row.existingDuplicateFlag,
    ]),
  ].map((cells) => cells.map(csvEscape).join(",")).join("\n");
  await fs.mkdir(reviewDir, { recursive: true });
  await fs.writeFile(autoAuditCsvPath, body);
  return "/outputs/review_submissions/auto-document-audit.csv";
}

function caseWithDocuments(row) {
  return {
    ...row,
    uploadedDocumentItems: parseDocumentList(row.uploadedDocuments),
  };
}

async function loadCaseData() {
  const [caseData, checklist] = await Promise.all([
    fs.readFile(enrichedPath, "utf8").then(JSON.parse),
    fs.readFile(path.join(dataDir, "checklist.json"), "utf8").then(JSON.parse),
  ]);
  return {
    cases: (caseData.cases || []).map(caseWithDocuments),
    checklist,
  };
}

function keywordRank(keyword) {
  const key = normalize(keyword);
  if (strongKeywords.has(key)) return 3;
  if (mediumKeywords.has(key)) return 2;
  if (lowKeywords.has(key)) return 1;
  return key.length >= 5 ? 2 : 1;
}

function findMatches(caseRow, checklistItem) {
  const keywords = (checklistItem.keywords || []).map(normalize).filter(Boolean);
  return (caseRow.uploadedDocumentItems || [])
    .map((doc) => {
      const filename = normalize(parseFileName(doc));
      const matchedKeywords = keywords.filter((keyword) => filename.includes(keyword));
      if (matchedKeywords.length === 0) return null;
      const score = Math.max(...matchedKeywords.map(keywordRank));
      return { doc, filename, matchedKeywords, score };
    })
    .filter(Boolean);
}

function repeatedFilenames(caseRow) {
  const counts = new Map();
  for (const item of caseRow.uploadedDocumentItems || []) {
    const filename = normalize(parseFileName(item));
    counts.set(filename, (counts.get(filename) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([filename]) => filename));
}

function autoCheckCase(caseRow, checklist) {
  const duplicateFiles = repeatedFilenames(caseRow);
  const preliminary = checklist.map((item) => {
    const matches = findMatches(caseRow, item);
    const bestScore = matches.length ? Math.max(...matches.map((match) => match.score)) : 0;
    const confidence = bestScore >= 3 ? "High" : bestScore === 2 ? "Medium" : bestScore === 1 ? "Low" : "Low";
    const suggestedStatus = matches.length
      ? "Yes"
      : item.requirement === "Compulsory"
        ? "No"
        : "Neutral";
    const reasons = [];
    const matchedFiles = matches.map((match) => match.doc);
    if (caseRow.manualCheck === "YES") reasons.push("Existing duplicate flag on case");
    if (!matches.length && item.requirement === "Compulsory") reasons.push("Missing compulsory document");
    if (matches.length && confidence === "Low") reasons.push("Weak keyword match");
    if (item.requirement === "Conditional" && matches.length) reasons.push("Conditional document has possible evidence");
    if (matches.some((match) => duplicateFiles.has(match.filename))) reasons.push("Duplicate filename in uploaded documents");
    return {
      document: item.document,
      appliesTo: item.appliesTo,
      requirement: item.requirement,
      suggestedStatus,
      confidence,
      matchedFiles,
      manualReviewNeeded: "",
      reason: reasons,
      _matchNames: new Set(matches.map((match) => match.filename)),
    };
  });

  const filenameUse = new Map();
  for (const row of preliminary) {
    for (const filename of row._matchNames) {
      filenameUse.set(filename, (filenameUse.get(filename) || 0) + 1);
    }
  }

  return preliminary.map((row) => {
    if ([...row._matchNames].some((filename) => filenameUse.get(filename) > 1)) {
      row.reason.push("Same filename matches multiple checklist items");
    }
    row.manualReviewNeeded = row.reason.length ? "YES" : "";
    delete row._matchNames;
    return {
      ...row,
      reason: [...new Set(row.reason)].join("; "),
      matchedFiles: row.matchedFiles.join(" | "),
      lastActivity: caseRow.lastActivity || "",
      existingDuplicateFlag: caseRow.manualCheck || "",
    };
  });
}

async function exportAutoAudit(rows) {
  let SpreadsheetFile;
  let Workbook;
  try {
    ({ SpreadsheetFile, Workbook } = await loadSpreadsheetTools());
  } catch {
    return exportAutoAuditCsv(rows);
  }
  const workbook = Workbook.create();
  const sheet = workbook.worksheets.add("Auto Document Audit");
  sheet.showGridLines = false;
  const headers = [
    "Company",
    "PSSPF",
    "Name",
    "Checklist Document",
    "Requirement",
    "Applies To",
    "Suggested Status",
    "Confidence",
    "Matched Files",
    "Manual Review Needed",
    "Reason",
    "Last Activity",
    "Existing Duplicate Flag",
  ];
  const values = rows.map((row) => [
    row.company,
    row.psspf,
    row.name,
    row.document,
    row.requirement,
    row.appliesTo,
    row.suggestedStatus,
    row.confidence,
    row.matchedFiles,
    row.manualReviewNeeded,
    row.reason,
    row.lastActivity,
    row.existingDuplicateFlag,
  ]);

  sheet.getRange("A1:M1").values = [headers];
  if (values.length > 0) {
    sheet.getRange(`A2:M${values.length + 1}`).values = values;
  }
  sheet.getRange("A1:M1").format.fill.color = "#1F2937";
  sheet.getRange("A1:M1").format.font.color = "#FFFFFF";
  sheet.getRange("A1:M1").format.font.bold = true;
  sheet.getRange("A:A").format.columnWidthPx = 175;
  sheet.getRange("B:B").format.columnWidthPx = 125;
  sheet.getRange("C:C").format.columnWidthPx = 170;
  sheet.getRange("D:D").format.columnWidthPx = 290;
  sheet.getRange("E:F").format.columnWidthPx = 135;
  sheet.getRange("G:H").format.columnWidthPx = 115;
  sheet.getRange("I:I").format.columnWidthPx = 420;
  sheet.getRange("J:J").format.columnWidthPx = 135;
  sheet.getRange("K:K").format.columnWidthPx = 320;
  sheet.getRange("L:M").format.columnWidthPx = 155;
  sheet.getRange(`A1:M${Math.max(values.length + 1, 2)}`).format.verticalAlignment = "Top";
  sheet.getRange(`I2:K${Math.max(values.length + 1, 2)}`).format.wrapText = true;

  await fs.mkdir(reviewDir, { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(autoAuditXlsxPath);
  return "/outputs/review_submissions/auto-document-audit.xlsx";
}

async function exportReviews(reviews) {
  let SpreadsheetFile;
  let Workbook;
  try {
    ({ SpreadsheetFile, Workbook } = await loadSpreadsheetTools());
  } catch {
    const headers = [
      "Saved At",
      "Company",
      "PSSPF",
      "Name",
      "Checklist Document",
      "Applies To",
      "Requirement",
      "Status",
      "Evidence / Uploaded File Match",
      "Reviewer Notes",
      "Case Notes",
    ];
    const rows = [];
    for (const review of reviews) {
      for (const item of review.items || []) {
        rows.push([
          review.savedAt,
          review.company,
          review.psspf,
          review.name,
          item.document,
          item.appliesTo,
          item.requirement,
          item.status,
          item.evidence || "",
          item.notes || "",
          review.caseNotes || "",
        ]);
      }
    }
    const body = [headers, ...rows].map((cells) => cells.map(csvEscape).join(",")).join("\n");
    await fs.mkdir(reviewDir, { recursive: true });
    await fs.writeFile(reviewCsvPath, body);
    return "/outputs/review_submissions/case-document-reviews.csv";
  }
  const workbook = Workbook.create();
  const sheet = workbook.worksheets.add("Document Reviews");
  sheet.showGridLines = false;

  const rows = [];
  for (const review of reviews) {
    for (const item of review.items || []) {
      rows.push([
        review.savedAt,
        review.company,
        review.psspf,
        review.name,
        item.document,
        item.appliesTo,
        item.requirement,
        item.status,
        item.evidence || "",
        item.notes || "",
        review.caseNotes || "",
      ]);
    }
  }

  const headers = [
    "Saved At",
    "Company",
    "PSSPF",
    "Name",
    "Checklist Document",
    "Applies To",
    "Requirement",
    "Status",
    "Evidence / Uploaded File Match",
    "Reviewer Notes",
    "Case Notes",
  ];

  sheet.getRange("A1:K1").values = [headers];
  if (rows.length > 0) {
    sheet.getRange(`A2:K${rows.length + 1}`).values = rows;
  }

  sheet.getRange("A1:K1").format.fill.color = "#1F2937";
  sheet.getRange("A1:K1").format.font.color = "#FFFFFF";
  sheet.getRange("A1:K1").format.font.bold = true;
  sheet.getRange("A:A").format.columnWidthPx = 165;
  sheet.getRange("B:B").format.columnWidthPx = 175;
  sheet.getRange("C:C").format.columnWidthPx = 125;
  sheet.getRange("D:D").format.columnWidthPx = 175;
  sheet.getRange("E:E").format.columnWidthPx = 280;
  sheet.getRange("F:F").format.columnWidthPx = 190;
  sheet.getRange("G:G").format.columnWidthPx = 120;
  sheet.getRange("H:H").format.columnWidthPx = 90;
  sheet.getRange("I:I").format.columnWidthPx = 360;
  sheet.getRange("J:K").format.columnWidthPx = 260;
  sheet.getRange(`A1:K${Math.max(rows.length + 1, 2)}`).format.verticalAlignment = "Top";
  sheet.getRange(`I2:K${Math.max(rows.length + 1, 2)}`).format.wrapText = true;

  await fs.mkdir(reviewDir, { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(reviewXlsxPath);
  return "/outputs/review_submissions/case-document-reviews.xlsx";
}

async function handleApi(req, res) {
  if (req.method === "GET" && req.url === "/api/cases") {
    const { cases, checklist } = await loadCaseData();
    sendJson(res, 200, { cases, checklist });
    return true;
  }

  if (req.method === "POST" && req.url === "/api/auto-check-case") {
    const payload = JSON.parse(await readBody(req));
    const { cases, checklist } = await loadCaseData();
    const caseRow = cases.find((row) => row.psspf === payload.psspf);
    if (!caseRow) {
      sendJson(res, 404, { error: "Case not found" });
      return true;
    }
    sendJson(res, 200, {
      psspf: caseRow.psspf,
      name: caseRow.name,
      company: caseRow.company,
      suggestions: autoCheckCase(caseRow, checklist),
    });
    return true;
  }

  if (req.method === "POST" && req.url === "/api/auto-check-all") {
    const { cases, checklist } = await loadCaseData();
    const rows = cases.flatMap((caseRow) =>
      autoCheckCase(caseRow, checklist).map((suggestion) => ({
        company: caseRow.company,
        psspf: caseRow.psspf,
        name: caseRow.name,
        ...suggestion,
      })),
    );
    const spreadsheet = await exportAutoAudit(rows);
    sendJson(res, 200, {
      ok: true,
      cases: cases.length,
      rows: rows.length,
      manualReviewRows: rows.filter((row) => row.manualReviewNeeded === "YES").length,
      spreadsheet,
    });
    return true;
  }

  if (req.method === "GET" && req.url === "/api/reviews") {
    const reviews = await readReviews();
    sendJson(res, 200, {
      reviews,
      spreadsheet: "/outputs/review_submissions/case-document-reviews.xlsx",
    });
    return true;
  }

  if (req.method === "POST" && req.url === "/api/reviews") {
    const payload = JSON.parse(await readBody(req));
    const review = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      savedAt: new Date().toISOString(),
      company: payload.company || "",
      psspf: payload.psspf || "",
      name: payload.name || "",
      caseNotes: payload.caseNotes || "",
      items: Array.isArray(payload.items) ? payload.items : [],
    };
    const reviews = await readReviews();
    reviews.push(review);
    await fs.mkdir(reviewDir, { recursive: true });
    await fs.writeFile(reviewJsonPath, JSON.stringify({ reviews }, null, 2));
    const spreadsheet = await exportReviews(reviews);
    sendJson(res, 200, {
      ok: true,
      review,
      spreadsheet,
    });
    return true;
  }

  return false;
}

async function serveFile(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
  if (urlPath === "/") urlPath = "/index.html";

  const base = urlPath.startsWith("/outputs/") ? rootDir : distDir;
  const filePath = path.resolve(base, `.${urlPath}`);
  if (!filePath.startsWith(base)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": contentTypes.get(ext) || "application/octet-stream" });
    res.end(body);
  } catch {
    if (!urlPath.startsWith("/outputs/")) {
      try {
        const body = await fs.readFile(path.join(distDir, "index.html"));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(body);
        return;
      } catch {}
    }
    try {
      const legacyPath = path.resolve(publicDir, `.${urlPath}`);
      if (legacyPath.startsWith(publicDir)) {
        const body = await fs.readFile(legacyPath);
        const ext = path.extname(legacyPath);
        res.writeHead(200, { "content-type": contentTypes.get(ext) || "application/octet-stream" });
        res.end(body);
        return;
      }
    } catch {}
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/") && (await handleApi(req, res))) return;
    await serveFile(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Case review app running at http://127.0.0.1:${port}`);
});
