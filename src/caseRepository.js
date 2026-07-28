export class CaseConflictError extends Error {
  constructor(message = "This case was updated on another device.") {
    super(message);
    this.name = "CaseConflictError";
  }
}

export class DuplicateCaseReferenceError extends Error {
  constructor(message = "That case reference already exists.") {
    super(message);
    this.name = "DuplicateCaseReferenceError";
  }
}

export function splitCaseSnapshot(caseData = {}) {
  const { presenter = {}, ...externalCaseData } = caseData || {};
  return { externalCaseData, presenter };
}

export function combineCaseSnapshot(externalCaseData = {}, presenter = {}) {
  return { ...externalCaseData, presenter };
}

export function normalizeCaseReference(value) {
  return String(value || "").trim();
}

export function toSavedCaseEntry(row, internalData, owner) {
  const caseData = combineCaseSnapshot(row.case_data, internalData?.presenter || {});
  return {
    id: row.id,
    caseReference: row.case_reference,
    deceasedName: row.deceased_name || caseData.deceased?.fullName || "",
    readiness: row.readiness,
    progress: {
      percent: row.progress_percent,
      have: row.progress_have,
      applicable: row.progress_applicable,
      actionable: row.progress_actionable,
      missing: row.progress_missing,
      unclear: row.progress_unclear,
    },
    updatedAt: row.updated_at,
    caseData,
    remoteId: row.id,
    remoteVersion: row.version,
    ownerId: row.owner_id,
    ownerName: owner?.display_name || owner?.email || "",
    archivedAt: row.archived_at,
  };
}

export function createCaseRepository(client, session, profile) {
  const role = profile?.role;
  const userId = session?.user?.id;

  async function listCases({ includeArchived = false } = {}) {
    let query = client.from("cases").select("*").order("updated_at", { ascending: false });
    if (!includeArchived) query = query.is("archived_at", null);
    const { data: rows, error } = await query;
    if (error) throw error;
    if (!rows?.length) return [];

    let internalByCase = new Map();
    if (role === "internal" || role === "admin") {
      const { data: internalRows, error: internalError } = await client
        .from("case_internal_data")
        .select("case_id,presenter")
        .in("case_id", rows.map((row) => row.id));
      if (internalError) throw internalError;
      internalByCase = new Map((internalRows || []).map((item) => [item.case_id, item]));
    }

    let owners = new Map();
    if (role === "internal" || role === "admin") {
      const { data: ownerRows, error: ownerError } = await client
        .from("profiles")
        .select("user_id,display_name,email")
        .in("user_id", [...new Set(rows.map((row) => row.owner_id))]);
      if (ownerError) throw ownerError;
      owners = new Map((ownerRows || []).map((item) => [item.user_id, item]));
    }

    return rows.map((row) => toSavedCaseEntry(
      row,
      internalByCase.get(row.id),
      owners.get(row.owner_id),
    ));
  }

  async function saveCase(entry, remote = null) {
    if (!["tracer", "admin"].includes(role)) {
      throw new Error("This account has read-only case access.");
    }

    const { externalCaseData, presenter } = splitCaseSnapshot(entry.caseData);
    const payload = {
      case_reference: normalizeCaseReference(entry.caseReference),
      deceased_name: entry.deceasedName || "",
      case_data: externalCaseData,
      readiness: entry.readiness || "Not ready",
      progress_percent: Number(entry.progress?.percent || 0),
      progress_have: Number(entry.progress?.have || 0),
      progress_applicable: Number(entry.progress?.applicable || 0),
      progress_actionable: Number(entry.progress?.actionable || 0),
      progress_missing: Number(entry.progress?.missing || 0),
      progress_unclear: Number(entry.progress?.unclear || 0),
    };

    const { data, error } = await client.rpc("save_case_snapshot", {
      p_id: remote?.id || null,
      p_expected_version: remote?.version || null,
      p_owner_id: remote?.ownerId || userId,
      p_case_reference: payload.case_reference,
      p_deceased_name: payload.deceased_name,
      p_case_data: payload.case_data,
      p_readiness: payload.readiness,
      p_progress_percent: payload.progress_percent,
      p_progress_have: payload.progress_have,
      p_progress_applicable: payload.progress_applicable,
      p_progress_actionable: payload.progress_actionable,
      p_progress_missing: payload.progress_missing,
      p_progress_unclear: payload.progress_unclear,
      p_presenter: role === "admin" ? presenter : null,
    });
    if (error) throwMappedError(error);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new CaseConflictError();

    return toSavedCaseEntry(
      row,
      role === "admin" ? { presenter } : null,
      remote?.ownerId === userId || !remote?.ownerId ? profile : null,
    );
  }

  async function archiveCase(entry, archived = true) {
    if (!entry?.remoteId) throw new Error("Only database cases can be archived.");
    const { data, error } = await client
      .from("cases")
      .update({ archived_at: archived ? new Date().toISOString() : null })
      .eq("id", entry.remoteId)
      .eq("version", entry.remoteVersion)
      .select()
      .maybeSingle();
    if (error) throwMappedError(error);
    if (!data) throw new CaseConflictError();
    return data;
  }

  async function transferCase(entry, ownerId) {
    if (role !== "admin") throw new Error("Only administrators can change case ownership.");
    const { data, error } = await client
      .from("cases")
      .update({ owner_id: ownerId })
      .eq("id", entry.remoteId)
      .eq("version", entry.remoteVersion)
      .select()
      .maybeSingle();
    if (error) throwMappedError(error);
    if (!data) throw new CaseConflictError();
    return data;
  }

  function subscribe(onChange) {
    const channel = client
      .channel(`doc-check-cases-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cases" }, onChange)
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }

  async function listProfiles() {
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function updateProfile(userIdToUpdate, changes) {
    const allowed = {
      role: changes.role,
      account_status: changes.accountStatus,
      approved_at: changes.accountStatus === "approved" ? new Date().toISOString() : null,
      approved_by: changes.accountStatus === "approved" ? userId : null,
    };
    const { data, error } = await client
      .from("profiles")
      .update(allowed)
      .eq("user_id", userIdToUpdate)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function listActivity(caseId) {
    const { data, error } = await client
      .from("case_activity")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  return {
    listCases,
    saveCase,
    archiveCase,
    transferCase,
    subscribe,
    listProfiles,
    updateProfile,
    listActivity,
  };
}

function throwMappedError(error) {
  if (error?.code === "23505") throw new DuplicateCaseReferenceError();
  if (error?.code === "40001") throw new CaseConflictError();
  throw error;
}
