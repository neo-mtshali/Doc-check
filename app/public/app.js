const state = {
  cases: [],
  checklist: [],
  selectedCase: null,
  review: new Map(),
};

const els = {
  search: document.querySelector("#caseSearch"),
  clearSearch: document.querySelector("#clearSearch"),
  results: document.querySelector("#results"),
  emptyCase: document.querySelector("#emptyCase"),
  caseCard: document.querySelector("#caseCard"),
  caseCompany: document.querySelector("#caseCompany"),
  caseTitle: document.querySelector("#caseTitle"),
  caseName: document.querySelector("#caseName"),
  caseInterview: document.querySelector("#caseInterview"),
  caseContacts: document.querySelector("#caseContacts"),
  caseActivity: document.querySelector("#caseActivity"),
  caseFlag: document.querySelector("#caseFlag"),
  caseDocProgress: document.querySelector("#caseDocProgress"),
  uploadedFiles: document.querySelector("#uploadedFiles"),
  board: document.querySelector("#board"),
  caseNotes: document.querySelector("#caseNotes"),
  resetReview: document.querySelector("#resetReview"),
  saveReview: document.querySelector("#saveReview"),
  saveStatus: document.querySelector("#saveStatus"),
  autoFillCase: document.querySelector("#autoFillCase"),
  autoCheckAll: document.querySelector("#autoCheckAll"),
  autoAuditLink: document.querySelector("#autoAuditLink"),
};

function normalize(value) {
  return String(value || "").toLowerCase();
}

function setStatus(message, mode = "ready") {
  els.saveStatus.textContent = message;
  els.saveStatus.dataset.mode = mode;
}

function parseFileName(uploadedItem) {
  return uploadedItem.split(" / ").at(-1) || uploadedItem;
}

function findEvidence(check) {
  const docs = state.selectedCase?.uploadedDocumentItems || [];
  const keywords = (check.keywords || []).map(normalize);
  return docs.filter((doc) => {
    const file = normalize(parseFileName(doc));
    return keywords.some((keyword) => file.includes(keyword));
  });
}

function renderResults(query = "") {
  const q = normalize(query).trim();
  const matches = state.cases
    .filter((item) => !q || normalize(`${item.psspf} ${item.name}`).includes(q))
    .slice(0, 12);

  els.results.innerHTML = "";
  for (const item of matches) {
    const button = document.createElement("button");
    button.className = "result-btn";
    button.type = "button";
    button.innerHTML = `<strong>${item.psspf}</strong><span>${item.name} · ${item.company.replace(" Tracing Services", "")}</span>`;
    button.addEventListener("click", () => selectCase(item));
    els.results.append(button);
  }
}

function selectCase(item) {
  state.selectedCase = item;
  state.review.clear();
  els.caseNotes.value = "";
  renderCase();
  renderBoard();
  setStatus("Review in progress");
}

function renderCase() {
  const item = state.selectedCase;
  els.emptyCase.classList.add("hidden");
  els.caseCard.classList.remove("hidden");
  els.caseCompany.textContent = item.company;
  els.caseTitle.textContent = item.psspf;
  els.caseName.textContent = item.name;
  els.caseInterview.textContent = item.interviewStatusSummary || "Not captured";
  els.caseContacts.textContent = item.contactAttempts || "0";
  els.caseActivity.textContent = item.lastActivity || "Not captured";
  els.caseFlag.textContent = item.manualCheck === "YES" ? "Check duplicates" : "No duplicate flag";
  els.caseDocProgress.textContent = item.documentProgress || "No document progress captured.";

  els.uploadedFiles.innerHTML = "";
  const docs = item.uploadedDocumentItems || [];
  if (docs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "file-pill";
    empty.textContent = "No uploaded document filenames captured.";
    els.uploadedFiles.append(empty);
    return;
  }
  for (const doc of docs) {
    const pill = document.createElement("div");
    pill.className = "file-pill";
    pill.textContent = doc;
    els.uploadedFiles.append(pill);
  }
}

function reviewFor(index) {
  if (!state.review.has(index)) {
    state.review.set(index, { status: "Neutral", notes: "", suggestion: null });
  }
  return state.review.get(index);
}

function suggestionClass(value) {
  if (value === "High") return "high";
  if (value === "Medium") return "medium";
  return "low";
}

function renderBoard() {
  els.board.innerHTML = "";
  const head = document.createElement("div");
  head.className = "board-row board-head";
  head.innerHTML = `
    <div class="board-cell">Document</div>
    <div class="board-cell">Applies To</div>
    <div class="board-cell">Requirement</div>
    <div class="board-cell">Likely Uploaded Match</div>
    <div class="board-cell">Verification</div>
  `;
  els.board.append(head);

  for (const [index, check] of state.checklist.entries()) {
    const item = reviewFor(index);
    const evidence = findEvidence(check);
    const row = document.createElement("div");
    row.className = "board-row";
    row.innerHTML = `
      <div class="board-cell">
        <div class="document-title">${check.document}</div>
        <div class="document-note">${check.notes}</div>
      </div>
      <div class="board-cell">${check.appliesTo}</div>
      <div class="board-cell"><span class="requirement ${check.requirement}">${check.requirement}</span></div>
      <div class="board-cell">
        <div class="match-list">${evidence.length ? evidence.map((doc) => `<div>${doc}</div>`).join("") : "No likely match found"}</div>
      </div>
      <div class="board-cell">
        <div class="status-control" role="group" aria-label="${check.document} status">
          <button type="button" data-status="Yes" title="Yes">✓</button>
          <button type="button" data-status="No" title="No">×</button>
          <button type="button" data-status="Neutral" title="Neutral">−</button>
        </div>
        ${item.suggestion ? `
          <div class="auto-suggestion ${suggestionClass(item.suggestion.confidence)}">
            <strong>Auto suggestion:</strong> ${item.suggestion.suggestedStatus}
            <span>${item.suggestion.confidence} confidence${item.suggestion.manualReviewNeeded ? " · manual review" : ""}</span>
            ${item.suggestion.reason ? `<em>${item.suggestion.reason}</em>` : ""}
          </div>
        ` : ""}
        <textarea class="note-input" placeholder="Reviewer note">${item.notes}</textarea>
      </div>
    `;
    const buttons = row.querySelectorAll(".status-control button");
    for (const button of buttons) {
      button.classList.toggle("active", button.dataset.status === item.status);
      button.addEventListener("click", () => {
        item.status = button.dataset.status;
        for (const peer of buttons) peer.classList.toggle("active", peer === button);
      });
    }
    row.querySelector(".note-input").addEventListener("input", (event) => {
      item.notes = event.target.value;
    });
    els.board.append(row);
  }
}

async function saveReview() {
  if (!state.selectedCase) {
    setStatus("Select a case first", "error");
    return;
  }
  const payload = {
    company: state.selectedCase.company,
    psspf: state.selectedCase.psspf,
    name: state.selectedCase.name,
    caseNotes: els.caseNotes.value,
    items: state.checklist.map((check, index) => {
      const item = reviewFor(index);
      return {
        document: check.document,
        appliesTo: check.appliesTo,
        requirement: check.requirement,
        status: item.status,
        evidence: item.suggestion?.matchedFiles || findEvidence(check).join(" | "),
        notes: item.notes,
      };
    }),
  };
  setStatus("Saving...");
  const response = await fetch("/api/reviews", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    setStatus("Save failed", "error");
    return;
  }
  const result = await response.json();
  setStatus(`Saved · ${result.spreadsheet}`);
}

async function autoFillSelectedCase() {
  if (!state.selectedCase) {
    setStatus("Select a case first", "error");
    return;
  }
  setStatus("Auto-checking selected case...");
  const response = await fetch("/api/auto-check-case", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ psspf: state.selectedCase.psspf }),
  });
  if (!response.ok) {
    setStatus("Auto-check failed", "error");
    return;
  }
  const result = await response.json();
  for (const [index, suggestion] of result.suggestions.entries()) {
    const item = reviewFor(index);
    item.status = suggestion.suggestedStatus;
    item.suggestion = suggestion;
  }
  renderBoard();
  setStatus(`Auto-filled ${result.psspf}`);
}

async function autoCheckAllCases() {
  setStatus("Building all-cases audit...");
  els.autoCheckAll.disabled = true;
  const response = await fetch("/api/auto-check-all", { method: "POST" });
  els.autoCheckAll.disabled = false;
  if (!response.ok) {
    setStatus("All-cases audit failed", "error");
    return;
  }
  const result = await response.json();
  els.autoAuditLink.href = result.spreadsheet;
  els.autoAuditLink.classList.remove("hidden");
  setStatus(`Auto audit ready · ${result.rows} rows · ${result.manualReviewRows} need review`);
}

async function init() {
  setStatus("Loading cases...");
  const response = await fetch("/api/cases");
  const data = await response.json();
  state.cases = data.cases || [];
  state.checklist = data.checklist || [];
  renderResults();
  renderBoard();
  setStatus(`${state.cases.length} cases loaded`);
}

els.search.addEventListener("input", (event) => renderResults(event.target.value));
els.clearSearch.addEventListener("click", () => {
  els.search.value = "";
  renderResults();
  els.search.focus();
});
els.resetReview.addEventListener("click", () => {
  state.review.clear();
  els.caseNotes.value = "";
  renderBoard();
  setStatus("Board reset");
});
els.saveReview.addEventListener("click", saveReview);
els.autoFillCase.addEventListener("click", autoFillSelectedCase);
els.autoCheckAll.addEventListener("click", autoCheckAllCases);

init().catch((error) => {
  console.error(error);
  setStatus("Could not load app data", "error");
});
