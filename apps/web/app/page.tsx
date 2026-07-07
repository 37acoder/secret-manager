"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Project = {
  id: string;
  name: string;
  description: string;
};

type Vault = {
  id: string;
  projectId: string;
  name: string;
  environment: string;
  secretCount: number;
  updatedAt: string;
};

type Secret = {
  id: string;
  vaultId: string;
  key: string;
  maskedValue: string;
  version: number;
  updatedAt: string;
  description: string;
};

type SecretVersion = {
  version: number;
  maskedValue: string;
  changedAt: string;
  changedBy: string;
};

type AuditEvent = {
  id: string;
  action: string;
  secretKey?: string;
  actor: string;
  createdAt: string;
};

type ImportPreviewLine = {
  lineNumber: number;
  raw: string;
  key?: string;
  valuePreview?: string;
  status: "valid" | "invalid" | "duplicate";
  message: string;
};

type ImportPreview = {
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  lines: ImportPreviewLine[];
};

type ImportResult = {
  created: Secret[];
  updated: Secret[];
  skipped: ImportPreviewLine[];
  invalid: ImportPreviewLine[];
};

type ExportResult = {
  filename?: string;
  content?: string;
  warning?: string;
  status?: "deferred";
  reason?: string;
  nextStep?: string;
};

type LoginState = {
  actor: string;
  project: Project;
};

type TrustState = "demo-safe" | "locked" | "wrong-passphrase" | "storage-unavailable" | "export-failure" | "screenshot-safe";
type DrawerMode = "new-project" | "new-vault" | "add-secret" | "rotate-secret" | null;
type TransferMode = "import" | "export" | null;

const actorHeader = { "x-secret-manager-actor": "demo@37a.home" };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...actorHeader,
      ...init?.headers
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function trustStateCopy(trustState: TrustState) {
  switch (trustState) {
    case "locked":
      return "Vault locked. Re-authentication is required before reveal, copy, import, or export.";
    case "wrong-passphrase":
      return "Wrong passphrase. Check the passphrase and start a fresh demo session.";
    case "storage-unavailable":
      return "Storage unavailable. Changes are paused until local persistence returns.";
    case "export-failure":
      return "Export failed. No partial plaintext file was produced.";
    case "screenshot-safe":
      return "Screenshot-safe: values remain masked and reveal output is hidden.";
    default:
      return "Demo-safe: fake provider keys and local sample data only.";
  }
}

export default function Home() {
  const [login, setLogin] = useState<LoginState | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [selectedVaultId, setSelectedVaultId] = useState("");
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [selectedSecretId, setSelectedSecretId] = useState("");
  const [versions, setVersions] = useState<SecretVersion[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [revealedValue, setRevealedValue] = useState("");
  const [deleteKeyConfirm, setDeleteKeyConfirm] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [transferMode, setTransferMode] = useState<TransferMode>(null);
  const [projectForm, setProjectForm] = useState({ name: "Launch Validation", description: "Local prototype vaults" });
  const [projectEditForm, setProjectEditForm] = useState({ name: "", description: "" });
  const [vaultForm, setVaultForm] = useState({ name: "Customer Demo", environment: "staging" });
  const [vaultEditForm, setVaultEditForm] = useState({ name: "", environment: "" });
  const [secretForm, setSecretForm] = useState({
    key: "DEMO_PROVIDER_KEY",
    value: "demo-created-secret-value",
    description: "Fake demo provider key",
    tags: "provider,demo"
  });
  const [updateValue, setUpdateValue] = useState("demo-rotated-secret-value");
  const [importContent, setImportContent] = useState("DEMO_DATABASE_URL=postgres://fake-demo\nSTRIPE_API_KEY=duplicate\nBAD LINE");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [conflictStrategy, setConflictStrategy] = useState<"skip" | "overwrite">("skip");
  const [plaintextConfirmed, setPlaintextConfirmed] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [trustState, setTrustState] = useState<TrustState>("demo-safe");
  const isLocked = trustState === "locked";
  const isScreenshotSafe = trustState === "screenshot-safe";
  const plaintextActionsBlocked = isLocked || isScreenshotSafe;

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId]
  );
  const selectedVault = useMemo(() => vaults.find((vault) => vault.id === selectedVaultId), [vaults, selectedVaultId]);
  const selectedSecret = useMemo(
    () => secrets.find((secret) => secret.id === selectedSecretId),
    [secrets, selectedSecretId]
  );
  const recentAudit = auditEvents.slice(0, 5);
  const hasDuplicateDraft = secrets.some((secret) => {
    const keyMatches = secret.key.toLowerCase() === secretForm.key.trim().toLowerCase();
    return drawerMode === "rotate-secret" ? keyMatches && secret.id !== selectedSecretId : keyMatches;
  });

  async function loadProjects() {
    const data = await api<{ projects: Project[] }>("/api/projects");
    setProjects(data.projects);
    setSelectedProjectId((current) => (data.projects.some((project) => project.id === current) ? current : data.projects[0]?.id || ""));
    return data.projects;
  }

  async function loadVaults(projectId: string) {
    const data = await api<{ vaults: Vault[] }>(`/api/projects/${projectId}/vaults`);
    setVaults(data.vaults);
    setSelectedVaultId((current) => (data.vaults.some((vault) => vault.id === current) ? current : data.vaults[0]?.id || ""));
    return data.vaults;
  }

  async function loadSecrets(vaultId: string) {
    const data = await api<{ secrets: Secret[] }>(`/api/vaults/${vaultId}/secrets`);
    setSecrets(data.secrets);
    setSelectedSecretId((current) => (data.secrets.some((secret) => secret.id === current) ? current : data.secrets[0]?.id || ""));
    setRevealedValue("");
    return data.secrets;
  }

  async function loadVersions(secretId: string) {
    const data = await api<{ versions: SecretVersion[] }>(`/api/secrets/${secretId}/versions`);
    setVersions(data.versions);
  }

  async function loadAuditEvents() {
    const data = await api<{ auditEvents: AuditEvent[] }>("/api/audit-events");
    setAuditEvents(data.auditEvents);
  }

  async function refresh(projectId: string, vaultId?: string, secretId?: string) {
    const loadedProjects = await loadProjects();
    const projectToLoad = loadedProjects.some((project) => project.id === projectId) ? projectId : loadedProjects[0]?.id || "";
    setSelectedProjectId(projectToLoad);
    if (!projectToLoad) {
      setVaults([]);
      setSelectedVaultId("");
      setSecrets([]);
      setSelectedSecretId("");
      setVersions([]);
      await loadAuditEvents();
      return;
    }
    const nextVaults = await loadVaults(projectToLoad);
    const candidateVaultId = vaultId || selectedVaultId;
    const vaultToLoad = nextVaults.some((vault) => vault.id === candidateVaultId) ? candidateVaultId : nextVaults[0]?.id;
    if (vaultToLoad) {
      const nextSecrets = await loadSecrets(vaultToLoad);
      const candidateSecretId = secretId || selectedSecretId;
      const secretToLoad = nextSecrets.some((secret) => secret.id === candidateSecretId) ? candidateSecretId : nextSecrets[0]?.id;
      if (secretToLoad) {
        await loadVersions(secretToLoad);
      }
    }
    await loadAuditEvents();
  }

  useEffect(() => {
    void loadProjects();
    void loadAuditEvents();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      void loadVaults(selectedProjectId);
    } else {
      setVaults([]);
      setSelectedVaultId("");
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedVaultId) {
      void loadSecrets(selectedVaultId);
    } else {
      setSecrets([]);
      setSelectedSecretId("");
    }
  }, [selectedVaultId]);

  useEffect(() => {
    if (selectedSecretId) {
      void loadVersions(selectedSecretId);
    } else {
      setVersions([]);
    }
  }, [selectedSecretId]);

  useEffect(() => {
    setProjectEditForm({
      name: selectedProject?.name || "",
      description: selectedProject?.description || ""
    });
  }, [selectedProject]);

  useEffect(() => {
    setVaultEditForm({
      name: selectedVault?.name || "",
      environment: selectedVault?.environment || ""
    });
  }, [selectedVault]);

  async function runAction(action: () => Promise<void>) {
    setError("");
    setNotice("");
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Request failed");
    }
  }

  function openDrawer(nextMode: Exclude<DrawerMode, null>) {
    setError("");
    setNotice("");
    if (nextMode === "rotate-secret" && selectedSecret) {
      setSecretForm({
        key: selectedSecret.key,
        value: updateValue,
        description: selectedSecret.description,
        tags: "rotation"
      });
    }
    setDrawerMode(nextMode);
  }

  function closeDrawer() {
    setDrawerMode(null);
    setDeleteKeyConfirm("");
  }

  function openTransfer(nextMode: Exclude<TransferMode, null>) {
    setError("");
    setNotice("");
    setExportResult(null);
    if (nextMode === "import") {
      setImportPreview(null);
    }
    setTransferMode(nextMode);
  }

  function changeTrustState(nextTrustState: TrustState) {
    setTrustState(nextTrustState);
    if (nextTrustState === "locked" || nextTrustState === "screenshot-safe") {
      setRevealedValue("");
      setExportResult(null);
    }
  }

  async function loginDemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      const data = await api<LoginState>("/api/login", {
        method: "POST",
        body: JSON.stringify({ email: "demo@37a.home" })
      });
      setLogin(data);
      const loadedProjects = projects.length ? projects : await loadProjects();
      await refresh(data.project.id || loadedProjects[0].id);
      setNotice("Signed in to the demo workspace.");
    });
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      const data = await api<{ project: Project }>("/api/projects", {
        method: "POST",
        body: JSON.stringify(projectForm)
      });
      setSelectedProjectId(data.project.id);
      await refresh(data.project.id);
      closeDrawer();
      setNotice(`Project ${data.project.name} created.`);
    });
  }

  async function updateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) return;
    await runAction(async () => {
      const data = await api<{ project: Project }>(`/api/projects/${selectedProjectId}`, {
        method: "PATCH",
        body: JSON.stringify(projectEditForm)
      });
      await refresh(data.project.id, selectedVaultId, selectedSecretId);
      closeDrawer();
      setNotice(`Project renamed to ${data.project.name}.`);
    });
  }

  async function createVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!login || !selectedProjectId) return;
    await runAction(async () => {
      const data = await api<{ vault: Vault }>(`/api/projects/${selectedProjectId}/vaults`, {
        method: "POST",
        body: JSON.stringify(vaultForm)
      });
      setSelectedVaultId(data.vault.id);
      await refresh(selectedProjectId, data.vault.id);
      closeDrawer();
      setNotice(`Vault ${data.vault.name} created.`);
    });
  }

  async function updateVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!login || !selectedVaultId) return;
    await runAction(async () => {
      const data = await api<{ vault: Vault }>(`/api/vaults/${selectedVaultId}`, {
        method: "PATCH",
        body: JSON.stringify(vaultEditForm)
      });
      setSelectedVaultId(data.vault.id);
      await refresh(selectedProjectId, data.vault.id, selectedSecretId);
      closeDrawer();
      setNotice(`Vault renamed to ${data.vault.name}.`);
    });
  }

  async function createSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!login || !selectedVaultId) return;
    if (hasDuplicateDraft) {
      setError("Duplicate secret key in this environment. Rotate the existing row or choose another key.");
      return;
    }
    await runAction(async () => {
      const data = await api<{ secret: Secret }>(`/api/vaults/${selectedVaultId}/secrets`, {
        method: "POST",
        body: JSON.stringify({
          key: secretForm.key,
          value: secretForm.value,
          description: secretForm.description
        })
      });
      setSelectedSecretId(data.secret.id);
      await refresh(selectedProjectId, selectedVaultId, data.secret.id);
      closeDrawer();
      setNotice(`Secret ${data.secret.key} created with a masked default view.`);
    });
  }

  async function revealSecret(secretId = selectedSecretId) {
    if (!secretId) return;
    if (plaintextActionsBlocked) {
      setRevealedValue("");
      setError("");
      setNotice(isLocked ? "Vault is locked. Re-authenticate before revealing secrets." : "Screenshot-safe mode keeps reveal output hidden.");
      return;
    }
    await runAction(async () => {
      setSelectedSecretId(secretId);
      const data = await api<{ secret: { value: string } }>(`/api/secrets/${secretId}/reveal`, { method: "POST" });
      setRevealedValue(data.secret.value);
      await loadAuditEvents();
      setNotice("Secret revealed and audit event recorded.");
    });
  }

  async function copySecret(secretId = selectedSecretId) {
    if (!secretId) return;
    if (plaintextActionsBlocked) {
      setError("");
      setNotice(isLocked ? "Vault is locked. Re-authenticate before copying secrets." : "Screenshot-safe mode blocks copying plaintext.");
      return;
    }
    await runAction(async () => {
      setSelectedSecretId(secretId);
      const data = await api<{ secret: { value: string } }>(`/api/secrets/${secretId}/copy`, { method: "POST" });
      if (!navigator.clipboard?.writeText) {
        await loadAuditEvents();
        setNotice("Clipboard unavailable. Copy was audited, but the value was not written to the clipboard.");
        return;
      }
      try {
        await navigator.clipboard.writeText(data.secret.value);
      } catch {
        await loadAuditEvents();
        setNotice("Clipboard unavailable. Copy was audited, but the value was not written to the clipboard.");
        return;
      }
      await loadAuditEvents();
      setNotice("Secret copied through the audited copy endpoint.");
    });
  }

  async function updateSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!login || !selectedSecretId) return;
    await runAction(async () => {
      const data = await api<{ secret: Secret }>(`/api/secrets/${selectedSecretId}`, {
        method: "PATCH",
        body: JSON.stringify({ value: secretForm.value || updateValue, description: secretForm.description || selectedSecret?.description })
      });
      setUpdateValue(secretForm.value || updateValue);
      await refresh(selectedProjectId, data.secret.vaultId, data.secret.id);
      closeDrawer();
      setNotice(`Secret rotated to version ${data.secret.version}.`);
    });
  }

  async function deleteSecret() {
    if (!login || !selectedSecretId) return;
    await runAction(async () => {
      if (deleteKeyConfirm !== selectedSecret?.key) {
        throw new Error("Type the exact secret key before deleting.");
      }
      await api(`/api/secrets/${selectedSecretId}`, { method: "DELETE" });
      await refresh(selectedProjectId, selectedVaultId);
      closeDrawer();
      setDeleteKeyConfirm("");
      setNotice("Secret deleted and audit event recorded.");
    });
  }

  async function previewImport() {
    if (!selectedVaultId) return;
    if (isLocked) {
      setError("");
      setNotice("Vault is locked. Re-authenticate before importing secrets.");
      return;
    }
    await runAction(async () => {
      const data = await api<{ preview: ImportPreview }>(`/api/vaults/${selectedVaultId}/import-preview`, {
        method: "POST",
        body: JSON.stringify({ content: importContent })
      });
      setImportPreview(data.preview);
      setNotice("Import preview ready. Invalid and duplicate lines are shown before creation.");
    });
  }

  async function loadImportFile(event: ChangeEvent<HTMLInputElement>) {
    if (isLocked) {
      event.target.value = "";
      setError("");
      setNotice("Vault is locked. Re-authenticate before loading an import file.");
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    setImportContent(await file.text());
    setImportPreview(null);
    setExportResult(null);
    setNotice(`Loaded ${file.name} for preview.`);
  }

  async function applyImport() {
    if (!login || !selectedVaultId) return;
    if (isLocked) {
      setError("");
      setNotice("Vault is locked. Re-authenticate before importing secrets.");
      return;
    }
    await runAction(async () => {
      const data = await api<{ result: ImportResult }>(`/api/vaults/${selectedVaultId}/import`, {
        method: "POST",
        body: JSON.stringify({ content: importContent, conflictStrategy })
      });
      await refresh(selectedProjectId, selectedVaultId, data.result.created[0]?.id || data.result.updated[0]?.id);
      const preview = await api<{ preview: ImportPreview }>(`/api/vaults/${selectedVaultId}/import-preview`, {
        method: "POST",
        body: JSON.stringify({ content: importContent })
      });
      setImportPreview(preview.preview);
      setNotice(
        `Import applied: ${data.result.created.length} created, ${data.result.updated.length} updated, ${data.result.skipped.length} skipped.`
      );
    });
  }

  async function exportPlaintext() {
    if (!selectedVaultId) return;
    if (plaintextActionsBlocked) {
      setExportResult(null);
      setError("");
      setNotice(isLocked ? "Vault is locked. Re-authenticate before exporting secrets." : "Screenshot-safe mode blocks plaintext export display.");
      return;
    }
    await runAction(async () => {
      const data = await api<{ export: ExportResult }>(`/api/vaults/${selectedVaultId}/export`, {
        method: "POST",
        body: JSON.stringify({ format: "plaintext", confirmedPlaintextRisk: plaintextConfirmed })
      });
      setExportResult(data.export);
      await loadAuditEvents();
      setNotice("Plaintext export prepared after explicit warning confirmation.");
    });
  }

  async function exportEncryptedBackup() {
    if (!selectedVaultId) return;
    if (isLocked) {
      setExportResult(null);
      setError("");
      setNotice("Vault is locked. Re-authenticate before exporting secrets.");
      return;
    }
    await runAction(async () => {
      const data = await api<{ export: ExportResult }>(`/api/vaults/${selectedVaultId}/export`, {
        method: "POST",
        body: JSON.stringify({ format: "encrypted" })
      });
      setExportResult(data.export);
      await loadAuditEvents();
      setNotice("Encrypted backup path documented as deferred until the backup mechanism is approved.");
    });
  }

  return (
    <main className="workbench-shell">
      <aside className="vault-sidebar" aria-label="Project and vault navigation">
        <div className="brand">
          <span className="brand-mark">SM</span>
          <div>
            <strong>SecretManager</strong>
            <small>Demo-safe workbench</small>
          </div>
        </div>

        <section className="nav-section">
          <div className="nav-section-header">
            <span>Projects</span>
            <button className="icon-button" type="button" aria-label="New project" onClick={() => openDrawer("new-project")}>+</button>
          </div>
          <div className="nav-list">
            {projects.map((project) => (
              <button
                className={project.id === selectedProjectId ? "nav-card selected" : "nav-card"}
                key={project.id}
                type="button"
                onClick={() => setSelectedProjectId(project.id)}
              >
                <strong>{project.name}</strong>
                <span>{project.description || "No description"}</span>
              </button>
            ))}
            {!projects.length && (
              <div className="empty compact">
                <strong>No projects yet</strong>
                <span>Create a project, then add a vault or import a masked .env preview.</span>
              </div>
            )}
          </div>
        </section>

        <section className="nav-section">
          <div className="nav-section-header">
            <span>Vaults</span>
            <button className="icon-button" type="button" aria-label="New vault" onClick={() => openDrawer("new-vault")} disabled={!login || !selectedProjectId}>+</button>
          </div>
          <div className="nav-list">
            {vaults.map((vault) => (
              <button
                className={vault.id === selectedVaultId ? "nav-card selected" : "nav-card"}
                key={vault.id}
                type="button"
                onClick={() => setSelectedVaultId(vault.id)}
              >
                <strong>{vault.name}</strong>
                <span>{vault.environment} / {vault.secretCount} secrets</span>
              </button>
            ))}
            {!vaults.length && (
              <div className="empty compact">
                <strong>No vaults</strong>
                <span>Add a vault to store fake demo secrets.</span>
              </div>
            )}
          </div>
        </section>
      </aside>

      <section className="main-workspace">
        <header className="topbar">
          <div>
            <h1>{selectedVault ? selectedVault.name : "Vault workbench"}</h1>
            <p>{selectedProject ? selectedProject.name : "Create a project"} / {selectedVault?.environment || "no vault selected"}</p>
          </div>
          <form onSubmit={loginDemo} className="login-form">
            <span>{login ? login.actor : "Not signed in"}</span>
            <button type="submit">{login ? "Refresh session" : "Login"}</button>
          </form>
        </header>

        {(notice || error) && (
          <div className={error ? "banner error" : "banner"} role="status">
            {error || notice}
          </div>
        )}

        <section className="workspace-grid">
          <section className="secret-workbench" aria-label="Secret table">
            <div className="toolbar">
              <div>
                <span className="eyebrow">Masked by default</span>
                <h2>Secrets</h2>
              </div>
              <div className="toolbar-actions">
                <button type="button" onClick={() => openDrawer("add-secret")} disabled={!login || !selectedVaultId || isLocked}>Add secret</button>
                <button className="secondary" type="button" onClick={() => openTransfer("import")} disabled={!selectedVaultId || isLocked}>Import .env</button>
                <button className="secondary" type="button" onClick={() => openTransfer("export")} disabled={!selectedVaultId}>Export</button>
              </div>
            </div>

            {isLocked ? (
              <div className="state-panel locked-state" data-testid="locked-state">
                <strong>Vault is locked</strong>
                <span>Secrets, selected detail, import, and plaintext output stay hidden until the session is refreshed.</span>
              </div>
            ) : !selectedVault ? (
              <div className="state-panel empty-state">
                <strong>Select or create a vault</strong>
                <span>Choose a vault from the left rail or create one for this project.</span>
                <button type="button" onClick={() => openDrawer("new-vault")} disabled={!login || !selectedProjectId}>Create vault</button>
              </div>
            ) : secrets.length === 0 ? (
              <div className="state-panel empty-state">
                <strong>This vault is empty</strong>
                <span>Add the first masked secret or preview an .env import before applying changes.</span>
                <div className="inline-actions">
                  <button type="button" onClick={() => openDrawer("add-secret")}>Add secret</button>
                  <button className="secondary" type="button" onClick={() => openTransfer("import")}>Import .env</button>
                </div>
              </div>
            ) : (
              <div className="secret-table" role="table" aria-label="Secrets">
                <div className="secret-row table-head" role="row">
                  <span>Key</span>
                  <span>Env</span>
                  <span>Metadata</span>
                  <span>Masked value</span>
                  <span>Updated</span>
                  <span>Actions</span>
                </div>
                {secrets.map((secret) => (
                  <div
                    className={secret.id === selectedSecretId ? "secret-row selected" : "secret-row"}
                    key={secret.id}
                    role="row"
                    onClick={() => {
                      setSelectedSecretId(secret.id);
                      setRevealedValue("");
                    }}
                  >
                    <span>
                      <button className="link-button key-button" type="button">{secret.key}</button>
                    </span>
                    <span>{selectedVault.environment}</span>
                    <span>{secret.description || "No description"}</span>
                    <span className="masked" data-testid={`masked-${secret.key}`}>{secret.maskedValue}</span>
                    <span>{formatDateTime(secret.updatedAt)}</span>
                    <span className="row-actions">
                      <button className="mini-button" type="button" onClick={(event) => { event.stopPropagation(); void copySecret(secret.id); }} disabled={plaintextActionsBlocked}>Copy</button>
                      <button className="mini-button" type="button" onClick={(event) => { event.stopPropagation(); void revealSecret(secret.id); }} disabled={plaintextActionsBlocked}>Reveal</button>
                      <button className="mini-button" type="button" onClick={(event) => { event.stopPropagation(); setSelectedSecretId(secret.id); openDrawer("rotate-secret"); }} disabled={isLocked}>Rotate</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="right-rail" aria-label="Vault context">
            <section className="rail-panel">
              <div className="rail-header">
                <h2>Vault health</h2>
                <span className={isScreenshotSafe ? "status-pill safe" : "status-pill"}>{isScreenshotSafe ? "Screenshot-safe" : "Demo-safe"}</span>
              </div>
              <dl className="health-list">
                <div><dt>Secrets</dt><dd>{secrets.length}</dd></div>
                <div><dt>Audit rows</dt><dd>{auditEvents.length}</dd></div>
                <div><dt>State</dt><dd>{trustState}</dd></div>
              </dl>
              <select aria-label="Trust state" value={trustState} onChange={(event) => changeTrustState(event.target.value as TrustState)}>
                <option value="demo-safe">Demo-safe / fake secrets only</option>
                <option value="locked">Locked vault</option>
                <option value="wrong-passphrase">Wrong passphrase or expired session</option>
                <option value="storage-unavailable">Storage unavailable</option>
                <option value="export-failure">Export failure</option>
                <option value="screenshot-safe">Screenshot-safe</option>
              </select>
              <p className="state-copy">{trustStateCopy(trustState)}</p>
            </section>

            <section className="rail-panel">
              <div className="rail-header">
                <h2>Selected secret</h2>
                {selectedSecret && <span className="status-pill">v{selectedSecret.version}</span>}
              </div>
              {selectedSecret && !isLocked ? (
                <>
                  <dl className="detail-list">
                    <div><dt>Key</dt><dd>{selectedSecret.key}</dd></div>
                    <div><dt>Masked value</dt><dd className="masked">{selectedSecret.maskedValue}</dd></div>
                    <div><dt>Revealed value</dt><dd data-testid="revealed-value">{revealedValue || "Hidden until reveal"}</dd></div>
                    <div><dt>Description</dt><dd>{selectedSecret.description || "No description"}</dd></div>
                  </dl>
                  <div className="inline-actions">
                    <button type="button" onClick={() => void revealSecret()} disabled={plaintextActionsBlocked}>Reveal</button>
                    <button className="secondary" type="button" onClick={() => void copySecret()} disabled={plaintextActionsBlocked}>Copy</button>
                    <button className="secondary" type="button" onClick={() => openDrawer("rotate-secret")}>Rotate</button>
                  </div>
                  <div className="version-list">
                    {versions.slice(0, 3).map((version) => (
                      <div key={version.version} className="version-row">
                        <strong>v{version.version}</strong>
                        <span className="masked">{version.maskedValue}</span>
                        <span>{version.changedBy}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="empty">{isLocked ? "Details hidden while locked." : "Select a secret from the table."}</p>
              )}
            </section>

            <section className="rail-panel" id="audit">
              <div className="rail-header">
                <h2>Recent audit</h2>
                <button className="mini-button" type="button" onClick={loadAuditEvents}>Refresh</button>
              </div>
              <div className="audit-feed">
                {recentAudit.map((event) => (
                  <div key={event.id} className="audit-row">
                    <strong>{event.action}</strong>
                    <span>{event.secretKey || "workspace"}</span>
                    <span>{event.actor}</span>
                    <time>{formatTime(event.createdAt)}</time>
                  </div>
                ))}
                {!recentAudit.length && <p className="empty">Reveal, copy, import, and export evidence will appear here.</p>}
              </div>
            </section>
          </aside>
        </section>
      </section>

      {drawerMode && (
        <div className="overlay" role="presentation">
          <section className="drawer" role="dialog" aria-modal="true" aria-label="Focused edit drawer">
            <div className="drawer-header">
              <div>
                <span className="eyebrow">Focused change</span>
                <h2>
                  {drawerMode === "new-project" && "Create project"}
                  {drawerMode === "new-vault" && "Create vault"}
                  {drawerMode === "add-secret" && "Add secret"}
                  {drawerMode === "rotate-secret" && "Rotate secret"}
                </h2>
              </div>
              <button className="icon-button dark" type="button" aria-label="Close drawer" onClick={closeDrawer}>x</button>
            </div>

            {drawerMode === "new-project" && (
              <form className="stack-form" onSubmit={createProject}>
                <label>Project name<input aria-label="New project name" value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} /></label>
                <label>Description<input aria-label="New project description" value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} /></label>
                <button type="submit">Create Project</button>
              </form>
            )}

            {drawerMode === "new-vault" && (
              <form className="stack-form" onSubmit={createVault}>
                <label>Vault name<input aria-label="New vault name" value={vaultForm.name} onChange={(event) => setVaultForm({ ...vaultForm, name: event.target.value })} /></label>
                <label>Environment<input aria-label="New vault environment" value={vaultForm.environment} onChange={(event) => setVaultForm({ ...vaultForm, environment: event.target.value })} /></label>
                <button type="submit" disabled={!login || !selectedProjectId}>Create Vault</button>
              </form>
            )}

            {(drawerMode === "add-secret" || drawerMode === "rotate-secret") && (
              <form className="stack-form" onSubmit={drawerMode === "add-secret" ? createSecret : updateSecret}>
                <label>Key<input aria-label="New secret key" value={secretForm.key} disabled={drawerMode === "rotate-secret"} onChange={(event) => setSecretForm({ ...secretForm, key: event.target.value })} /></label>
                <label>Environment<input aria-label="Secret environment" value={selectedVault?.environment || ""} disabled /></label>
                <label>Value<input aria-label={drawerMode === "rotate-secret" ? "Rotated secret value" : "New secret value"} value={secretForm.value} onChange={(event) => setSecretForm({ ...secretForm, value: event.target.value })} /></label>
                <label>Description<input aria-label="New secret description" value={secretForm.description} onChange={(event) => setSecretForm({ ...secretForm, description: event.target.value })} /></label>
                <label>Tags<input aria-label="Secret tags" value={secretForm.tags} onChange={(event) => setSecretForm({ ...secretForm, tags: event.target.value })} /></label>
                {drawerMode === "add-secret" && hasDuplicateDraft && <p className="conflict">Duplicate secret key in this environment. Rotate the existing row or choose another key.</p>}
                <button type="submit" disabled={drawerMode === "add-secret" && hasDuplicateDraft}>{drawerMode === "add-secret" ? "Add secret" : "Rotate secret"}</button>
              </form>
            )}

            {drawerMode === "rotate-secret" && selectedSecret && (
              <div className="delete-confirm">
                <label htmlFor="delete-key-confirm">Type {selectedSecret.key} to delete</label>
                <div className="delete-row">
                  <input id="delete-key-confirm" aria-label="Delete confirmation key" value={deleteKeyConfirm} onChange={(event) => setDeleteKeyConfirm(event.target.value)} />
                  <button className="danger" type="button" onClick={deleteSecret} disabled={deleteKeyConfirm !== selectedSecret.key}>Delete</button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {transferMode && (
        <div className="overlay" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-label={transferMode === "import" ? "Import .env wizard" : "Export safety flow"}>
            <div className="drawer-header">
              <div>
                <span className="eyebrow">Safety flow</span>
                <h2>{transferMode === "import" ? "Import .env" : "Export settings"}</h2>
              </div>
              <button className="icon-button dark" type="button" aria-label="Close transfer flow" onClick={() => setTransferMode(null)}>x</button>
            </div>

            {transferMode === "import" ? (
              <div className="wizard-grid">
                <section className="wizard-step">
                  <span className="step-number">1</span>
                  <h3>Paste or load .env</h3>
                  <textarea id="env-import" aria-label=".env import content" value={importContent} onChange={(event) => setImportContent(event.target.value)} />
                  <input aria-label=".env import file" type="file" accept=".env,text/plain" onChange={loadImportFile} />
                  <button type="button" onClick={previewImport} disabled={!selectedVaultId || isLocked}>Preview Import</button>
                </section>
                <section className="wizard-step">
                  <span className="step-number">2</span>
                  <h3>Preview masked rows</h3>
                  {importPreview ? (
                    <div className="import-preview" data-testid="import-preview">
                      <div className="preview-summary">
                        <span>{importPreview.validCount} valid</span>
                        <span>{importPreview.duplicateCount} duplicate</span>
                        <span>{importPreview.invalidCount} invalid</span>
                      </div>
                      {importPreview.lines.map((line) => (
                        <div className={`preview-row ${line.status}`} key={`${line.lineNumber}-${line.raw}`}>
                          <strong>Line {line.lineNumber}</strong>
                          <span>{line.key || line.raw}</span>
                          <span>{line.valuePreview || line.message}</span>
                          <span>{line.status}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty">Run preview before applying. Values remain masked in every row.</p>
                  )}
                </section>
                <section className="wizard-step">
                  <span className="step-number">3</span>
                  <h3>Resolve conflicts</h3>
                  <select aria-label="Duplicate conflict strategy" value={conflictStrategy} onChange={(event) => setConflictStrategy(event.target.value as "skip" | "overwrite")}>
                    <option value="skip">Skip duplicates</option>
                    <option value="overwrite">Overwrite duplicates</option>
                  </select>
                  <button type="button" onClick={applyImport} disabled={!selectedVaultId || !importPreview || isLocked}>Apply Import</button>
                </section>
              </div>
            ) : (
              <div className="export-flow">
                <section className="safe-export">
                  <span className="status-pill safe">Default</span>
                  <h3>Encrypted backup</h3>
                  <p>Use this option for demo evidence and backups. It avoids plaintext display in the browser.</p>
                  <button type="button" onClick={exportEncryptedBackup} disabled={!selectedVaultId || isLocked}>Encrypted Backup</button>
                </section>
                <section className="warning-export" data-testid="export-warning">
                  <span className="status-pill danger">Warning</span>
                  <h3>Plaintext .env export</h3>
                  <p>Do not paste exported files into issues, chat, docs, screenshots, or demo recordings. Plaintext output appears only after explicit confirmation.</p>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={plaintextConfirmed} onChange={(event) => setPlaintextConfirmed(event.target.checked)} />
                    <span>Plaintext export exposes secret values</span>
                  </label>
                  <button type="button" onClick={exportPlaintext} disabled={!selectedVaultId || plaintextActionsBlocked}>Export .env</button>
                </section>
                {exportResult && (
                  <div className="export-result" data-testid="export-result">
                    <strong>{exportResult.filename || exportResult.status}</strong>
                    <span>{exportResult.warning || exportResult.reason}</span>
                    {exportResult.content && !isScreenshotSafe && <pre>{exportResult.content}</pre>}
                    {exportResult.content && isScreenshotSafe && <span>Plaintext hidden in screenshot-safe mode.</span>}
                    {exportResult.nextStep && <span>{exportResult.nextStep}</span>}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
