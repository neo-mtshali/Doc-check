import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { getReviewView, resolveReviewMode } from "./reviewView.js";
import { getNextActionMenuState } from "./actionMenu.js";

const STORAGE_KEY = "caseDocumentChecklist.v1";
const SAVED_CASES_KEY = "caseDocumentChecklist.savedCases.v1";
const MIN_WITNESSES = 2;
const CERTIFICATION_YEAR = new Date().getFullYear();

const STATUSES = ["Have", "Missing", "N/A", "Received but unclear"];

const RELATIONSHIPS = [
  "Spouse",
  "Life partner / cohabiting partner",
  "Ex-spouse / divorced spouse",
  "Child",
  "Parent",
  "Sibling",
  "Guardian",
  "Other dependant",
];

const CHOOSE_VALUE = "Choose";
const DEPENDENCY_STATUSES = [CHOOSE_VALUE, "Stated dependent", "Stated not dependent"];
const MARRIAGE_STATUSES = [CHOOSE_VALUE, "Never married", "Married", "Divorced", "Customary/lobola", "Cohabiting"];
const YES_NO_UNKNOWN = [CHOOSE_VALUE, "Yes", "No"];
const PARENT_LIFE_STATUSES = [CHOOSE_VALUE, "Alive", "Passed away", "Not involved / not known"];
const DEATH_TYPES = [CHOOSE_VALUE, "Natural", "Unnatural"];

const DOCUMENT_TEMPLATES = {
  affidavit: {
    label: "Download affidavit questions",
    href: "/documents/affidavit-question-guide.pdf",
    filename: "Standard Individual Affidavit Question Guides Pack_with_example.pdf",
  },
  annexureG: {
    label: "Download Annexure G",
    href: "/documents/annexure-g-kids-0-17.pdf",
    filename: "Annexure G- Kids 0-17 years old - PSSPF-Financial Competency Form.pdf",
  },
  annexureH: {
    label: "Download Annexure H",
    href: "/documents/annexure-h-kids-18-21.pdf",
    filename: "Annexure H Kids 18 - 21 years old - ABSA BENEFICIARY.pdf",
  },
  familyHistory: {
    label: "Download family history form",
    href: "/documents/family-history-questionnaire.pdf",
    filename: "Family History Questionaire.pdf",
  },
  police: {
    label: "Download police request form",
    href: "/documents/police-case-information-request.pdf",
    filename: "Torho Tech Police Case Information Request Form.pdf",
  },
};

const MANDATORY_CLAIM_DOCS = [
  doc("certified-death-certificate-copy", "Certified death certificate copy", "Certified copy for the deceased member", "Family / DHA"),
  doc("deceased-certified-id-copy", "Deceased member certified ID copy", "Certified ID copy for the deceased member", "Family"),
  doc("family-history-questionnaire", "Family History Questionnaire", "General case document for family structure and dependants. It cannot be completed by a spouse, life partner, or girlfriend.", "Family"),
  doc("sars-tax-certificate", "SARS/tax certificate", "SARS tax certificate or tax reference document", "Family / SARS"),
];

const SPOUSE_DOCS = [
  doc("spouse-affidavit", "Spouse affidavit", "Affidavit confirming marriage, support, children and dependants", "Spouse"),
  doc("spouse-certified-id", "Spouse certified ID", "Certified copy of spouse ID", "Spouse"),
  doc("spouse-bank-statement", "3-month bank statement", "Bank statement", "Spouse"),
  doc("spouse-marriage-proof", "Marriage certificate or marriage proof", "Marriage certificate, lobola/customary union proof or relationship affidavit", "Spouse"),
];

const LIFE_PARTNER_DOCS = [
  doc("partner-affidavit", "Life partner/cohabitation affidavit", "Affidavit explaining cohabitation, support and relationship history", "Partner"),
  doc("partner-certified-id", "Partner certified ID", "Certified copy of partner ID", "Partner"),
  doc("partner-bank-statement", "3-month bank statement", "Bank statement", "Partner"),
  doc("partner-cohabitation-proof", "Proof of cohabitation", "Shared address, accounts, family confirmation or supporting affidavit", "Partner"),
];

const EX_SPOUSE_DOCS = [
  doc("ex-spouse-affidavit", "Ex-spouse affidavit", "Affidavit explaining divorce, maintenance and dependency facts", "Ex-spouse"),
  doc("maintenance-order", "Maintenance order", "Court order or written maintenance agreement where applicable", "Ex-spouse"),
  doc("divorce-order", "Divorce order", "Divorce order or settlement agreement", "Ex-spouse"),
  doc("ex-spouse-certified-id", "Ex-spouse certified ID", "Certified copy of ex-spouse ID", "Ex-spouse"),
];

const PREVIOUS_DIVORCE_DOCS = [
  doc("previous-divorce-order", "Divorce order", "Court divorce order or settlement agreement from the previous marriage", "Ex-spouse / family"),
  doc("previous-ex-spouse-affidavit", "Ex-spouse affidavit", "Affidavit from the ex-spouse confirming divorce, maintenance and dependency facts", "Ex-spouse"),
  doc("previous-ex-spouse-certified-id", "Ex-spouse certified ID", "Certified copy of ex-spouse ID", "Ex-spouse"),
];

const MINOR_CHILD_DOCS = [
  doc("minor-guardian-affidavit", "Guardian affidavit", "Affidavit confirming care, dependency and who the child lives with", "Guardian / caregiver"),
  doc("minor-birth-certificate", "Birth certificate", "Confirms relationship to the deceased", "Guardian / family"),
  doc("minor-school-proof", "School proof", "Current proof of schooling where applicable", "Guardian / school"),
  doc("minor-guardian-id", "Guardian certified ID", "Certified ID of guardian or caregiver", "Guardian / caregiver"),
  doc("minor-guardian-bank-statement", "Guardian 3-month bank statement", "Bank statement for the guardian/caregiver", "Guardian / caregiver"),
  doc("minor-annexure-g", "Annexure G", "Required for children aged 0-17", "Guardian / caregiver"),
];

const OLDER_MINOR_CHILD_DOCS = [
  ...MINOR_CHILD_DOCS,
  doc("minor-child-certified-id", "Child certified ID if applicable", "Children aged 16-17 may have an ID. Add certified copy if issued.", "Guardian / child"),
];

const YOUNG_ADULT_CHILD_DOCS = [
  doc("young-child-certified-id", "Certified ID", "Certified copy of the child's ID", "Child"),
  doc("young-child-birth-certificate", "Birth certificate", "Birth certificate for the deceased member's child", "Child / family"),
  doc("young-child-affidavit", "Child affidavit", "Affidavit explaining dependency and circumstances", "Child"),
  doc("young-child-study-proof", "School/tertiary proof", "Current school, college or tertiary proof where applicable", "Child / institution"),
  doc("young-child-bank-statement", "3-month bank statement", "Bank statement", "Child"),
  doc("young-child-dependency-proof", "Proof of dependency", "Proof that the deceased supported the child", "Child / family"),
  doc("young-child-annexure-h", "Annexure H", "Required for children aged 18-21", "Child"),
];

const ADULT_CHILD_DOCS = [
  doc("adult-child-certified-id", "Certified ID", "Certified copy of the child's ID", "Child"),
  doc("adult-child-relationship-proof", "Birth certificate", "Birth certificate for the deceased member's child", "Child / family"),
  doc("adult-child-affidavit", "Detailed affidavit", "Affidavit explaining relationship, support and dependency where claimed", "Child"),
  doc("adult-child-bank-statement", "3-month bank statement", "Bank statement", "Child"),
  doc("adult-child-dependency-proof", "Proof of dependency where applicable", "Evidence that the deceased supported the adult child", "Child / family"),
];

const PARENT_ALIVE_DOCS = [
  doc("parent-certified-id", "Parent certified ID", "Certified copy of the parent's ID", "Parent"),
  doc("parent-affidavit", "Parent affidavit", "Affidavit explaining relationship, support and other dependants", "Parent"),
  doc("parent-bank-statement", "3-month bank statement", "Bank statement", "Parent"),
];

const PARENT_PASSED_DOCS = [
  doc("parent-death-certificate", "Parent certified death certificate", "Certified death certificate for the deceased parent", "Family / DHA"),
];

const PARENT_DEATH_UNAVAILABLE_DOCS = [
  doc("parent-death-unavailable-affidavit", "Explanatory affidavit for unavailable parent death certificate", "Affidavit explaining why the parent death certificate cannot be obtained", "Family"),
];

const SIBLING_DOCS = [
  doc("sibling-certified-id", "Certified ID", "Certified copy of the sibling's ID", "Sibling"),
  doc("sibling-affidavit", "Sibling affidavit", "Affidavit explaining relationship and dependency", "Sibling"),
  doc("sibling-relationship-proof", "Proof of sibling relationship", "Birth certificate or family document showing shared parentage", "Sibling / family"),
  doc("sibling-bank-statement", "3-month bank statement", "Bank statement where dependency is claimed", "Sibling"),
];

const GUARDIAN_DOCS = [
  doc("guardian-certified-id", "Guardian certified ID", "Certified ID of the guardian/caregiver", "Guardian"),
  doc("guardian-affidavit", "Guardian/caregiver affidavit", "Affidavit explaining care, support and link to the child", "Guardian"),
  doc("guardian-bank-statement", "Guardian 3-month bank statement", "Bank statement", "Guardian"),
];

const OTHER_DEPENDANT_DOCS = [
  doc("other-certified-id", "Certified ID", "Certified copy of dependant ID", "Dependant"),
  doc("other-affidavit", "Detailed dependency affidavit", "Affidavit explaining relationship and support", "Dependant"),
  doc("other-bank-statement", "3-month bank statement", "Bank statement", "Dependant"),
  doc("other-dependency-proof", "Proof of dependency or relationship", "Evidence supporting dependency or relationship", "Dependant / family"),
];

const WITNESS_DOCS = [
  doc("witness-certified-id", "Witness certified ID", "Certified ID copy for the witness", "Witness"),
  doc("witness-affidavit", "Witness affidavit or statement", "Statement should cover relationship, marriage/partner status, children, supported persons and other dependants", "Witness"),
];

function doc(id, title, note) {
  const requiresCurrentYearCertification = /\b(certified id|id copy|certified copy.*\bid\b|certified copy.*issued)\b/i.test(`${title} ${note}`);
  return {
    id,
    title,
    note: requiresCurrentYearCertification ? `${note} Must be certified in ${CERTIFICATION_YEAR}.` : note,
  };
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function defaultScenarios() {
  return {
    marriageStatus: CHOOSE_VALUE,
    previouslyDivorced: CHOOSE_VALUE,
    maintenancePaid: CHOOSE_VALUE,
    parentStatus: CHOOSE_VALUE,
    motherStatus: CHOOSE_VALUE,
    fatherStatus: CHOOSE_VALUE,
    deathType: CHOOSE_VALUE,
    parentDeathCertificateUnavailable: false,
  };
}

function newBeneficiary() {
  return {
    id: uid("beneficiary"),
    name: "",
    idNumber: "",
    manualAge: "",
    relationship: "Child",
    dependencyStatus: CHOOSE_VALUE,
  };
}

function newWitness() {
  return {
    id: uid("witness"),
    name: "",
    idNumber: "",
    relationshipToDeceased: "",
  };
}

function createWitnessSlots(count = MIN_WITNESSES) {
  return Array.from({ length: count }, () => newWitness());
}

function emptyRecord(status = "Missing") {
  return {
    status,
    notes: "",
  };
}

const initialCase = {
  caseReference: "",
  deceased: {
    fullName: "",
    idNumber: "",
    manualAge: "",
    dateOfDeath: "",
    taxNumber: "",
  },
  scenarios: defaultScenarios(),
  beneficiaries: [newBeneficiary()],
  witnesses: createWitnessSlots(),
  documentRecords: {},
};

function App() {
  const [caseData, setCaseData] = useState(() => loadSavedCase());
  const [savedCases, setSavedCases] = useState(() => loadSavedCases());
  const [preferredReviewMode, setPreferredReviewMode] = useState(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const importRef = useRef(null);
  const actionMenuRef = useRef(null);
  const actionMenuButtonRef = useRef(null);
  const actionMenuPanelRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(caseData));
  }, [caseData]);

  useEffect(() => {
    localStorage.setItem(SAVED_CASES_KEY, JSON.stringify(savedCases));
  }, [savedCases]);

  useEffect(() => {
    if (!actionMenuOpen) return undefined;

    actionMenuPanelRef.current?.querySelector('[role="menuitem"]')?.focus();

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setActionMenuOpen((current) => getNextActionMenuState(current, "escape"));
      actionMenuButtonRef.current?.focus();
    };
    const handlePointerDown = (event) => {
      if (actionMenuRef.current?.contains(event.target)) return;
      setActionMenuOpen((current) => getNextActionMenuState(current, "outside"));
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [actionMenuOpen]);

  const sections = useMemo(() => buildSections(caseData), [caseData]);
  const progress = useMemo(() => getProgress(sections, caseData.documentRecords), [sections, caseData.documentRecords]);
  const readiness = useMemo(() => getReadiness(progress), [progress]);
  const reviewMode = resolveReviewMode(preferredReviewMode, progress.actionable);
  const reviewView = useMemo(
    () => getReviewView(sections, caseData.documentRecords, reviewMode),
    [sections, caseData.documentRecords, reviewMode],
  );

  function updateCase(field, value) {
    setCaseData((current) => ({ ...current, [field]: value }));
  }

  function updateDeceased(field, value) {
    setCaseData((current) => ({
      ...current,
      deceased: { ...current.deceased, [field]: value },
    }));
  }

  function updateScenario(field, value) {
    setCaseData((current) => ({
      ...current,
      scenarios: { ...defaultScenarios(), ...current.scenarios, [field]: value },
    }));
  }

  function updateBeneficiary(id, field, value) {
    setCaseData((current) => ({
      ...current,
      beneficiaries: current.beneficiaries.map((person) =>
        person.id === id ? { ...person, [field]: value } : person,
      ),
    }));
  }

  function updateWitness(id, field, value) {
    setCaseData((current) => ({
      ...current,
      witnesses: current.witnesses.map((witness) =>
        witness.id === id ? { ...witness, [field]: value } : witness,
      ),
    }));
  }

  function addBeneficiary() {
    setCaseData((current) => ({
      ...current,
      beneficiaries: [...current.beneficiaries, newBeneficiary()],
    }));
  }

  function removeBeneficiary(id) {
    setCaseData((current) => ({
      ...current,
      beneficiaries: current.beneficiaries.filter((person) => person.id !== id),
    }));
  }

  function addWitness() {
    setCaseData((current) => ({
      ...current,
      witnesses: [...current.witnesses, newWitness()],
    }));
  }

  function removeWitness(id) {
    setCaseData((current) => ({
      ...current,
      witnesses: current.witnesses.filter((witness) => witness.id !== id),
    }));
  }

  function updateDocumentRecord(key, patch) {
    setCaseData((current) => {
      const currentRecord = getDocumentRecord(current.documentRecords, key);
      return {
        ...current,
        documentRecords: {
          ...current.documentRecords,
          [key]: { ...currentRecord, ...patch },
        },
      };
    });
  }

  function resetCase() {
    setPreferredReviewMode(null);
    setCaseData({
      ...initialCase,
      scenarios: defaultScenarios(),
      beneficiaries: [newBeneficiary()],
      witnesses: createWitnessSlots(),
      documentRecords: {},
    });
  }

  function saveCurrentCase() {
    const entry = buildSavedCaseEntry(caseData, progress, readiness);
    setSavedCases((current) => {
      const withoutCurrent = current.filter((item) => item.id !== entry.id);
      return [entry, ...withoutCurrent].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });
  }

  function loadSavedCaseEntry(entry) {
    setPreferredReviewMode(null);
    setCaseData(normalizeImportedCase(entry.caseData));
  }

  function removeSavedCase(id) {
    setSavedCases((current) => current.filter((item) => item.id !== id));
  }

  function exportFullCaseInfo() {
    const exportText = buildFullCaseInfoText(caseData, sections, progress, readiness);
    const blob = new Blob([exportText], { type: "text/plain" });
    downloadBlob(blob, `${caseData.caseReference || "case"}-full-case-info.txt`);
  }

  function exportMissingDocuments() {
    const exportText = buildMissingDocumentsText(caseData, sections);
    const blob = new Blob([exportText], { type: "text/plain" });
    downloadBlob(blob, `${caseData.caseReference || "case"}-missing-documents.txt`);
  }

  async function copyWhatsAppMessage() {
    const requestText = buildWhatsAppRequestText(caseData, sections);
    await navigator.clipboard?.writeText(requestText);
  }

  async function importCase(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const imported = normalizeImportedCase(JSON.parse(text));
    setPreferredReviewMode(null);
    setCaseData(imported);
    event.target.value = "";
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">37C</div>
        <div>
          <h1>Case Document Progress Checklist</h1>
          <p>Tracer handoff workbench for missing, received and unclear documents</p>
        </div>
        <div className="top-actions">
          <button type="button" className="primary-btn" onClick={saveCurrentCase}>Save case</button>
          <button type="button" className="secondary-btn" onClick={copyWhatsAppMessage}>Copy WhatsApp message</button>
          <div className="action-menu" ref={actionMenuRef}>
            <button
              ref={actionMenuButtonRef}
              type="button"
              className="secondary-btn menu-trigger"
              aria-haspopup="menu"
              aria-expanded={actionMenuOpen}
              onClick={() => setActionMenuOpen((current) => getNextActionMenuState(current, "toggle"))}
            >
              More actions <span aria-hidden="true">▾</span>
            </button>
            {actionMenuOpen ? (
              <div
                ref={actionMenuPanelRef}
                className="action-menu-panel"
                role="menu"
                aria-label="Case actions"
                onKeyDown={(event) => {
                  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
                  event.preventDefault();
                  const items = [...event.currentTarget.querySelectorAll('[role="menuitem"]')];
                  const currentIndex = items.indexOf(document.activeElement);
                  const nextIndex = event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : event.key === 'ArrowDown'
                        ? (currentIndex + 1) % items.length
                        : (currentIndex - 1 + items.length) % items.length;
                  items[nextIndex]?.focus();
                }}
              >
                <button type="button" role="menuitem" onClick={() => {
                  setActionMenuOpen((current) => getNextActionMenuState(current, "select"));
                  importRef.current?.click();
                }}>Import case</button>
                <button type="button" role="menuitem" onClick={() => {
                  setActionMenuOpen((current) => getNextActionMenuState(current, "select"));
                  exportFullCaseInfo();
                }}>Export full case info</button>
                <button type="button" role="menuitem" onClick={() => {
                  setActionMenuOpen((current) => getNextActionMenuState(current, "select"));
                  exportMissingDocuments();
                }}>Export missing documents</button>
                <div className="action-menu-separator" aria-hidden="true" />
                <button type="button" role="menuitem" className="destructive" onClick={() => {
                  setActionMenuOpen((current) => getNextActionMenuState(current, "select"));
                  resetCase();
                }}>New / Reset case</button>
              </div>
            ) : null}
          </div>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={importCase} />
        </div>
      </header>

      <section className="case-summary" aria-label="Case progress summary">
        <div className="case-summary-primary">
          <div className="readiness-summary">
            <span>Readiness</span>
            <strong className={readinessTone(readiness)}>{readiness}</strong>
          </div>
          <div className="completion-summary">
            <div>
              <span>Overall completion</span>
              <strong>{progress.percent}%</strong>
            </div>
            <ProgressBar percent={progress.percent} />
          </div>
        </div>
        <div className="case-summary-stats">
          <StatusMetric label="Case reference" value={caseData.caseReference || "Not captured"} />
          <StatusMetric label="Have / applicable" value={`${progress.have} / ${progress.applicable}`} />
          <StatusMetric label="Needs action" value={progress.actionable} tone={progress.actionable ? "missing" : "complete"} />
        </div>
      </section>

      <div className="workbench">
        <aside className="setup-panel">
          <Panel title="Case Setup">
            <Field label="Case reference number" required value={caseData.caseReference} onChange={(value) => updateCase("caseReference", value)} placeholder="e.g. PSSPF-000000" />
          </Panel>

          <SavedCasesPanel savedCases={savedCases} onLoad={loadSavedCaseEntry} onRemove={removeSavedCase} />

          <Panel title="Deceased Member">
            <div className="form-grid">
              <Field label="Full names" value={caseData.deceased.fullName} onChange={(value) => updateDeceased("fullName", value)} placeholder="Deceased member name" />
              <Field label="ID number" value={caseData.deceased.idNumber} onChange={(value) => updateDeceased("idNumber", value)} placeholder="13-digit SA ID" hint={ageLabel(caseData.deceased)} />
              <Field label="Manual age" value={caseData.deceased.manualAge} onChange={(value) => updateDeceased("manualAge", value)} placeholder="If ID is unavailable" />
              <Field label="Date of death (optional)" value={caseData.deceased.dateOfDeath} onChange={(value) => updateDeceased("dateOfDeath", value)} placeholder="If available" />
            </div>
          </Panel>

          <Panel title="Family Background">
            <div className="scenario-grid">
              <SelectField label="Marriage status" value={caseData.scenarios.marriageStatus} onChange={(value) => updateScenario("marriageStatus", value)}>
                {MARRIAGE_STATUSES.map((item) => <option key={item}>{item}</option>)}
              </SelectField>
              <SelectField label="Previously divorced" value={caseData.scenarios.previouslyDivorced} onChange={(value) => updateScenario("previouslyDivorced", value)}>
                {YES_NO_UNKNOWN.map((item) => <option key={item}>{item}</option>)}
              </SelectField>
              {caseData.scenarios.marriageStatus === "Divorced" || caseData.scenarios.previouslyDivorced === "Yes" ? (
                <SelectField label="Maintenance was paid" value={caseData.scenarios.maintenancePaid} onChange={(value) => updateScenario("maintenancePaid", value)}>
                  {YES_NO_UNKNOWN.map((item) => <option key={item}>{item}</option>)}
                </SelectField>
              ) : null}
              <SelectField label="Mother of deceased" value={caseData.scenarios.motherStatus} onChange={(value) => updateScenario("motherStatus", value)}>
                {PARENT_LIFE_STATUSES.map((item) => <option key={item}>{item}</option>)}
              </SelectField>
              <SelectField label="Father of deceased" value={caseData.scenarios.fatherStatus} onChange={(value) => updateScenario("fatherStatus", value)}>
                {PARENT_LIFE_STATUSES.map((item) => <option key={item}>{item}</option>)}
              </SelectField>
              <SelectField label="Death type" value={caseData.scenarios.deathType} onChange={(value) => updateScenario("deathType", value)}>
                {DEATH_TYPES.map((item) => <option key={item}>{item}</option>)}
              </SelectField>
            </div>
          </Panel>

          <Panel
            title={`Beneficiaries (${caseData.beneficiaries.length})`}
            action={<button className="small-btn" type="button" onClick={addBeneficiary}>Add beneficiary</button>}
          >
            <div className="person-stack">
              {caseData.beneficiaries.map((person, index) => (
                <BeneficiaryEditor
                  key={person.id}
                  index={index}
                  person={person}
                  canRemove={caseData.beneficiaries.length > 1}
                  onChange={updateBeneficiary}
                  onRemove={removeBeneficiary}
                />
              ))}
            </div>
          </Panel>

          <Panel
            title={`Witnesses (${caseData.witnesses.length})`}
            action={<button className="small-btn" type="button" onClick={addWitness}>Add witness</button>}
          >
            <div className="person-stack">
              {caseData.witnesses.map((witness, index) => (
                <WitnessEditor
                  key={witness.id}
                  index={index}
                  witness={witness}
                  canRemove={caseData.witnesses.length > MIN_WITNESSES}
                  onChange={updateWitness}
                  onRemove={removeWitness}
                />
              ))}
            </div>
          </Panel>
        </aside>

        <section className="checklist-panel">
          <div className="checklist-header">
            <div>
              <h2>Document Checklist</h2>
              <p>{progress.actionable ? `${progress.actionable} action items for tracer or review` : "All applicable documents are marked received or not applicable"}</p>
            </div>
            <div className="checklist-actions">
              <span className={`chip ${readinessTone(readiness)}`}>{readiness}</span>
            </div>
          </div>

          <div className="review-toolbar">
            <div>
              <strong>Review view</strong>
              <span>Focus on outstanding work or inspect the full checklist.</span>
            </div>
            <div className="review-filters" role="group" aria-label="Document checklist view">
              <button
                type="button"
                className={reviewMode === "needs-action" ? "active" : ""}
                aria-pressed={reviewMode === "needs-action"}
                onClick={() => setPreferredReviewMode("needs-action")}
              >
                Needs action ({reviewView.actionCount})
              </button>
              <button
                type="button"
                className={reviewMode === "all" ? "active" : ""}
                aria-pressed={reviewMode === "all"}
                onClick={() => setPreferredReviewMode("all")}
              >
                All documents ({reviewView.totalCount})
              </button>
            </div>
          </div>

          <TracerHandoffPanel progress={progress} readiness={readiness} />

          {reviewView.actionCount === 0 ? (
            <div className="review-complete" role="status">
              <strong>No outstanding items</strong>
              <span>All documents are marked Have or N/A.</span>
            </div>
          ) : null}

          {reviewView.sections.map((section) => (
            <ChecklistSection
              key={section.key}
              section={section}
              records={caseData.documentRecords}
              onChange={updateDocumentRecord}
              actionMode={reviewMode === "needs-action"}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

function TracerHandoffPanel({ progress, readiness }) {
  return (
    <section className="handoff-panel">
      <header>
        <div>
          <h2>Tracer Handoff</h2>
          <p>{progress.actionable ? `${progress.actionable} items need action` : "No actionable document requests right now"}</p>
        </div>
      </header>
      <div className="handoff-summary">
        <SummaryPill label="Missing" value={progress.missing} tone={progress.missing ? "missing" : "complete"} />
        <SummaryPill label="Unclear" value={progress.unclear} tone={progress.unclear ? "warning" : "complete"} />
        <SummaryPill label="Readiness" value={readiness} tone={readinessTone(readiness)} />
      </div>
    </section>
  );
}

function SummaryPill({ label, value, tone = "" }) {
  return (
    <div className={`summary-pill ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Panel({ title, action, children }) {
  return (
    <section className="panel">
      <header>
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function StatusMetric({ label, value, tone = "" }) {
  return (
    <div className={`status-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SavedCasesPanel({ savedCases, onLoad, onRemove }) {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredCases = normalizedQuery
    ? savedCases.filter((item) =>
        [item.caseReference, item.deceasedName].some((value) =>
          String(value || "").toLocaleLowerCase().includes(normalizedQuery),
        ),
      )
    : savedCases;

  return (
    <section className="panel saved-cases-panel">
      <header>
        <h2>Saved Cases</h2>
        <span className="chip">{savedCases.length}</span>
      </header>
      {savedCases.length ? (
        <>
          <label className="saved-case-search">
            <span>Search saved cases</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search case number or member name"
            />
          </label>
          {filteredCases.length ? (
            <div className="saved-case-list">
              {filteredCases.map((item) => (
            <article className="saved-case-card" key={item.id}>
              <div className="saved-case-main">
                <strong>{item.caseReference || "No case reference"}</strong>
                <span>{item.deceasedName || "Deceased not captured"}</span>
              </div>
              <div className="saved-case-progress">
                <div>
                  <span>{item.progress?.percent ?? 0}% complete</span>
                  <ProgressBar percent={item.progress?.percent ?? 0} />
                </div>
                <em className={readinessTone(item.readiness)}>{item.readiness || "Not ready"}</em>
              </div>
              <div className="saved-case-meta">
                <span>{item.progress?.actionable ?? 0} action items</span>
                <span>{formatSavedDate(item.updatedAt)}</span>
              </div>
              <footer>
                <button type="button" className="small-btn" onClick={() => onLoad(item)}>Load</button>
                <button type="button" className="text-danger" onClick={() => onRemove(item.id)}>Remove</button>
              </footer>
            </article>
              ))}
            </div>
          ) : (
            <p className="empty-note">No saved cases match “{searchQuery.trim()}”.</p>
          )}
        </>
      ) : (
        <p className="empty-note">No cases saved yet. Use Save case after capturing a case reference and checklist progress.</p>
      )}
    </section>
  );
}

function Field({ label, value, onChange, placeholder, required, hint }) {
  return (
    <label className="field">
      <span>{label}{required ? <b> *</b> : null}</span>
      <input value={value || ""} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function BeneficiaryEditor({ person, index, canRemove, onChange, onRemove }) {
  const age = getPersonAge(person);
  const type = beneficiaryType(person, defaultScenarios());

  return (
    <article className="person-card">
      <div className="person-title">
        <strong>Beneficiary {index + 1}</strong>
        <span className="chip">{type.label}</span>
      </div>
      <Field label="Name" value={person.name} onChange={(value) => onChange(person.id, "name", value)} placeholder="Beneficiary full name" />
      <Field label="ID number" value={person.idNumber} onChange={(value) => onChange(person.id, "idNumber", value)} placeholder="13-digit SA ID" hint={ageLabel(person)} />
      <div className="mini-grid">
        <Field label="Manual age" value={person.manualAge} onChange={(value) => onChange(person.id, "manualAge", value)} placeholder="Age" />
        <SelectField label="Relationship to deceased" value={person.relationship} onChange={(value) => onChange(person.id, "relationship", value)}>
          {RELATIONSHIPS.map((relationship) => <option key={relationship}>{relationship}</option>)}
        </SelectField>
      </div>
      <SelectField label="Dependency statement" value={person.dependencyStatus || CHOOSE_VALUE} onChange={(value) => onChange(person.id, "dependencyStatus", value)}>
        {DEPENDENCY_STATUSES.map((status) => <option key={status}>{status}</option>)}
      </SelectField>
      <footer>
        <span>{age == null ? "Age not captured" : `Age ${age}`}</span>
        {canRemove ? <button type="button" className="text-danger" onClick={() => onRemove(person.id)}>Remove</button> : null}
      </footer>
    </article>
  );
}

function WitnessEditor({ witness, index, canRemove, onChange, onRemove }) {
  return (
    <article className="person-card">
      <div className="person-title">
        <strong>Witness {index + 1}</strong>
        <span className="chip">Witness</span>
      </div>
      <Field label="Full names" value={witness.name} onChange={(value) => onChange(witness.id, "name", value)} placeholder="Witness full name" />
      <Field label="ID number" value={witness.idNumber} onChange={(value) => onChange(witness.id, "idNumber", value)} placeholder="Witness ID number" />
      <Field label="Relationship to deceased" value={witness.relationshipToDeceased} onChange={(value) => onChange(witness.id, "relationshipToDeceased", value)} placeholder="e.g. neighbour, friend, colleague, or non-benefiting family member" />
      <footer>
        <span>{witness.idNumber ? "ID captured" : "ID missing"}</span>
        {canRemove ? <button type="button" className="text-danger" onClick={() => onRemove(witness.id)}>Remove</button> : null}
      </footer>
    </article>
  );
}

function ChecklistSection({ section, records, onChange, actionMode = false }) {
  const sectionRows = section.docs.map((item) => {
    const key = docKey(section.key, item.id);
    return { item, key, record: getDocumentRecord(records, key) };
  });
  const applicable = sectionRows.filter(({ record }) => record.status !== "N/A");
  const done = applicable.filter(({ record }) => record.status === "Have").length;
  const percent = applicable.length ? Math.round((done / applicable.length) * 100) : 100;

  return (
    <article className={`check-section ${section.tone || ""}`}>
      <header>
        <div>
          <h3>{section.title}</h3>
          {section.subtitle ? <p>{section.subtitle}</p> : null}
        </div>
        <div className="section-progress">
          <strong>{actionMode ? `${sectionRows.length} need action` : `${done} / ${applicable.length}`}</strong>
          {actionMode ? null : <ProgressBar percent={percent} />}
        </div>
      </header>
      <div className="doc-list">
        {sectionRows.map(({ item, key, record }) => (
          <article className={`doc-row status-${statusClass(record.status)}`} key={item.id}>
            <div className="doc-main">
              <strong>{item.title}</strong>
              <small>{item.note}</small>
              <DocumentTemplateButton item={item} />
            </div>
            <label className="compact-field">
              <span>Status</span>
              <select value={record.status} onChange={(event) => onChange(key, { status: event.target.value })}>
                {STATUSES.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label className="compact-field">
              <span>Notes</span>
              <input value={record.notes} onChange={(event) => onChange(key, { notes: event.target.value })} placeholder="Tracer notes or review issue" />
            </label>
          </article>
        ))}
      </div>
    </article>
  );
}

function DocumentTemplateButton({ item }) {
  const template = getDocumentTemplate(item);
  if (!template) return null;
  return (
    <a className="template-link" href={template.href} download={template.filename}>
      {template.label}
    </a>
  );
}

function ProgressBar({ percent }) {
  return (
    <div className="progress-bar" aria-hidden="true">
      <span style={{ width: `${percent}%` }} />
    </div>
  );
}

function buildSections(caseData) {
  const scenarios = { ...defaultScenarios(), ...caseData.scenarios };
  const sections = [
    {
      key: "mandatory-claim-documents",
      title: "Mandatory Claim Documents",
      subtitle: "Appears once per case",
      docs: MANDATORY_CLAIM_DOCS,
      tone: "general",
    },
  ];

  const scenarioDocs = buildScenarioDocs(caseData);
  if (scenarioDocs.length) {
    sections.push({
      key: "case-scenario-documents",
      title: "Family Background Documents",
      subtitle: scenarioSubtitle(scenarios),
      docs: scenarioDocs,
      tone: "scenario",
    });
  }

  const spouse = spouseBeneficiarySection(scenarios);
  if (spouse) sections.push(spouse);

  for (const person of caseData.beneficiaries) {
    const type = beneficiaryType(person, scenarios);
    sections.push({
      key: `beneficiary:${person.id}:${type.key}`,
      title: `${person.name || "Unnamed beneficiary"} - ${type.label}`,
      subtitle: beneficiarySubtitle(person),
      docs: beneficiaryDocs(person, type.docs),
      tone: type.key,
    });
  }

  for (const parent of parentBeneficiarySections(scenarios)) {
    sections.push(parent);
  }

  for (const [index, witness] of caseData.witnesses.entries()) {
    const hasDetails = hasWitnessDetails(witness);
    sections.push({
      key: hasDetails ? `witness:${witness.id}` : `witness:missing:${index}`,
      title: hasDetails ? `${witness.name || `Witness ${index + 1}`} - Witness` : `Witness ${index + 1} missing`,
      subtitle: hasDetails ? witnessSubtitle(witness, caseData.beneficiaries) : "Witness affidavit required",
      docs: WITNESS_DOCS,
      tone: "witness",
    });
  }

  return sections;
}

function buildScenarioDocs(caseData) {
  const scenarios = { ...defaultScenarios(), ...caseData.scenarios };
  const docs = [];

  if (scenarios.marriageStatus === "Divorced") {
    docs.push(
      doc("scenario-ex-spouse-affidavit", "Ex-spouse affidavit", "Required where the deceased was divorced or maintenance may be relevant", "Ex-spouse / tracer"),
      doc("scenario-ex-spouse-certified-id", "Ex-spouse certified ID", "Certified copy of ex-spouse ID", "Ex-spouse"),
      doc("scenario-divorce-order", "Divorce order", "Court divorce order or settlement agreement", "Ex-spouse / family"),
    );
    if (scenarios.maintenancePaid !== "No") {
      docs.push(doc("scenario-maintenance-order", "Maintenance order", "Maintenance order or proof of maintenance arrangement", "Ex-spouse / court"));
    }
  }

  if (scenarios.previouslyDivorced === "Yes" && scenarios.marriageStatus !== "Divorced") {
    docs.push(...PREVIOUS_DIVORCE_DOCS);
    if (scenarios.maintenancePaid !== "No") {
      docs.push(doc("previous-maintenance-order", "Maintenance order", "Maintenance order or proof of maintenance arrangement from the previous marriage", "Ex-spouse / court"));
    }
  }

  docs.push(...parentDeathDocs("mother", "Mother", scenarios.motherStatus));
  docs.push(...parentDeathDocs("father", "Father", scenarios.fatherStatus));

  if (scenarios.deathType === "Unnatural") {
    docs.push(doc("unnatural-death-police-report-request", "Police case information request form", "Required where the death was unnatural", "Police"));
  }

  return uniqueDocs(docs);
}

function spouseBeneficiarySection(scenarios) {
  if (scenarios.marriageStatus !== "Married") return null;
  return {
    key: "auto-beneficiary:spouse",
    title: "Spouse - Spouse",
    subtitle: "Automatically added because marriage status is Married",
    docs: SPOUSE_DOCS,
    tone: "spouse",
  };
}

function parentDeathDocs(key, label, status) {
  if (status === "Passed away") {
    return [
      doc(`${key}-death-certificate`, `${label} certified death certificate`, `Certified death certificate for the deceased member's ${label.toLowerCase()}`, "Family / DHA"),
    ];
  }
  return [];
}

function parentBeneficiarySections(scenarios) {
  return generatedParentBeneficiaries(scenarios).map((parent) => ({
    key: `parent-beneficiary:${parent.familyRole}`,
    title: `${parent.name} - Parent`,
    subtitle: "Parent marked alive in family background",
    docs: parentAliveDocs(parent.familyRole, parent.name),
    tone: "parent",
  }));
}

function generatedParentBeneficiaries(scenarios = {}) {
  const values = { ...defaultScenarios(), ...scenarios };
  return [
    generatedParentBeneficiary("mother", "Mother", values.motherStatus),
    generatedParentBeneficiary("father", "Father", values.fatherStatus),
  ].filter(Boolean);
}

function generatedParentBeneficiary(familyRole, name, status) {
  if (status !== "Alive") return null;
  return {
    id: `generated-parent-beneficiary:${familyRole}`,
    name,
    idNumber: "",
    manualAge: "",
    relationship: "Parent",
    dependencyStatus: CHOOSE_VALUE,
    familyRole,
    generated: true,
  };
}

function parentAliveDocs(key, label) {
  return [
    doc(`${key}-parent-certified-id`, `${label} certified ID`, `Certified copy of the deceased member's ${label.toLowerCase()}'s ID`),
    doc(`${key}-parent-affidavit`, `${label} affidavit`, `Affidavit from the deceased member's ${label.toLowerCase()} confirming family background, dependency and other dependants`),
    doc(`${key}-parent-bank-statement`, `${label} 3-month bank statement`, `Bank statement for the deceased member's ${label.toLowerCase()}`),
  ];
}

function beneficiaryType(person, scenarios) {
  if (person.relationship === "Spouse") {
    return { key: "spouse", label: "Spouse", docs: SPOUSE_DOCS };
  }
  if (person.relationship === "Life partner / cohabiting partner") {
    return { key: "life-partner", label: "Life partner / cohabiting partner", docs: LIFE_PARTNER_DOCS };
  }
  if (person.relationship === "Ex-spouse / divorced spouse") {
    return { key: "ex-spouse", label: "Ex-spouse / divorced spouse", docs: EX_SPOUSE_DOCS };
  }
  if (person.relationship === "Parent") {
    return { key: "parent", label: "Parent", docs: PARENT_ALIVE_DOCS };
  }
  if (person.relationship === "Sibling") {
    return { key: "sibling", label: "Sibling", docs: SIBLING_DOCS };
  }
  if (person.relationship === "Guardian") {
    return { key: "guardian", label: "Guardian", docs: GUARDIAN_DOCS };
  }
  if (person.relationship === "Child") {
    const age = getPersonAge(person);
    if (age != null && age >= 16 && age <= 17) return { key: "older-minor-child", label: "Minor child aged 16-17", docs: OLDER_MINOR_CHILD_DOCS };
    if (age != null && age <= 17) return { key: "minor-child", label: "Minor child", docs: MINOR_CHILD_DOCS };
    if (age != null && age <= 21) return { key: "young-adult-child", label: "Child aged 18-21", docs: YOUNG_ADULT_CHILD_DOCS };
    return { key: "major-child", label: age == null ? "Child - age needed" : "Major child", docs: ADULT_CHILD_DOCS };
  }
  return { key: "other-dependant", label: "Other dependant", docs: OTHER_DEPENDANT_DOCS };
}

function uniqueDocs(docs) {
  const seen = new Set();
  return docs.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function scenarioSubtitle(scenarios) {
  return [
    `Marriage: ${scenarios.marriageStatus}`,
    `Previously divorced: ${scenarios.previouslyDivorced}`,
    scenarios.marriageStatus === "Divorced" || scenarios.previouslyDivorced === "Yes" ? `Maintenance: ${scenarios.maintenancePaid}` : null,
    `Mother: ${scenarios.motherStatus}`,
    `Father: ${scenarios.fatherStatus}`,
  ].filter(Boolean).join(" | ");
}

function beneficiarySubtitle(person) {
  const age = getPersonAge(person);
  const idPart = person.idNumber ? `ID ${person.idNumber}` : "ID not captured";
  const dependency = selectedDependencyStatus(person);
  return [
    idPart,
    age == null ? "age not captured" : `age ${age}`,
    dependency ? `dependency: ${dependency}` : null,
  ].filter(Boolean).join(" | ");
}

function selectedDependencyStatus(person) {
  return person?.dependencyStatus && person.dependencyStatus !== CHOOSE_VALUE
    ? person.dependencyStatus
    : "";
}

function beneficiaryDocs(person, docs) {
  if (selectedDependencyStatus(person) !== "Stated not dependent") return docs;
  return docs.filter((item) => !isBankStatementDocument(item));
}

function isBankStatementDocument(item) {
  return /\bbank statement\b/i.test(`${item.title} ${item.note}`);
}

function witnessSubtitle(witness) {
  return witness.relationshipToDeceased || "relationship not captured";
}

function hasWitnessDetails(witness) {
  return Boolean(String(witness.name || "").trim() || String(witness.idNumber || "").trim());
}

function getProgress(sections, records) {
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

function getReadiness(progress) {
  if (progress.missing > 0) return "Not ready";
  if (progress.unclear > 0) return "Ready for follow-up";
  if (progress.have > 0 && progress.percent === 100) return "Ready for trustee pack";
  return "Ready for review";
}

function readinessTone(readiness) {
  if (readiness === "Not ready") return "missing";
  if (readiness === "Ready for follow-up") return "warning";
  if (readiness === "Ready for trustee pack") return "complete";
  return "";
}

function collectDocumentRows(sections, records) {
  return sections.flatMap((section) =>
    section.docs.map((item) => {
      const key = docKey(section.key, item.id);
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

function buildFullCaseInfoText(caseData, sections, progress, readiness) {
  const rows = collectDocumentRows(sections, caseData.documentRecords);
  const beneficiaries = [
    ...caseData.beneficiaries,
    ...generatedParentBeneficiaries(caseData.scenarios),
  ];
  const lines = [
    `Full case information: ${caseData.caseReference || "Case reference not captured"}`,
    `Generated: ${new Date().toLocaleString("en-ZA")}`,
    `Readiness: ${readiness}`,
    `Progress: ${progress.have} of ${progress.applicable} applicable documents marked Have (${progress.percent}%)`,
    "",
    "Deceased member details",
    `- Name: ${caseData.deceased.fullName || "Not captured"}`,
    `- ID: ${caseData.deceased.idNumber || "Not captured"}`,
    caseData.deceased.dateOfDeath ? `- Date of death: ${caseData.deceased.dateOfDeath}` : null,
    "",
    "Case background",
    ...scenarioLines(caseData.scenarios),
    "",
    "Beneficiaries and relationships",
    ...beneficiaries.flatMap((person, index) => beneficiaryLines(person, index, caseData.scenarios)),
    "",
    "Witnesses",
    ...witnessLines(caseData),
  ];

  appendAllDocumentsGroup(lines, rows);

  return `${lines.filter(Boolean).join("\n")}\n`;
}

function buildMissingDocumentsText(caseData, sections) {
  const rows = collectDocumentRows(sections, caseData.documentRecords);
  const missing = rows.filter((row) => row.record.status === "Missing");
  const lines = [
    `Missing documents: ${caseData.caseReference || "Case reference not captured"}`,
    `Generated: ${new Date().toLocaleString("en-ZA")}`,
    "",
    "Case details",
    `- Deceased member: ${caseData.deceased.fullName || "Not captured"}`,
    `- Deceased ID: ${caseData.deceased.idNumber || "Not captured"}`,
  ];

  lines.push("", "Missing documents only");
  if (!missing.length) {
    lines.push("- None");
    return `${lines.join("\n")}\n`;
  }

  for (const [group, items] of groupRows(missing)) {
    lines.push(`${group}:`);
    for (const item of items) {
      lines.push(`- ${formatDocumentLine(item, { includeNotes: true })}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildWhatsAppRequestText(caseData, sections) {
  const rows = collectDocumentRows(sections, caseData.documentRecords)
    .filter((row) => row.record.status === "Missing");

  const lines = [
    "Good day, please assist with the outstanding Section 37C documents below.",
    "",
    `Case: ${caseData.caseReference || "Not captured"}`,
    `Deceased member: ${caseData.deceased.fullName || "Not captured"}`,
    "",
    "Please request only the items listed here. If a document is unavailable, please confirm why and who gave that explanation.",
  ];

  if (!rows.length) {
    lines.push("", "No documents are currently marked Missing.");
    return `${lines.join("\n")}\n`;
  }

  const grouped = groupRows(rows);
  lines.push("", "Outstanding documents:");
  for (const [group, items] of grouped) {
    lines.push("", group);
    for (const item of items) {
      lines.push(`- ${formatWhatsAppLine(item)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatWhatsAppLine(item) {
  const parts = [item.title];
  if (isAffidavitDocument(item)) {
    parts.push("a document with the questions to be answered will be sent");
  }
  if (isAnnexureGHDocument(item)) {
    parts.push("the annexure will be sent");
  }
  if (item.record.notes) parts.push(`note: ${item.record.notes}`);
  return parts.join(" - ");
}

function isAffidavitDocument(item) {
  return /\baffidavit\b/i.test(`${item.title} ${item.note}`);
}

function isAnnexureGHDocument(item) {
  return /\bannexure\s+[gh]\b/i.test(`${item.title} ${item.note}`);
}

function getDocumentTemplate(item) {
  const text = `${item.title} ${item.note}`;
  if (/\bannexure\s+g\b/i.test(text)) return DOCUMENT_TEMPLATES.annexureG;
  if (/\bannexure\s+h\b/i.test(text)) return DOCUMENT_TEMPLATES.annexureH;
  if (/\bfamily history questionnaire\b/i.test(text)) return DOCUMENT_TEMPLATES.familyHistory;
  if (/\bpolice\b/i.test(text)) return DOCUMENT_TEMPLATES.police;
  if (/\baffidavit\b/i.test(text)) return DOCUMENT_TEMPLATES.affidavit;
  return null;
}

function appendAllDocumentsGroup(lines, rows) {
  lines.push("", "Document checklist");
  if (!rows.length) {
    lines.push("- None");
    return;
  }
  for (const [group, items] of groupRows(rows)) {
    lines.push(`${group}:`);
    for (const item of items) {
      lines.push(`- ${formatDocumentLine(item, { includeNotes: true, includeStatus: true })}`);
    }
  }
}

function formatDocumentLine(item, options = {}) {
  const parts = [item.title];
  if (options.includeStatus) parts.push(`status: ${item.record.status}`);
  if (options.includeNotes && item.record.notes) parts.push(`notes: ${item.record.notes}`);
  return parts.join(" | ");
}

function groupRows(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const label = row.subtitle ? `${row.group} (${row.subtitle})` : row.group;
    if (!grouped.has(label)) grouped.set(label, []);
    grouped.get(label).push(row);
  }
  return grouped;
}

function beneficiaryLines(person, index, scenarios) {
  const type = beneficiaryType(person, { ...defaultScenarios(), ...scenarios });
  const age = getPersonAge(person);
  const dependency = selectedDependencyStatus(person) || "Not captured";
  return [
    `- ${index + 1}. ${person.name || "Unnamed beneficiary"} (${type.label})`,
    `  ID: ${person.idNumber || "Not captured"} | Age: ${age == null ? "Not captured" : age} | Dependency: ${dependency}`,
  ];
}

function witnessLines(caseData) {
  const captured = caseData.witnesses.filter(hasWitnessDetails);
  if (!captured.length) return ["- Witnesses missing"];
  return captured.map((witness, index) => {
    return `- ${index + 1}. ${witness.name || "Unnamed witness"} | ID: ${witness.idNumber || "Not captured"} | Relationship: ${witness.relationshipToDeceased || "Not captured"}`;
  });
}

function scenarioLines(scenarios = {}) {
  const values = { ...defaultScenarios(), ...scenarios };
  return [
    `- Marriage status: ${values.marriageStatus}`,
    `- Previously divorced: ${values.previouslyDivorced}`,
    values.marriageStatus === "Divorced" || values.previouslyDivorced === "Yes" ? `- Maintenance was paid: ${values.maintenancePaid}` : null,
    `- Mother of deceased: ${values.motherStatus}`,
    `- Father of deceased: ${values.fatherStatus}`,
    `- Death type: ${values.deathType}`,
  ].filter(Boolean);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function docKey(sectionKey, docId) {
  return `${sectionKey}::${docId}`;
}

function statusClass(status) {
  return String(status || "Missing").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function getDocumentRecord(records, key) {
  const record = records?.[key];
  if (record && typeof record === "object" && !Array.isArray(record)) {
    return {
      status: STATUSES.includes(record.status) ? record.status : (record.checked ? "Have" : "Missing"),
      notes: record.notes || "",
    };
  }
  if (record === true) return emptyRecord("Have");
  return emptyRecord("Missing");
}

function ageLabel(person) {
  const parsed = ageFromSouthAfricanId(person.idNumber);
  if (parsed.age != null) return `Age auto-derived: ${parsed.age}`;
  if (person.idNumber) return "Could not derive age from ID";
  return "Manual age will be used if entered";
}

function getPersonAge(person) {
  const parsed = ageFromSouthAfricanId(person.idNumber);
  if (parsed.age != null) return parsed.age;
  const manual = Number.parseInt(person.manualAge, 10);
  return Number.isFinite(manual) && manual >= 0 ? manual : null;
}

function ageFromSouthAfricanId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 6) return { age: null };
  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  const now = new Date();
  const currentYY = now.getFullYear() % 100;
  const year = yy > currentYY ? 1900 + yy : 2000 + yy;
  const birthDate = new Date(year, mm - 1, dd);
  if (birthDate.getFullYear() !== year || birthDate.getMonth() !== mm - 1 || birthDate.getDate() !== dd) {
    return { age: null };
  }
  let age = now.getFullYear() - year;
  const hadBirthday = now.getMonth() > birthDate.getMonth()
    || (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
  if (!hadBirthday) age -= 1;
  return { age, birthDate };
}

function loadSavedCase() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeImportedCase(saved);
  } catch {
    return normalizeImportedCase(initialCase);
  }
}

function loadSavedCases() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_CASES_KEY));
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((item) => item && typeof item === "object" && item.caseData)
      .map((item) => ({
        id: item.id || uid("saved-case"),
        caseReference: item.caseReference || "",
        deceasedName: item.deceasedName || "",
        readiness: item.readiness || "Not ready",
        progress: item.progress || { percent: 0, have: 0, applicable: 0, actionable: 0 },
        updatedAt: item.updatedAt || new Date(0).toISOString(),
        caseData: normalizeImportedCase(item.caseData),
      }))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  } catch {
    return [];
  }
}

function buildSavedCaseEntry(caseData, progress, readiness) {
  const caseReference = String(caseData.caseReference || "").trim();
  const id = caseReference || `saved-case-${Date.now()}`;
  return {
    id,
    caseReference,
    deceasedName: caseData.deceased.fullName || "",
    readiness,
    progress: {
      percent: progress.percent,
      have: progress.have,
      applicable: progress.applicable,
      actionable: progress.actionable,
    },
    updatedAt: new Date().toISOString(),
    caseData: normalizeImportedCase(caseData),
  };
}

function formatSavedDate(value) {
  if (!value) return "Not dated";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not dated";
  return date.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeImportedCase(value) {
  const base = value && typeof value === "object" ? value : {};
  const beneficiaries = Array.isArray(base.beneficiaries) && base.beneficiaries.length
    ? base.beneficiaries
    : [newBeneficiary()];
  const witnesses = Array.isArray(base.witnesses) && base.witnesses.length
    ? base.witnesses
    : createWitnessSlots();
  const witnessSlots = witnesses.length >= MIN_WITNESSES
    ? witnesses
    : [...witnesses, ...createWitnessSlots(MIN_WITNESSES - witnesses.length)];

  const rawScenarios = base.scenarios && typeof base.scenarios === "object" ? base.scenarios : {};
  const normalizedScenarios = {
    ...defaultScenarios(),
    ...rawScenarios,
    marriageStatus: normalizeChoice(rawScenarios.marriageStatus, MARRIAGE_STATUSES),
    previouslyDivorced: normalizeChoice(rawScenarios.previouslyDivorced, YES_NO_UNKNOWN),
    maintenancePaid: normalizeChoice(rawScenarios.maintenancePaid, YES_NO_UNKNOWN),
    parentStatus: normalizeChoice(rawScenarios.parentStatus, PARENT_LIFE_STATUSES),
    motherStatus: normalizeChoice(rawScenarios.motherStatus, PARENT_LIFE_STATUSES),
    fatherStatus: normalizeChoice(rawScenarios.fatherStatus, PARENT_LIFE_STATUSES),
    deathType: normalizeChoice(rawScenarios.deathType, DEATH_TYPES),
  };

  const normalized = {
    caseReference: base.caseReference || "",
    deceased: {
      fullName: base.deceased?.fullName || "",
      idNumber: base.deceased?.idNumber || "",
      manualAge: base.deceased?.manualAge || "",
      dateOfDeath: base.deceased?.dateOfDeath || "",
      taxNumber: base.deceased?.taxNumber || "",
    },
    scenarios: normalizedScenarios,
    beneficiaries: beneficiaries.map((person) => ({
      id: person.id || uid("beneficiary"),
      name: person.name || "",
      idNumber: person.idNumber || "",
      manualAge: person.manualAge || "",
      relationship: RELATIONSHIPS.includes(person.relationship) ? person.relationship : "Child",
      dependencyStatus: normalizeChoice(person.dependencyStatus, DEPENDENCY_STATUSES),
    })),
    witnesses: witnessSlots.map((witness) => ({
      id: witness.id || uid("witness"),
      name: witness.name || "",
      idNumber: witness.idNumber || "",
      relationshipToDeceased: witness.relationshipToDeceased || "",
    })),
    documentRecords: {},
  };

  normalized.documentRecords = migrateDocumentRecords(base.documentRecords, base.checked);
  return normalized;
}

function normalizeChoice(value, options) {
  return options.includes(value) ? value : CHOOSE_VALUE;
}

function migrateDocumentRecords(documentRecords, checked) {
  const migrated = {};
  if (documentRecords && typeof documentRecords === "object") {
    for (const [key, record] of Object.entries(documentRecords)) {
      migrated[key] = getDocumentRecord(documentRecords, key);
      if (record === false) migrated[key] = emptyRecord("Missing");
    }
  }
  if (checked && typeof checked === "object") {
    for (const [key, value] of Object.entries(checked)) {
      if (!migrated[key]) migrated[key] = emptyRecord(value ? "Have" : "Missing");
    }
  }
  return migrated;
}

createRoot(document.getElementById("root")).render(<App />);
