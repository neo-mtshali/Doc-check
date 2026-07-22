import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { resolveAppView } from "./appView.js";
import {
  DOCUMENT_STATUSES as STATUSES,
  collectDocumentRows,
  documentKey as docKey,
  emptyDocumentRecord as emptyRecord,
  getDocumentRecord,
  getProgress,
  getReadiness,
} from "./documentProgress.js";
import { getReviewView, resolveReviewMode } from "./reviewView.js";
import { getNextActionMenuState } from "./actionMenu.js";
import { buildReportModel } from "./reportView.js";
import {
  createEmptyBeneficiaryFinding,
  createEmptyPresenter,
  DEPENDENCY_FINDINGS,
  getAllocationSummary,
  normalizePresenter,
  removePresenterBeneficiary,
} from "./presenterView.js";
import {
  filterBeneficiaryDocuments,
  getCaseSaveState,
  getInitialOpenPanel,
  getPersonSectionSpecs,
  getSetupSectionStates,
  hasMeaningfulCaseData,
  hasMissingSpouseBeneficiary,
  prependBeneficiary,
  validateCaseReference,
} from "./workflowState.js";

const STORAGE_KEY = "caseDocumentChecklist.v1";
const SAVED_CASES_KEY = "caseDocumentChecklist.savedCases.v1";
const MIN_WITNESSES = 2;
const CERTIFICATION_YEAR = new Date().getFullYear();

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
  presenter: createEmptyPresenter(),
};

function App() {
  const [caseData, setCaseData] = useState(() => loadSavedCase());
  const [savedCases, setSavedCases] = useState(() => loadSavedCases());
  const [preferredReviewMode, setPreferredReviewMode] = useState(null);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [openPanels, setOpenPanels] = useState(() => new Set([getInitialOpenPanel(caseData, savedCases)]));
  const [referenceError, setReferenceError] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const restoredDraft = useRef(hasMeaningfulCaseData(caseData));
  const importRef = useRef(null);
  const actionMenuRef = useRef(null);
  const actionMenuButtonRef = useRef(null);
  const actionMenuPanelRef = useRef(null);
  const caseReferenceRef = useRef(null);
  const confirmationButtonRef = useRef(null);
  const confirmationReturnFocusRef = useRef(null);
  const feedbackTimerRef = useRef(null);
  const newBeneficiaryNameRef = useRef(null);
  const pendingNewBeneficiaryIdRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(caseData));
  }, [caseData]);

  useEffect(() => {
    localStorage.setItem(SAVED_CASES_KEY, JSON.stringify(savedCases));
  }, [savedCases]);

  useEffect(() => {
    const synchronize = (event) => {
      if (event.storageArea !== localStorage) return;
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          setCaseData(normalizeImportedCase(JSON.parse(event.newValue)));
          setHasInteracted(true);
        } catch {
          // Ignore malformed data from an unrelated browser tab.
        }
      }
      if (event.key === SAVED_CASES_KEY && event.newValue) {
        try {
          setSavedCases(normalizeSavedCases(JSON.parse(event.newValue)));
        } catch {
          // Ignore malformed data from an unrelated browser tab.
        }
      }
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);

  useEffect(() => {
    if (!pendingNewBeneficiaryIdRef.current || !newBeneficiaryNameRef.current) return;
    newBeneficiaryNameRef.current.focus();
    pendingNewBeneficiaryIdRef.current = null;
  }, [caseData.beneficiaries]);

  useEffect(() => () => {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  useEffect(() => {
    if (!confirmation) return undefined;
    confirmationButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeConfirmation();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [confirmation]);

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
  const setupSections = useMemo(() => getSetupSectionStates(caseData), [caseData]);
  const setupById = useMemo(
    () => Object.fromEntries(setupSections.map((section) => [section.id, section])),
    [setupSections],
  );
  const caseSaveState = useMemo(() => getCaseSaveState(caseData, savedCases), [caseData, savedCases]);
  const meaningfulDraft = useMemo(() => hasMeaningfulCaseData(caseData), [caseData]);
  const draftLabel = !meaningfulDraft
    ? "Draft saved locally"
    : caseSaveState === "saved"
      ? "Saved"
      : restoredDraft.current && !hasInteracted
        ? "Draft restored"
        : "Changes not saved to case list";
  const missingSpouse = hasMissingSpouseBeneficiary(caseData);

  function announce(message, tone = "success", dismiss = tone !== "error") {
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
    setFeedback({ message, tone });
    if (dismiss) {
      feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 4000);
    }
  }

  function markChanged() {
    setHasInteracted(true);
  }

  function togglePanel(id) {
    setOpenPanels((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openPanel(id) {
    setOpenPanels((current) => new Set([...current, id]));
  }

  function updateCase(field, value) {
    markChanged();
    if (field === "caseReference") {
      if (value.trim()) {
        setReferenceError("");
        if (referenceError) setFeedback(null);
        setOpenPanels((current) => {
          const next = new Set(current);
          next.delete("saved-cases");
          return next;
        });
      }
    }
    setCaseData((current) => ({ ...current, [field]: value }));
  }

  function updateDeceased(field, value) {
    markChanged();
    setCaseData((current) => ({
      ...current,
      deceased: { ...current.deceased, [field]: value },
    }));
  }

  function updateScenario(field, value) {
    markChanged();
    setCaseData((current) => ({
      ...current,
      scenarios: { ...defaultScenarios(), ...current.scenarios, [field]: value },
    }));
  }

  function updateBeneficiary(id, field, value) {
    markChanged();
    setCaseData((current) => ({
      ...current,
      beneficiaries: current.beneficiaries.map((person) =>
        person.id === id ? { ...person, [field]: value } : person,
      ),
    }));
  }

  function updateWitness(id, field, value) {
    markChanged();
    setCaseData((current) => ({
      ...current,
      witnesses: current.witnesses.map((witness) =>
        witness.id === id ? { ...witness, [field]: value } : witness,
      ),
    }));
  }

  function addBeneficiary() {
    const beneficiary = newBeneficiary();
    markChanged();
    openPanel("beneficiaries");
    pendingNewBeneficiaryIdRef.current = beneficiary.id;
    setCaseData((current) => ({
      ...current,
      beneficiaries: prependBeneficiary(current.beneficiaries, beneficiary),
    }));
  }

  function removeBeneficiary(id) {
    markChanged();
    setCaseData((current) => ({
      ...current,
      beneficiaries: current.beneficiaries.filter((person) => person.id !== id),
      presenter: removePresenterBeneficiary(current.presenter, id),
    }));
  }

  function addWitness() {
    markChanged();
    openPanel("witnesses");
    setCaseData((current) => ({
      ...current,
      witnesses: [...current.witnesses, newWitness()],
    }));
  }

  function removeWitness(id) {
    markChanged();
    setCaseData((current) => ({
      ...current,
      witnesses: current.witnesses.filter((witness) => witness.id !== id),
    }));
  }

  function updateDocumentRecord(key, patch) {
    markChanged();
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

  function performResetCase() {
    setPreferredReviewMode(null);
    const nextCase = {
      ...initialCase,
      scenarios: defaultScenarios(),
      beneficiaries: [newBeneficiary()],
      witnesses: createWitnessSlots(),
      documentRecords: {},
      presenter: createEmptyPresenter(),
    };
    setCaseData(nextCase);
    setReferenceError("");
    setHasInteracted(false);
    setOpenPanels(new Set([savedCases.length ? "saved-cases" : "case-setup"]));
    announce("A new local draft is ready.");
  }

  function requestConfirmation(details, returnFocus = document.activeElement) {
    confirmationReturnFocusRef.current = returnFocus;
    setConfirmation(details);
  }

  function closeConfirmation() {
    setConfirmation(null);
    window.requestAnimationFrame(() => confirmationReturnFocusRef.current?.focus());
  }

  function confirmResetCase() {
    requestConfirmation({
      title: "Reset this case?",
      message: "This clears the current draft. Cases already listed under Saved Cases will remain available.",
      confirmLabel: "Reset case",
      onConfirm: performResetCase,
    }, actionMenuButtonRef.current);
  }

  function saveCurrentCase() {
    const error = validateCaseReference(caseData.caseReference);
    if (error) {
      setReferenceError(error);
      openPanel("case-setup");
      announce(error, "error", false);
      window.requestAnimationFrame(() => caseReferenceRef.current?.focus());
      return;
    }
    const entry = buildSavedCaseEntry(caseData, progress, readiness);
    setSavedCases((current) => {
      const withoutCurrent = current.filter((item) => item.id !== entry.id);
      return [entry, ...withoutCurrent].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });
    setReferenceError("");
    setHasInteracted(false);
    announce(`Case ${entry.caseReference} saved.`);
  }

  function loadSavedCaseEntry(entry) {
    const imported = normalizeImportedCase(entry.caseData);
    setPreferredReviewMode(null);
    setCaseData(imported);
    setReferenceError("");
    setHasInteracted(false);
    setOpenPanels(new Set([getInitialOpenPanel(imported, savedCases)]));
    announce(`Case ${entry.caseReference || "record"} loaded.`);
  }

  function confirmRemoveSavedCase(entry) {
    requestConfirmation({
      title: `Remove ${entry.caseReference || "this saved case"}?`,
      message: "This removes the saved snapshot. The current draft will not be changed.",
      confirmLabel: "Remove saved case",
      onConfirm: () => {
        setSavedCases((current) => current.filter((item) => item.id !== entry.id));
        announce(`Saved case ${entry.caseReference || "record"} removed.`);
      },
    });
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
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(requestText);
      announce("WhatsApp message copied.");
    } catch {
      announce("Could not copy the WhatsApp message. Try again.", "error", false);
    }
  }

  function openPresenter() {
    window.open("/presenter", "_blank", "noopener,noreferrer");
  }

  function openReport() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(caseData));
    window.open("/report", "_blank", "noopener,noreferrer");
  }

  async function importCase(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = normalizeImportedCase(JSON.parse(text));
      setPreferredReviewMode(null);
      setCaseData(imported);
      setReferenceError("");
      setHasInteracted(true);
      setOpenPanels(new Set([getInitialOpenPanel(imported, savedCases)]));
      announce(`Imported ${imported.caseReference || "case draft"}.`);
    } catch {
      announce("Could not import that file. Choose a valid Doc-Check JSON file.", "error", false);
    } finally {
      event.target.value = "";
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">37C</div>
        <div>
          <h1>Case Document Progress Checklist</h1>
          <p>Tracer handoff workbench for missing, received and unclear documents</p>
          <span className={`draft-state ${caseSaveState}`}>{draftLabel}</span>
        </div>
        <div className="top-actions">
          <button type="button" className="primary-btn" onClick={saveCurrentCase}>Save case</button>
          <button type="button" className="secondary-btn" onClick={openPresenter}>Open Presenter</button>
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
                  openReport();
                }}>Generate progress report</button>
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
                  confirmResetCase();
                }}>New / Reset case</button>
              </div>
            ) : null}
          </div>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={importCase} />
        </div>
      </header>

      {feedback ? (
        <div
          className={`app-feedback ${feedback.tone}`}
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live={feedback.tone === "error" ? "assertive" : "polite"}
        >
          {feedback.message}
        </div>
      ) : null}

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
          <AccordionPanel
            id="case-setup"
            title="Case Setup"
            summary={setupById["case-setup"].summary}
            complete={setupById["case-setup"].complete}
            open={openPanels.has("case-setup")}
            onToggle={togglePanel}
          >
            <Field
              id="case-reference-input"
              inputRef={caseReferenceRef}
              label="Case reference number"
              required
              value={caseData.caseReference}
              onChange={(value) => updateCase("caseReference", value)}
              placeholder="e.g. PSSPF-000000"
              error={referenceError}
            />
          </AccordionPanel>

          <SavedCasesPanel
            savedCases={savedCases}
            onLoad={loadSavedCaseEntry}
            onRemove={confirmRemoveSavedCase}
            open={openPanels.has("saved-cases")}
            onToggle={togglePanel}
          />

          <AccordionPanel
            id="deceased"
            title="Deceased Member"
            summary={setupById.deceased.summary}
            complete={setupById.deceased.complete}
            open={openPanels.has("deceased")}
            onToggle={togglePanel}
          >
            <div className="form-grid">
              <Field label="Full names" value={caseData.deceased.fullName} onChange={(value) => updateDeceased("fullName", value)} placeholder="Deceased member name" />
              <Field label="ID number" value={caseData.deceased.idNumber} onChange={(value) => updateDeceased("idNumber", value)} placeholder="13-digit SA ID" hint={ageLabel(caseData.deceased)} />
              <Field label="Manual age" value={caseData.deceased.manualAge} onChange={(value) => updateDeceased("manualAge", value)} placeholder="If ID is unavailable" />
              <Field label="Date of death (optional)" value={caseData.deceased.dateOfDeath} onChange={(value) => updateDeceased("dateOfDeath", value)} placeholder="If available" />
            </div>
          </AccordionPanel>

          <AccordionPanel
            id="family-background"
            title="Family Background"
            summary={setupById["family-background"].summary}
            complete={setupById["family-background"].complete}
            open={openPanels.has("family-background")}
            onToggle={togglePanel}
          >
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
            {caseData.scenarios.motherStatus === "Alive" || caseData.scenarios.fatherStatus === "Alive" ? (
              <p className="panel-guidance">Alive parent status is informational. Add the parent under Beneficiaries when person-specific documents are needed.</p>
            ) : null}
          </AccordionPanel>

          <AccordionPanel
            id="beneficiaries"
            title={`Beneficiaries (${caseData.beneficiaries.length})`}
            summary={setupById.beneficiaries.summary}
            complete={setupById.beneficiaries.complete}
            open={openPanels.has("beneficiaries")}
            onToggle={togglePanel}
            action={<button className="small-btn" type="button" onClick={addBeneficiary}>Add beneficiary</button>}
          >
            {missingSpouse ? (
              <div className="workflow-prompt" role="status">
                <strong>Add the spouse as a beneficiary</strong>
                <span>Marriage status no longer creates an anonymous document section. Add the named spouse here when their documents are required.</span>
              </div>
            ) : null}
            <div className="person-stack">
              {caseData.beneficiaries.map((person, index) => (
                <BeneficiaryEditor
                  key={person.id}
                  index={index}
                  person={person}
                  canRemove={caseData.beneficiaries.length > 1}
                  inputRef={pendingNewBeneficiaryIdRef.current === person.id ? newBeneficiaryNameRef : undefined}
                  onChange={updateBeneficiary}
                  onRemove={removeBeneficiary}
                />
              ))}
            </div>
          </AccordionPanel>

          <AccordionPanel
            id="witnesses"
            title={`Witnesses (${caseData.witnesses.length})`}
            summary={setupById.witnesses.summary}
            complete={setupById.witnesses.complete}
            open={openPanels.has("witnesses")}
            onToggle={togglePanel}
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
          </AccordionPanel>
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

      {confirmation ? (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeConfirmation();
        }}>
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
          >
            <span className="dialog-kicker">Confirm action</span>
            <h2 id="confirm-dialog-title">{confirmation.title}</h2>
            <p id="confirm-dialog-message">{confirmation.message}</p>
            <div className="dialog-actions">
              <button type="button" className="secondary-btn" onClick={closeConfirmation}>Cancel</button>
              <button
                ref={confirmationButtonRef}
                type="button"
                className="danger-btn"
                onClick={() => {
                  confirmation.onConfirm();
                  closeConfirmation();
                }}
              >
                {confirmation.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function ReportApp() {
  const [caseData, setCaseData] = useState(() => loadSavedCase());
  const [generatedAt, setGeneratedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    const synchronize = (event) => {
      if (event.storageArea !== localStorage || event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        setCaseData(normalizeImportedCase(JSON.parse(event.newValue)));
        setGeneratedAt(new Date().toISOString());
      } catch {
        // Keep the last valid report snapshot when another tab writes malformed data.
      }
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);

  const sections = useMemo(() => buildSections(caseData), [caseData]);
  const setupSections = useMemo(() => getSetupSectionStates(caseData), [caseData]);
  const report = useMemo(
    () => buildReportModel({ caseData, sections, setupSections, generatedAt }),
    [caseData, sections, setupSections, generatedAt],
  );

  useEffect(() => {
    const previousTitle = document.title;
    const reference = report.caseReference === "Not captured" ? "Draft" : report.caseReference;
    document.title = `Case Progress Report - ${reference}`;
    return () => { document.title = previousTitle; };
  }, [report.caseReference]);

  if (!hasMeaningfulCaseData(caseData)) return <ReportEmptyState />;

  return (
    <main className="report-shell">
      <nav className="report-screen-actions" aria-label="Report actions">
        <a className="secondary-btn" href="/">Back to checklist</a>
        <button type="button" className="primary-btn" onClick={() => window.print()}>Print / Save PDF</button>
      </nav>

      <article className="report-paper">
        <header className="report-header">
          <div className="report-brand">
            <span className="brand-mark" aria-hidden="true">37C</span>
            <div>
              <span className="report-kicker">Operations and management</span>
              <h1>Case Progress Report</h1>
              <p>Document readiness and outstanding action summary</p>
            </div>
          </div>
          <div className="report-generated">
            <span>Generated</span>
            <strong>{formatReportTimestamp(report.generatedAt)}</strong>
          </div>
        </header>

        <dl className="report-case-facts" aria-label="Case identification">
          <ReportFact label="Case reference" value={report.caseReference} />
          <ReportFact label="Deceased member" value={report.deceasedName} />
          <ReportFact label="Member ID" value={report.deceasedId} />
          <ReportFact label="Date of death" value={report.dateOfDeath} />
        </dl>

        <section className="report-summary" aria-labelledby="report-summary-title">
          <div className="report-section-heading">
            <span>01</span>
            <div>
              <h2 id="report-summary-title">Progress summary</h2>
              <p>Completion is calculated from applicable checklist documents; N/A items are excluded from the percentage.</p>
            </div>
          </div>
          <div className="report-metric-grid">
            <ReportMetric label="Readiness" value={report.readiness} tone={readinessTone(report.readiness)} />
            <ReportMetric label="Complete" value={`${report.progress.percent}%`} detail={`${report.progress.have} of ${report.progress.applicable} applicable`} />
            <ReportMetric label="Missing" value={report.progress.missing} tone={report.progress.missing ? "missing" : "complete"} />
            <ReportMetric label="Needs clarification" value={report.progress.unclear} tone={report.progress.unclear ? "warning" : "complete"} />
            <ReportMetric label="Not applicable" value={report.progress.notApplicable} />
          </div>
        </section>

        <section className="report-section" aria-labelledby="report-gaps-title">
          <div className="report-section-heading">
            <span>02</span>
            <div>
              <h2 id="report-gaps-title">Case information still needed</h2>
              <p>Incomplete setup can change which documents apply to this case.</p>
            </div>
          </div>
          {report.setupWarnings.length ? (
            <ul className="report-warning-list">
              {report.setupWarnings.map((warning) => (
                <li key={warning.id}><strong>{warning.label}</strong><span>{warning.summary}</span></li>
              ))}
            </ul>
          ) : (
            <p className="report-complete-message">All required case setup areas are complete.</p>
          )}
        </section>

        <ReportDocumentSection
          number="03"
          title="Missing documents"
          description="Documents that have not yet been received."
          groups={report.missingGroups}
          emptyMessage="No documents are currently marked Missing."
          showEmptyNotes
        />

        <ReportDocumentSection
          number="04"
          title="Received but clarification needed"
          description="Documents received but not yet clear enough to close the checklist item."
          groups={report.unclearGroups}
          emptyMessage="No documents are currently marked Received but unclear."
          showEmptyNotes
        />

        <ReportDocumentSection
          number="05"
          title="Full document status appendix"
          description="Every currently generated checklist item, including Have, Missing, Received but unclear, and N/A."
          groups={report.checklistGroups}
          emptyMessage="No checklist documents have been generated for this draft."
          appendix
        />

        <footer className="report-footer">
          <span>Generated from Doc-Check 37C</span>
          <span>Status reflects the active checklist at {formatReportTimestamp(report.generatedAt)}</span>
        </footer>
      </article>
    </main>
  );
}

function ReportFact({ label, value }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function ReportMetric({ label, value, detail, tone = "" }) {
  return <div className={`report-metric ${tone}`}><span>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div>;
}

function ReportDocumentSection({ number, title, description, groups, emptyMessage, appendix = false, showEmptyNotes = false }) {
  return (
    <section className={`report-section report-documents ${appendix ? "report-appendix" : ""}`}>
      <div className="report-section-heading">
        <span>{number}</span>
        <div><h2>{title}</h2><p>{description}</p></div>
      </div>
      {groups.length ? groups.map((group) => (
        <section className="report-document-group" key={group.label}>
          <h3>{group.label}</h3>
          <div className="report-document-list">
            {group.items.map((item) => (
              <article className={`report-document-row ${statusClass(item.status)}`} key={item.key}>
                <div className="report-document-main">
                  <strong>{item.title}</strong>
                  <span>{item.requirement || "No requirement description captured"}</span>
                </div>
                <span className={`report-status ${statusClass(item.status)}`}>{item.status}</span>
                {item.reviewNote ? <p><b>Review note:</b> {item.reviewNote}</p> : showEmptyNotes ? <p className="report-no-note">No review note captured.</p> : null}
              </article>
            ))}
          </div>
        </section>
      )) : <p className="report-complete-message">{emptyMessage}</p>}
    </section>
  );
}

function ReportEmptyState() {
  return (
    <main className="report-empty-state">
      <span className="brand-mark" aria-hidden="true">37C</span>
      <strong>No active case to report.</strong>
      <p>Capture or load a case in the checklist, then generate the report again.</p>
      <a className="primary-btn" href="/">Back to checklist</a>
    </main>
  );
}

function formatReportTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not dated";
  return date.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PresenterApp() {
  const [caseData, setCaseData] = useState(() => loadSavedCase());
  const [savedCases, setSavedCases] = useState(() => loadSavedCases());
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(caseData));
  }, [caseData]);

  useEffect(() => {
    localStorage.setItem(SAVED_CASES_KEY, JSON.stringify(savedCases));
  }, [savedCases]);

  useEffect(() => {
    const synchronize = (event) => {
      if (event.storageArea !== localStorage) return;
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          setCaseData(normalizeImportedCase(JSON.parse(event.newValue)));
        } catch {
          // Ignore malformed data from an unrelated browser tab.
        }
      }
      if (event.key === SAVED_CASES_KEY && event.newValue) {
        try {
          setSavedCases(normalizeSavedCases(JSON.parse(event.newValue)));
        } catch {
          // Ignore malformed data from an unrelated browser tab.
        }
      }
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);

  const sections = useMemo(() => buildSections(caseData), [caseData]);
  const progress = useMemo(() => getProgress(sections, caseData.documentRecords), [sections, caseData.documentRecords]);
  const readiness = useMemo(() => getReadiness(progress), [progress]);
  const presenter = useMemo(
    () => normalizePresenter(caseData.presenter, caseData.beneficiaries),
    [caseData.presenter, caseData.beneficiaries],
  );
  const allocation = useMemo(
    () => getAllocationSummary(presenter.beneficiaryFindings),
    [presenter.beneficiaryFindings],
  );
  const actionableRows = useMemo(
    () => collectDocumentRows(sections, caseData.documentRecords)
      .filter((row) => ["Missing", "Received but unclear"].includes(row.record.status)),
    [sections, caseData.documentRecords],
  );

  if (!hasMeaningfulCaseData(caseData)) return <PresenterEmptyState />;

  function updatePresenter(field, value) {
    setCaseData((current) => ({
      ...current,
      presenter: {
        ...normalizePresenter(current.presenter, current.beneficiaries),
        [field]: value,
      },
    }));
  }

  function updateBeneficiaryFinding(beneficiaryId, field, value) {
    setCaseData((current) => {
      const normalized = normalizePresenter(current.presenter, current.beneficiaries);
      return {
        ...current,
        presenter: {
          ...normalized,
          beneficiaryFindings: {
            ...normalized.beneficiaryFindings,
            [beneficiaryId]: {
              ...createEmptyBeneficiaryFinding(),
              ...normalized.beneficiaryFindings[beneficiaryId],
              [field]: value,
            },
          },
        },
      };
    });
  }

  function saveCurrentCase() {
    const error = validateCaseReference(caseData.caseReference);
    if (error) {
      setFeedback(error);
      return;
    }
    const entry = buildSavedCaseEntry(caseData, progress, readiness);
    setSavedCases((current) => [entry, ...current.filter((item) => item.id !== entry.id)]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
    setFeedback(`Case ${entry.caseReference} saved.`);
  }

  return (
    <main className="presenter-shell">
      <header className="presenter-header">
        <div className="presenter-brand">
          <span className="brand-mark" aria-hidden="true">37C</span>
          <div>
            <span className="presenter-kicker">Internal presenter notes</span>
            <h1>{caseData.caseReference || "Case presentation"}</h1>
            <p>{caseData.deceased.fullName || "Deceased member not captured"}</p>
            <span className="presenter-private-badge">Private working view</span>
          </div>
        </div>
        <div className="presenter-actions" aria-label="Presenter actions">
          <a className="secondary-btn" href="/">Back to checklist</a>
          <button type="button" className="secondary-btn" onClick={() => window.print()}>Print notes</button>
          <button type="button" className="primary-btn" onClick={saveCurrentCase}>Save case</button>
        </div>
      </header>

      {feedback ? <div className="presenter-feedback" role="status">{feedback}</div> : null}

      <section className="presenter-hero" aria-label="Case at a glance">
        <div>
          <span>Case readiness</span>
          <strong className={readinessTone(readiness)}>{readiness}</strong>
        </div>
        <div>
          <span>Document completion</span>
          <strong>{progress.percent}%</strong>
          <small>{progress.have} of {progress.applicable} applicable documents received</small>
        </div>
        <div>
          <span>Needs action</span>
          <strong className={progress.actionable ? "missing" : "complete"}>{progress.actionable}</strong>
          <small>{progress.missing} missing · {progress.unclear} unclear</small>
        </div>
      </section>

      <section className="presenter-section presenter-facts">
        <div className="presenter-section-heading">
          <span>01</span>
          <div><h2>Case at a glance</h2><p>Verified facts already captured in the checklist.</p></div>
        </div>
        <dl className="presenter-fact-grid">
          <PresenterFact label="Case reference" value={caseData.caseReference} />
          <PresenterFact label="Deceased member" value={caseData.deceased.fullName} />
          <PresenterFact label="Member ID" value={caseData.deceased.idNumber} />
          <PresenterFact label="Age" value={presenterAge(caseData.deceased)} />
          <PresenterFact label="Date of death" value={caseData.deceased.dateOfDeath} />
          <PresenterFact label="Death type" value={selectedValue(caseData.scenarios.deathType)} />
          <PresenterFact label="Marriage status" value={selectedValue(caseData.scenarios.marriageStatus)} />
          <PresenterFact label="Previously divorced" value={selectedValue(caseData.scenarios.previouslyDivorced)} />
          <PresenterFact label="Mother" value={selectedValue(caseData.scenarios.motherStatus)} />
          <PresenterFact label="Father" value={selectedValue(caseData.scenarios.fatherStatus)} />
        </dl>
      </section>

      <section className="presenter-section">
        <div className="presenter-section-heading">
          <span>02</span>
          <div><h2>Beneficiaries and dependency</h2><p>Capture your working dependency conclusion and the evidence behind it.</p></div>
        </div>
        {caseData.beneficiaries.length ? (
          <div className="presenter-beneficiary-list">
            {caseData.beneficiaries.map((person, index) => {
              const finding = presenter.beneficiaryFindings[person.id] || createEmptyBeneficiaryFinding();
              return (
                <article className="presenter-beneficiary" key={person.id}>
                  <header>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{person.name || "Unnamed beneficiary"}</h3>
                      <p>{beneficiaryType(person, caseData.scenarios).label} · Age {presenterAge(person)} · {selectedDependencyStatus(person) || "Dependency statement not captured"}</p>
                    </div>
                  </header>
                  <div className="presenter-beneficiary-fields">
                    <label className="presenter-field">
                      <span>Dependency finding</span>
                      <select value={finding.dependencyFinding} onChange={(event) => updateBeneficiaryFinding(person.id, "dependencyFinding", event.target.value)}>
                        {DEPENDENCY_FINDINGS.map((option) => <option key={option}>{option}</option>)}
                      </select>
                      <small className="print-value">{finding.dependencyFinding}</small>
                    </label>
                    <PresenterInput label="Proposed allocation (%)" value={finding.allocationPercentage} inputMode="decimal" type="number" min="0" max="100" step="0.01" onChange={(value) => updateBeneficiaryFinding(person.id, "allocationPercentage", value)} />
                    <PresenterInput label="Proposed amount (R)" value={finding.allocationAmount} inputMode="decimal" type="number" min="0" step="0.01" onChange={(value) => updateBeneficiaryFinding(person.id, "allocationAmount", value)} />
                  </div>
                  <PresenterTextArea label="Dependency evidence" value={finding.evidenceSummary} onChange={(value) => updateBeneficiaryFinding(person.id, "evidenceSummary", value)} placeholder="Support, household, income, caregiver and interview facts." />
                  <PresenterTextArea label="Allocation rationale" value={finding.allocationRationale} onChange={(value) => updateBeneficiaryFinding(person.id, "allocationRationale", value)} placeholder="Why this proposed allocation is appropriate." />
                </article>
              );
            })}
          </div>
        ) : <p className="presenter-empty-note">No named beneficiaries are captured yet. Return to the checklist to add them.</p>}
      </section>

      <section className="presenter-section presenter-allocation">
        <div className="presenter-section-heading">
          <span>03</span>
          <div><h2>Proposed allocation</h2><p>Amounts are optional. Percentages remain editable and are checked against 100%.</p></div>
        </div>
        <div className="presenter-allocation-summary">
          <PresenterInput label="Fund benefit amount (R)" value={presenter.fundBenefitAmount} inputMode="decimal" type="number" min="0" step="0.01" onChange={(value) => updatePresenter("fundBenefitAmount", value)} />
          <div><span>Total proposed percentage</span><strong>{allocation.hasPercentages ? `${allocation.percentageTotal}%` : "Not captured"}</strong></div>
          <div><span>Total proposed amount</span><strong>{allocation.hasAmounts ? formatZar(allocation.amountTotal) : "Not captured"}</strong></div>
        </div>
        {allocation.hasPercentages && !allocation.percentageComplete ? <p className="presenter-allocation-warning" role="status">Percentages currently total {allocation.percentageTotal}%. Confirm or adjust before presenting.</p> : null}
      </section>

      <section className="presenter-section presenter-notes-grid">
        <div className="presenter-section-heading">
          <span>04</span>
          <div><h2>Analysis, decision points and speaking notes</h2><p>Private working notes saved with the case for quick reference while presenting.</p></div>
        </div>
        <div className="presenter-note-grid">
          <PresenterTextArea label="Investigation and evidence summary" value={presenter.investigationSummary} onChange={(value) => updatePresenter("investigationSummary", value)} placeholder="What the tracer, affidavits, forms and records establish." />
          <PresenterTextArea label="Important interview answers" value={presenter.interviewHighlights} onChange={(value) => updatePresenter("interviewHighlights", value)} placeholder="Dependency, household, financial support, caregiver and employment highlights." />
          <PresenterTextArea label="Recommendation" value={presenter.recommendation} onChange={(value) => updatePresenter("recommendation", value)} placeholder="The recommendation to put before the Fund." />
          <PresenterTextArea label="Risks and contradictions" value={presenter.risksAndContradictions} onChange={(value) => updatePresenter("risksAndContradictions", value)} placeholder="Conflicting evidence, unresolved details or allocation checks." />
          <PresenterTextArea label="Questions requiring a Fund decision" value={presenter.fundQuestions} onChange={(value) => updatePresenter("fundQuestions", value)} placeholder="Decisions or clarifications needed from the Fund." />
          <PresenterTextArea label="Final speaking notes" value={presenter.speakingNotes} onChange={(value) => updatePresenter("speakingNotes", value)} placeholder="Your concise closing frame for the presentation." />
        </div>
      </section>

      <section className="presenter-section">
        <div className="presenter-section-heading">
          <span>05</span>
          <div><h2>Outstanding documents and review points</h2><p>Generated from the live checklist; not a separate list to maintain.</p></div>
        </div>
        {actionableRows.length ? (
          <div className="presenter-action-list">
            {actionableRows.map((row) => <article key={row.key} className={statusClass(row.record.status)}>
              <div><strong>{row.title}</strong><span>{row.group}{row.subtitle ? ` · ${row.subtitle}` : ""}</span></div>
              <p>{row.record.status}{row.record.notes ? ` — ${row.record.notes}` : ""}</p>
            </article>)}
          </div>
        ) : <p className="presenter-complete-note">No document items are currently marked Missing or Received but unclear.</p>}
      </section>

      <section className="presenter-section presenter-witnesses">
        <div className="presenter-section-heading">
          <span>06</span>
          <div><h2>Witnesses</h2><p>Captured contacts that can support the Fund discussion.</p></div>
        </div>
        <div className="presenter-witness-list">
          {caseData.witnesses.filter(hasWitnessDetails).length ? caseData.witnesses.filter(hasWitnessDetails).map((witness) => <div key={witness.id}>
            <strong>{witness.name || "Unnamed witness"}</strong><span>{witness.relationshipToDeceased || "Relationship not captured"}{witness.idNumber ? ` · ID ${witness.idNumber}` : ""}</span>
          </div>) : <p className="presenter-empty-note">No witness details captured.</p>}
        </div>
      </section>
    </main>
  );
}

function PresenterEmptyState() {
  useEffect(() => {
    const timer = window.setTimeout(() => window.location.replace("/"), 1200);
    return () => window.clearTimeout(timer);
  }, []);
  return <main className="presenter-empty-state"><strong>No active case to present.</strong><span>Returning to the checklist…</span><a href="/">Back to checklist now</a></main>;
}

function PresenterFact({ label, value }) {
  return <div><dt>{label}</dt><dd>{value || "Not captured"}</dd></div>;
}

function PresenterInput({ label, value, onChange, ...inputProps }) {
  return <label className="presenter-field"><span>{label}</span><input value={value || ""} onChange={(event) => onChange(event.target.value)} {...inputProps} /><small className="print-value">{value || "Not captured"}</small></label>;
}

function PresenterTextArea({ label, value, onChange, placeholder }) {
  return <label className="presenter-note"><span>{label}</span><textarea value={value || ""} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><small className="print-value">{value || "Not captured"}</small></label>;
}

function presenterAge(person) {
  const age = getPersonAge(person);
  return age == null ? "Not captured" : String(age);
}

function selectedValue(value) {
  return value && value !== CHOOSE_VALUE ? value : "Not captured";
}

function formatZar(value) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);
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

function AccordionPanel({ id, title, summary, complete, open, onToggle, action, children, statusLabel }) {
  const triggerId = `${id}-trigger`;
  const contentId = `${id}-content`;
  return (
    <section className={`panel accordion-panel ${open ? "open" : "collapsed"}`}>
      <header className="accordion-heading">
        <h2>
          <button
            id={triggerId}
            type="button"
            className="accordion-trigger"
            aria-expanded={open}
            aria-controls={contentId}
            onClick={() => onToggle(id)}
          >
            <span className="accordion-copy">
              <span className="accordion-title">{title}</span>
              <small>{summary}</small>
            </span>
            <span className={`completion-badge ${complete ? "complete" : "incomplete"}`}>
              {statusLabel || (complete ? "Complete" : "Needs details")}
            </span>
            <span className="accordion-chevron" aria-hidden="true">⌄</span>
          </button>
        </h2>
        {action}
      </header>
      {open ? (
        <div id={contentId} className="accordion-content" role="region" aria-labelledby={triggerId}>
          {children}
        </div>
      ) : null}
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

function SavedCasesPanel({ savedCases, onLoad, onRemove, open, onToggle }) {
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
    <AccordionPanel
      id="saved-cases"
      title="Saved Cases"
      summary={savedCases.length ? `${savedCases.length} saved ${savedCases.length === 1 ? "case" : "cases"}` : "No saved cases"}
      complete={savedCases.length > 0}
      statusLabel={String(savedCases.length)}
      open={open}
      onToggle={onToggle}
    >
      <div className="saved-cases-panel">
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
                <button type="button" className="text-danger" onClick={() => onRemove(item)}>Remove</button>
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
      </div>
    </AccordionPanel>
  );
}

function Field({ id, inputRef, label, value, onChange, placeholder, required, hint, error }) {
  const errorId = error && id ? `${id}-error` : undefined;
  return (
    <label className="field">
      <span>{label}{required ? <b> *</b> : null}</span>
      <input
        id={id}
        ref={inputRef}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
      />
      {hint ? <small>{hint}</small> : null}
      {error ? <small id={errorId} className="field-error">{error}</small> : null}
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

function BeneficiaryEditor({ person, index, canRemove, inputRef, onChange, onRemove }) {
  const age = getPersonAge(person);
  const type = beneficiaryType(person, defaultScenarios());

  return (
    <article className="person-card">
      <div className="person-title">
        <strong>Beneficiary {index + 1}</strong>
        <span className="chip">{type.label}</span>
      </div>
      <Field inputRef={inputRef} label="Name" value={person.name} onChange={(value) => onChange(person.id, "name", value)} placeholder="Beneficiary full name" />
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

  for (const { person } of getPersonSectionSpecs(caseData)) {
    const type = beneficiaryType(person, scenarios);
    sections.push({
      key: `beneficiary:${person.id}:${type.key}`,
      title: `${person.name || "Unnamed beneficiary"} - ${type.label}`,
      subtitle: beneficiarySubtitle(person),
      docs: filterBeneficiaryDocuments(person, type.docs),
      tone: type.key,
    });
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

function parentDeathDocs(key, label, status) {
  if (status === "Passed away") {
    return [
      doc(`${key}-death-certificate`, `${label} certified death certificate`, `Certified death certificate for the deceased member's ${label.toLowerCase()}`, "Family / DHA"),
    ];
  }
  return [];
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

function witnessSubtitle(witness) {
  return witness.relationshipToDeceased || "relationship not captured";
}

function hasWitnessDetails(witness) {
  return Boolean(String(witness.name || "").trim() || String(witness.idNumber || "").trim());
}

function readinessTone(readiness) {
  if (readiness === "Not ready") return "missing";
  if (readiness === "Ready for follow-up") return "warning";
  if (readiness === "Ready for trustee pack") return "complete";
  return "";
}

function buildFullCaseInfoText(caseData, sections, progress, readiness) {
  const rows = collectDocumentRows(sections, caseData.documentRecords);
  const beneficiaries = caseData.beneficiaries;
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

  appendPresenterInformation(lines, caseData.presenter, beneficiaries);
  appendAllDocumentsGroup(lines, rows);

  return `${lines.filter(Boolean).join("\n")}\n`;
}

function appendPresenterInformation(lines, presenter, beneficiaries) {
  const notes = normalizePresenter(presenter, beneficiaries);
  const allocation = getAllocationSummary(notes.beneficiaryFindings);
  const noteSections = [
    ["Investigation and evidence", notes.investigationSummary],
    ["Important interview answers", notes.interviewHighlights],
    ["Recommendation", notes.recommendation],
    ["Risks and contradictions", notes.risksAndContradictions],
    ["Questions for the Fund", notes.fundQuestions],
    ["Speaking notes", notes.speakingNotes],
  ];

  lines.push("", "Internal presenter notes");
  if (notes.fundBenefitAmount) lines.push(`- Fund benefit amount: R ${notes.fundBenefitAmount}`);
  if (allocation.hasPercentages) lines.push(`- Proposed allocation total: ${allocation.percentageTotal}%`);
  if (allocation.hasAmounts) lines.push(`- Proposed allocation amount total: R ${allocation.amountTotal.toFixed(2)}`);

  for (const person of beneficiaries) {
    const finding = notes.beneficiaryFindings[person.id];
    if (!finding) continue;
    lines.push(`- ${person.name || "Unnamed beneficiary"}: finding ${finding.dependencyFinding}; allocation ${finding.allocationPercentage || "not captured"}%`);
    if (finding.evidenceSummary) lines.push(`  Evidence: ${finding.evidenceSummary}`);
    if (finding.allocationRationale) lines.push(`  Allocation rationale: ${finding.allocationRationale}`);
  }

  for (const [title, value] of noteSections) {
    if (value) lines.push("", title, value);
  }
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

function statusClass(status) {
  return String(status || "Missing").toLowerCase().replace(/[^a-z0-9]+/g, "-");
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
    return normalizeSavedCases(saved);
  } catch {
    return [];
  }
}

function normalizeSavedCases(saved) {
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
    presenter: createEmptyPresenter(),
  };

  normalized.documentRecords = migrateDocumentRecords(base.documentRecords, base.checked);
  normalized.presenter = normalizePresenter(base.presenter, normalized.beneficiaries);
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

const rootView = resolveAppView(window.location.pathname);
createRoot(document.getElementById("root")).render(
  rootView === "presenter" ? <PresenterApp /> : rootView === "report" ? <ReportApp /> : <App />,
);
