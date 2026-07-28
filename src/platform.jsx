import React, { useEffect, useMemo, useState } from "react";
import { createCaseRepository } from "./caseRepository.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const LEGACY_SAVED_CASES_KEY = "caseDocumentChecklist.savedCases.v1";
const DRAFT_KEY = "caseDocumentChecklist.v1";
const REMOTE_META_KEY = "caseDocumentChecklist.remoteCase.v1";

export function storageKey(baseKey, userId) {
  return userId ? `${baseKey}.${userId}` : baseKey;
}

export function PlatformGate({ rootView, App, PresenterApp, ReportApp }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [authEvent, setAuthEvent] = useState("");
  const [migrationResult, setMigrationResult] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session || null);
      if (!data.session) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setAuthEvent(event);
      setSession(nextSession || null);
      if (!nextSession) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return undefined;
    let active = true;
    setLoading(true);
    loadProfile(session.user.id)
      .then((nextProfile) => {
        if (active) setProfile(nextProfile);
      })
      .catch(() => {
        if (active) setProfile(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const repository = useMemo(
    () => session && profile ? createCaseRepository(supabase, session, profile) : null,
    [session, profile],
  );

  useEffect(() => {
    if (!repository || profile?.account_status !== "approved") return;
    migrateLegacyCases(repository, session.user.id, profile.role).then(setMigrationResult);
  }, [repository, profile?.account_status, profile?.role, session?.user?.id]);

  if (!isSupabaseConfigured) {
    return rootView === "presenter"
      ? <PresenterApp />
      : rootView === "report"
        ? <ReportApp />
        : <App />;
  }

  if (loading) return <PlatformLoading />;
  if (authEvent === "PASSWORD_RECOVERY") return <AuthScreen recovery />;
  if (!session) return <AuthScreen recovery={authEvent === "PASSWORD_RECOVERY"} />;
  if (!profile) {
    return <AccountStateScreen title="Account setup incomplete" message="Your profile could not be loaded. Sign out and try again." platform={{ signOut: () => supabase.auth.signOut() }} />;
  }

  const platform = {
    enabled: true,
    session,
    profile,
    repository,
    migrationResult,
    signOut: () => supabase.auth.signOut(),
  };

  if (profile.account_status === "pending") {
    return <AccountStateScreen title="Approval pending" message="Your email is verified. An administrator must approve your account before you can view or save cases." platform={platform} />;
  }
  if (profile.account_status === "suspended") {
    return <AccountStateScreen title="Account suspended" message="This account cannot access case information. Contact an administrator." platform={platform} />;
  }

  if (rootView === "presenter") {
    if (profile.role === "tracer") {
      return <AccountStateScreen title="Internal view" message="Presenter information is restricted to the internal team." platform={platform} />;
    }
    return <PresenterApp platform={platform} readOnly={profile.role === "internal"} />;
  }
  if (rootView === "report") return <ReportApp platform={platform} />;

  if (profile.role === "internal") {
    return (
      <>
        <AccountBar platform={platform} />
        <CasesDashboard platform={platform} />
      </>
    );
  }

  return (
    <>
      <AccountBar platform={platform} />
      {profile.role === "admin" ? <AdminPanel platform={platform} /> : null}
      <App platform={platform} />
    </>
  );
}

async function loadProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data;
}

async function migrateLegacyCases(repository, userId, role) {
  const markerKey = `doc-check.remoteMigration.v1.${userId}`;
  const previous = localStorage.getItem(markerKey);
  if (previous) {
    try {
      const parsed = JSON.parse(previous);
      return parsed?.failures?.length ? parsed : null;
    } catch {
      return null;
    }
  }
  if (role === "internal") {
    localStorage.setItem(markerKey, JSON.stringify({ skipped: true }));
    return null;
  }

  let legacy = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_SAVED_CASES_KEY));
    legacy = Array.isArray(parsed) ? parsed : [];
  } catch {
    legacy = [];
  }

  let migrated = 0;
  const failures = [];
  for (const entry of legacy) {
    if (!entry?.caseData || !entry?.caseReference) continue;
    try {
      await repository.saveCase(entry);
      migrated += 1;
    } catch (error) {
      failures.push({ caseReference: entry.caseReference, message: error.message });
    }
  }

  const result = { migrated, failures, attempted: legacy.length };
  localStorage.setItem(markerKey, JSON.stringify(result));
  return legacy.length ? result : null;
}

function AuthScreen({ recovery = false }) {
  const [mode, setMode] = useState(recovery ? "update-password" : "login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    try {
      if (mode === "register") {
        validatePassword(form.password);
        const { error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { display_name: form.name.trim() } },
        });
        if (error) throw error;
        setFeedback("Check your email to verify the account. Approval is required after verification.");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(form.email, {
          redirectTo: `${window.location.origin}/`,
        });
        if (error) throw error;
        setFeedback("Password reset email sent.");
      } else if (mode === "update-password") {
        validatePassword(form.password);
        const { error } = await supabase.auth.updateUser({ password: form.password });
        if (error) throw error;
        window.location.replace("/");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (error) throw error;
      }
    } catch (error) {
      setFeedback(error.message || "Could not complete that request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark" aria-hidden="true">37C</div>
        <span className="auth-kicker">Doc-Check secure access</span>
        <h1>{authTitle(mode)}</h1>
        <p>{authDescription(mode)}</p>
        <form onSubmit={submit}>
          {mode === "register" ? (
            <label><span>Full name</span><input required autoComplete="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          ) : null}
          {mode !== "update-password" ? (
            <label><span>Email</span><input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          ) : null}
          {!["reset"].includes(mode) ? (
            <label>
              <span>{mode === "update-password" ? "New password" : "Password"}</span>
              <input required type="password" minLength={12} autoComplete={mode === "login" ? "current-password" : "new-password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
              {mode !== "login" ? <small>At least 12 characters with uppercase, lowercase, number, and symbol.</small> : null}
            </label>
          ) : null}
          <button className="primary-btn" type="submit" disabled={busy}>{busy ? "Please wait…" : authAction(mode)}</button>
        </form>
        {feedback ? <div className="auth-feedback" role="status">{feedback}</div> : null}
        <div className="auth-links">
          {mode !== "login" ? <button type="button" onClick={() => setMode("login")}>Sign in</button> : null}
          {mode !== "register" ? <button type="button" onClick={() => setMode("register")}>Create account</button> : null}
          {mode === "login" ? <button type="button" onClick={() => setMode("reset")}>Forgot password?</button> : null}
        </div>
      </section>
    </main>
  );
}

function validatePassword(password) {
  if (
    password.length < 12
    || !/[A-Z]/.test(password)
    || !/[a-z]/.test(password)
    || !/[0-9]/.test(password)
    || !/[^A-Za-z0-9]/.test(password)
  ) throw new Error("Use at least 12 characters with uppercase, lowercase, number, and symbol.");
}

function authTitle(mode) {
  if (mode === "register") return "Create an account";
  if (mode === "reset") return "Reset your password";
  if (mode === "update-password") return "Choose a new password";
  return "Sign in";
}

function authDescription(mode) {
  if (mode === "register") return "Verify your email, then wait for administrator approval.";
  if (mode === "reset") return "We will send a secure reset link to your email.";
  if (mode === "update-password") return "Enter a strong password for your account.";
  return "Access your saved cases from any approved device.";
}

function authAction(mode) {
  if (mode === "register") return "Create account";
  if (mode === "reset") return "Send reset email";
  if (mode === "update-password") return "Update password";
  return "Sign in";
}

function PlatformLoading() {
  return <main className="account-state"><div className="brand-mark">37C</div><strong>Loading secure workspace…</strong></main>;
}

function AccountStateScreen({ title, message, platform }) {
  return (
    <main className="account-state">
      <div className="brand-mark" aria-hidden="true">37C</div>
      <h1>{title}</h1>
      <p>{message}</p>
      {platform ? <button type="button" className="secondary-btn" onClick={platform.signOut}>Sign out</button> : null}
    </main>
  );
}

function AccountBar({ platform }) {
  const { profile, migrationResult } = platform;
  return (
    <div className="account-bar">
      <div>
        <strong>{profile.display_name || profile.email}</strong>
        <span>{roleLabel(profile.role)}</span>
      </div>
      {migrationResult ? (
        <p>{migrationResult.migrated} local {migrationResult.migrated === 1 ? "case" : "cases"} migrated{migrationResult.failures.length ? `; ${migrationResult.failures.length} need attention` : ""}.</p>
      ) : null}
      <button type="button" onClick={platform.signOut}>Sign out</button>
    </div>
  );
}

function AdminPanel({ platform }) {
  const [profiles, setProfiles] = useState([]);
  const [cases, setCases] = useState([]);
  const [activity, setActivity] = useState({});
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function refresh() {
    try {
      const [nextProfiles, nextCases] = await Promise.all([
        platform.repository.listProfiles(),
        platform.repository.listCases({ includeArchived: true }),
      ]);
      setProfiles(nextProfiles);
      setCases(nextCases);
    } catch (error) {
      setFeedback(error.message);
    }
  }

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function changeProfile(userId, role, accountStatus) {
    try {
      await platform.repository.updateProfile(userId, { role, accountStatus });
      setFeedback("Account access updated.");
      await refresh();
    } catch (error) {
      setFeedback(error.message);
    }
  }

  async function changeOwner(entry, ownerId) {
    try {
      await platform.repository.transferCase(entry, ownerId);
      setFeedback(`Ownership for ${entry.caseReference} updated.`);
      await refresh();
    } catch (error) {
      setFeedback(error.message);
    }
  }

  async function restoreCase(entry) {
    try {
      await platform.repository.archiveCase(entry, false);
      setFeedback(`Case ${entry.caseReference} restored.`);
      await refresh();
    } catch (error) {
      setFeedback(error.message);
    }
  }

  async function toggleActivity(entry) {
    if (activity[entry.id]) {
      setActivity((current) => ({ ...current, [entry.id]: null }));
      return;
    }
    try {
      const rows = await platform.repository.listActivity(entry.remoteId);
      setActivity((current) => ({ ...current, [entry.id]: rows }));
    } catch (error) {
      setFeedback(error.message);
    }
  }

  return (
    <section className="admin-panel">
      <button type="button" className="admin-panel-trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span><strong>User access</strong><small>Approve accounts and assign roles</small></span>
        <span>{open ? "Close" : "Manage"}</span>
      </button>
      {open ? (
        <div className="admin-user-list">
          {feedback ? <p className="admin-feedback" role="status">{feedback}</p> : null}
          {profiles.map((item) => (
            <article key={item.user_id}>
              <div><strong>{item.display_name || "Name not captured"}</strong><span>{item.email}</span></div>
              <label><span>Role</span><select disabled={item.user_id === platform.session.user.id} value={item.role} onChange={(event) => changeProfile(item.user_id, event.target.value, item.account_status)}><option value="tracer">External tracer</option><option value="internal">Internal team</option><option value="admin">Administrator</option></select></label>
              <label><span>Status</span><select disabled={item.user_id === platform.session.user.id} value={item.account_status} onChange={(event) => changeProfile(item.user_id, item.role, event.target.value)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="suspended">Suspended</option></select></label>
            </article>
          ))}
          <h3>Case ownership and history</h3>
          {cases.map((entry) => (
            <article className="admin-case-row" key={entry.id}>
              <div>
                <strong>{entry.caseReference}</strong>
                <span>{entry.deceasedName || "Member not captured"}{entry.archivedAt ? " · Archived" : ""}</span>
              </div>
              <label>
                <span>Owner</span>
                <select value={entry.ownerId} onChange={(event) => changeOwner(entry, event.target.value)}>
                  {profiles.filter((item) => item.account_status === "approved" && ["tracer", "admin"].includes(item.role)).map((item) => (
                    <option key={item.user_id} value={item.user_id}>{item.display_name || item.email}</option>
                  ))}
                </select>
              </label>
              <div className="admin-case-actions">
                {entry.archivedAt ? <button type="button" className="small-btn" onClick={() => restoreCase(entry)}>Restore</button> : null}
                <button type="button" className="small-btn" onClick={() => toggleActivity(entry)}>{activity[entry.id] ? "Hide history" : "History"}</button>
              </div>
              {activity[entry.id] ? (
                <ul className="admin-activity-list">
                  {activity[entry.id].map((item) => (
                    <li key={item.id}><strong>{item.action.replaceAll("_", " ")}</strong><span>{new Date(item.created_at).toLocaleString("en-ZA")} · {item.progress_percent}% · {item.readiness}</span></li>
                  ))}
                  {!activity[entry.id].length ? <li>No activity recorded.</li> : null}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CasesDashboard({ platform }) {
  const [cases, setCases] = useState([]);
  const [query, setQuery] = useState("");
  const [readiness, setReadiness] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function refresh() {
    try {
      setCases(await platform.repository.listCases({ includeArchived: showArchived }));
      setFeedback("");
    } catch (error) {
      setFeedback(error.message);
    }
  }

  useEffect(() => {
    refresh();
    return platform.repository.subscribe(refresh);
  }, [platform.repository, showArchived]);

  const filtered = cases.filter((item) => {
    const matchesQuery = [item.caseReference, item.deceasedName, item.ownerName]
      .some((value) => String(value || "").toLowerCase().includes(query.trim().toLowerCase()));
    return matchesQuery && (readiness === "all" || item.readiness === readiness);
  });

  function openCase(entry, view) {
    const userId = platform.session.user.id;
    localStorage.setItem(storageKey(DRAFT_KEY, userId), JSON.stringify(entry.caseData));
    localStorage.setItem(storageKey(REMOTE_META_KEY, userId), JSON.stringify({
      id: entry.remoteId,
      version: entry.remoteVersion,
      ownerId: entry.ownerId,
    }));
    window.location.assign(view);
  }

  return (
    <main className="shared-dashboard">
      <header>
        <div><span>Internal oversight</span><h1>All cases</h1><p>Live, read-only progress across external tracers.</p></div>
        <div className="dashboard-summary"><strong>{cases.length}</strong><span>visible cases</span></div>
      </header>
      <section className="dashboard-filters" aria-label="Case filters">
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search case, member, or tracer" />
        <select value={readiness} onChange={(event) => setReadiness(event.target.value)}>
          <option value="all">All readiness</option>
          <option value="Not ready">Not ready</option>
          <option value="Ready for follow-up">Ready for follow-up</option>
          <option value="Ready for trustee pack">Ready for trustee pack</option>
          <option value="Ready for review">Ready for review</option>
        </select>
        <label><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Include archived</label>
      </section>
      {feedback ? <div className="app-feedback error" role="alert">{feedback}</div> : null}
      <section className="dashboard-case-list">
        {filtered.map((item) => (
          <article key={item.id} className={item.archivedAt ? "archived" : ""}>
            <div><span>{item.ownerName || "Tracer"}</span><h2>{item.caseReference}</h2><p>{item.deceasedName || "Member not captured"}</p></div>
            <div className="dashboard-progress"><strong>{item.progress.percent}%</strong><span>{item.progress.actionable} action items</span></div>
            <div><strong className={`dashboard-readiness ${readinessClass(item.readiness)}`}>{item.readiness}</strong><span>{new Date(item.updatedAt).toLocaleString("en-ZA")}</span></div>
            <footer>
              <button type="button" className="small-btn" onClick={() => openCase(item, "/report")}>View report</button>
              <button type="button" className="small-btn" onClick={() => openCase(item, "/presenter")}>Internal notes</button>
            </footer>
          </article>
        ))}
        {!filtered.length ? <p className="empty-note">No cases match these filters.</p> : null}
      </section>
    </main>
  );
}

function roleLabel(role) {
  if (role === "admin") return "Administrator";
  if (role === "internal") return "Internal team · read only";
  return "External tracer";
}

function readinessClass(value) {
  if (value === "Ready for trustee pack") return "complete";
  if (value === "Ready for follow-up") return "warning";
  return value === "Not ready" ? "missing" : "";
}
