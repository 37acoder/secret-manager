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
  locked: boolean;
  unlockedUntil?: string;
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

type DrawerMode = "new-vault" | "add-secret" | "rotate-secret" | "delete-secret" | "secret-detail" | null;
type TransferMode = "import" | "export" | null;

const actorHeader = { "x-secret-manager-actor": "demo@37a.home" };
const vaultPasswordSessionPrefix = "secret-manager:vault-password:";

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

const copy = {
  status: {
    locked: "已锁定 Locked",
    unlocked: "已解锁 Unlocked"
  },
  help: {
    vault: "加密保存密钥的容器。",
    secret: "API key、数据库连接串等敏感值。",
    maskedValue: "默认隐藏真实值，只显示安全预览。",
    operationState: "当前保险库是否可执行显示、复制、导入和导出。"
  }
};

function HelpTerm({ term, help }: { term: string; help: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="help-term">
      <button
        className="help-trigger"
        type="button"
        aria-label={`${term} 说明`}
        aria-expanded={open}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        {term}
      </button>
      {open && (
        <span className="help-tooltip" role="tooltip">
          {help}
        </span>
      )}
    </span>
  );
}

export default function Home() {
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
  const [projectEditForm, setProjectEditForm] = useState({ name: "", description: "" });
  const [vaultForm, setVaultForm] = useState({ name: "Customer Demo", environment: "default", password: "demo123" });
  const [vaultEditForm, setVaultEditForm] = useState({ name: "", environment: "" });
  const [unlockPassword, setUnlockPassword] = useState("demo123");
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
  const [showPlaintextExport, setShowPlaintextExport] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId),
    [projects, selectedProjectId]
  );
  const selectedVault = useMemo(() => vaults.find((vault) => vault.id === selectedVaultId), [vaults, selectedVaultId]);
  const selectedSecret = useMemo(
    () => secrets.find((secret) => secret.id === selectedSecretId),
    [secrets, selectedSecretId]
  );
  const isVaultLocked = Boolean(selectedVault?.locked);
  const isLocked = isVaultLocked;
  const plaintextActionsBlocked = isLocked;
  const canUseVault = Boolean(selectedVaultId && !isLocked);
  const vaultStatusLabel = isLocked ? copy.status.locked : copy.status.unlocked;
  const vaultStatusClass = isLocked ? "status-pill danger" : "status-pill safe";
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
    setSelectedSecretId((current) => (data.secrets.some((secret) => secret.id === current) ? current : ""));
    setRevealedValue("");
    return data.secrets;
  }

  function vaultPasswordSessionKey(vaultId: string) {
    return `${vaultPasswordSessionPrefix}${vaultId}`;
  }

  function rememberVaultPassword(vaultId: string, password: string) {
    try {
      sessionStorage.setItem(vaultPasswordSessionKey(vaultId), password);
    } catch {
      setError("本地会话存储不可用。请保持当前页面打开，刷新后可能需要重新解锁。");
    }
  }

  function forgetVaultPassword(vaultId: string) {
    try {
      sessionStorage.removeItem(vaultPasswordSessionKey(vaultId));
    } catch {
      // Session storage is best-effort only; the server-side lock remains authoritative.
    }
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
      const secretToLoad = nextSecrets.some((secret) => secret.id === candidateSecretId) ? candidateSecretId : "";
      if (secretToLoad) {
        await loadVersions(secretToLoad);
      } else {
        setVersions([]);
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

  useEffect(() => {
    if (!selectedVaultId || !selectedVault?.locked) return;
    let cancelled = false;
    try {
      const savedPassword = sessionStorage.getItem(vaultPasswordSessionKey(selectedVaultId));
      if (!savedPassword) return;
      void api<{ vault: Vault }>(`/api/vaults/${selectedVaultId}/unlock`, {
        method: "POST",
        body: JSON.stringify({ password: savedPassword })
      })
        .then(async (data) => {
          if (cancelled) return;
          await refresh(selectedProjectId, data.vault.id, selectedSecretId);
          setNotice(`保险库 ${data.vault.name} 已从当前浏览器会话恢复。`);
        })
        .catch(() => {
          forgetVaultPassword(selectedVaultId);
        });
    } catch {
      setError("本地会话存储不可用。请保持当前页面打开，刷新后可能需要重新解锁。");
    }
    return () => {
      cancelled = true;
    };
  }, [selectedVaultId, selectedVault?.locked, selectedProjectId, selectedSecretId]);

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
    setShowPlaintextExport(false);
    if (nextMode === "import") {
      setImportPreview(null);
    }
    setTransferMode(nextMode);
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
      setNotice(`项目已重命名为 ${data.project.name}。`);
    });
  }

  async function createVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProjectId) return;
    await runAction(async () => {
      const data = await api<{ vault: Vault }>(`/api/projects/${selectedProjectId}/vaults`, {
        method: "POST",
        body: JSON.stringify(vaultForm)
      });
      rememberVaultPassword(data.vault.id, vaultForm.password);
      setSelectedVaultId(data.vault.id);
      await refresh(selectedProjectId, data.vault.id);
      closeDrawer();
      setNotice(`保险库 ${data.vault.name} 已创建。`);
    });
  }

  async function unlockVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVaultId) return;
    await runAction(async () => {
      const data = await api<{ vault: Vault }>(`/api/vaults/${selectedVaultId}/unlock`, {
        method: "POST",
        body: JSON.stringify({ password: unlockPassword })
      });
      rememberVaultPassword(data.vault.id, unlockPassword);
      await refresh(selectedProjectId, data.vault.id, selectedSecretId);
      setNotice(`保险库 ${data.vault.name} 已在当前浏览器会话中解锁。`);
    });
  }

  async function lockVault() {
    if (!selectedVaultId) return;
    await runAction(async () => {
      const data = await api<{ vault: Vault }>(`/api/vaults/${selectedVaultId}/lock`, { method: "POST" });
      forgetVaultPassword(data.vault.id);
      await refresh(selectedProjectId, data.vault.id, selectedSecretId);
      setRevealedValue("");
      setExportResult(null);
      setShowPlaintextExport(false);
      setNotice(`保险库 ${data.vault.name} 已锁定，内存密钥已清除。`);
    });
  }

  async function updateVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVaultId) return;
    await runAction(async () => {
      const data = await api<{ vault: Vault }>(`/api/vaults/${selectedVaultId}`, {
        method: "PATCH",
        body: JSON.stringify(vaultEditForm)
      });
      setSelectedVaultId(data.vault.id);
      await refresh(selectedProjectId, data.vault.id, selectedSecretId);
      closeDrawer();
      setNotice(`保险库已重命名为 ${data.vault.name}。`);
    });
  }

  async function createSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedVaultId) return;
    if (hasDuplicateDraft) {
      setError("当前保险库已有同名密钥。请轮换现有行或选择其他名称。");
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
      setNotice(`密钥 ${data.secret.key} 已创建，默认以脱敏值显示。`);
    });
  }

  async function revealSecret(secretId = selectedSecretId) {
    if (!secretId) return;
    if (!canUseVault || plaintextActionsBlocked) {
      setRevealedValue("");
      setError("");
      setNotice("保险库已锁定。显示明文前请先输入保险库密码。");
      return;
    }
    await runAction(async () => {
      setSelectedSecretId(secretId);
      const data = await api<{ secret: { value: string } }>(`/api/secrets/${secretId}/reveal`, { method: "POST" });
      setRevealedValue(data.secret.value);
      await loadAuditEvents();
    });
  }

  async function copySecret(secretId = selectedSecretId) {
    if (!secretId) return;
    if (!canUseVault || plaintextActionsBlocked) {
      setError("");
      setNotice("保险库已锁定。复制前请先输入保险库密码。");
      return;
    }
    await runAction(async () => {
      setSelectedSecretId(secretId);
      const data = await api<{ secret: { value: string } }>(`/api/secrets/${secretId}/copy`, { method: "POST" });
      if (!navigator.clipboard?.writeText) {
        await loadAuditEvents();
        setNotice("剪贴板不可用。复制动作已审计，但值未写入剪贴板。");
        return;
      }
      try {
        await navigator.clipboard.writeText(data.secret.value);
      } catch {
        await loadAuditEvents();
        setNotice("剪贴板不可用。复制动作已审计，但值未写入剪贴板。");
        return;
      }
      await loadAuditEvents();
    });
  }

  async function updateSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUseVault || !selectedSecretId) return;
    await runAction(async () => {
      const data = await api<{ secret: Secret }>(`/api/secrets/${selectedSecretId}`, {
        method: "PATCH",
        body: JSON.stringify({ value: secretForm.value || updateValue, description: secretForm.description || selectedSecret?.description })
      });
      setUpdateValue(secretForm.value || updateValue);
      await refresh(selectedProjectId, data.secret.vaultId, data.secret.id);
      closeDrawer();
      setNotice(`密钥已轮换到版本 ${data.secret.version}。`);
    });
  }

  async function deleteSecret() {
    if (!canUseVault || !selectedSecretId) return;
    await runAction(async () => {
      if (deleteKeyConfirm !== selectedSecret?.key) {
        throw new Error("删除前请输入完整密钥名。");
      }
      await api(`/api/secrets/${selectedSecretId}`, { method: "DELETE" });
      await refresh(selectedProjectId, selectedVaultId);
      closeDrawer();
      setDeleteKeyConfirm("");
      setNotice("密钥已删除，并已写入审计记录。");
    });
  }

  async function previewImport() {
    if (!selectedVaultId) return;
    if (!canUseVault) {
      setError("");
      setNotice("保险库已锁定。导入前请先输入保险库密码。");
      return;
    }
    await runAction(async () => {
      const data = await api<{ preview: ImportPreview }>(`/api/vaults/${selectedVaultId}/import-preview`, {
        method: "POST",
        body: JSON.stringify({ content: importContent })
      });
      setImportPreview(data.preview);
      setNotice("导入预览已生成，创建前会标出无效行和重复行。");
    });
  }

  async function loadImportFile(event: ChangeEvent<HTMLInputElement>) {
    if (!canUseVault) {
      event.target.value = "";
      setError("");
      setNotice("保险库已锁定。加载导入文件前请先输入保险库密码。");
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    setImportContent(await file.text());
    setImportPreview(null);
    setExportResult(null);
    setNotice(`已加载 ${file.name}，可进行预览。`);
  }

  async function applyImport() {
    if (!selectedVaultId) return;
    if (!canUseVault) {
      setError("");
      setNotice("保险库已锁定。导入前请先输入保险库密码。");
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
        `导入已应用：新增 ${data.result.created.length}，更新 ${data.result.updated.length}，跳过 ${data.result.skipped.length}。`
      );
    });
  }

  async function exportPlaintext() {
    if (!selectedVaultId) return;
    if (!canUseVault || plaintextActionsBlocked) {
      setExportResult(null);
      setShowPlaintextExport(false);
      setError("");
      setNotice("保险库已锁定。导出前请先输入保险库密码。");
      return;
    }
    await runAction(async () => {
      const data = await api<{ export: ExportResult }>(`/api/vaults/${selectedVaultId}/export`, {
        method: "POST",
        body: JSON.stringify({ format: "plaintext", confirmedPlaintextRisk: plaintextConfirmed })
      });
      setExportResult(data.export);
      setShowPlaintextExport(false);
      await loadAuditEvents();
      setNotice("明文导出已准备好。只在屏幕安全时显示明文。");
    });
  }

  async function exportEncryptedBackup() {
    if (!selectedVaultId) return;
    if (!canUseVault) {
      setExportResult(null);
      setShowPlaintextExport(false);
      setError("");
      setNotice("保险库已锁定。导出前请先输入保险库密码。");
      return;
    }
    await runAction(async () => {
      const data = await api<{ export: ExportResult }>(`/api/vaults/${selectedVaultId}/export`, {
        method: "POST",
        body: JSON.stringify({ format: "encrypted" })
      });
      setExportResult(data.export);
      setShowPlaintextExport(false);
      await loadAuditEvents();
      setNotice("加密备份路径已记录为待批准能力，当前暂缓执行。");
    });
  }

  return (
    <main className="workbench-shell min-h-screen bg-[radial-gradient(circle_at_top_left,#d7f8f2_0,#eef4f5_34%,#e7ecef_100%)] text-slate-950">
      <aside className="vault-sidebar" aria-label="保险库导航 Vault navigation">
        <div className="brand">
          <span className="brand-mark">SM</span>
          <div>
            <strong>SecretManager</strong>
            <small>密钥管理工作台</small>
          </div>
        </div>

        <section className="nav-section">
          <div className="nav-section-header">
            <span><HelpTerm term="保险库 Vaults" help={copy.help.vault} /></span>
            <button className="icon-button" type="button" aria-label="新建保险库 New vault" onClick={() => openDrawer("new-vault")} disabled={!selectedProjectId}>+</button>
          </div>
          <div className="nav-list">
            {vaults.map((vault) => {
              const vaultDisplayLocked = vault.locked;
              return (
                <button
                  className={vault.id === selectedVaultId ? "nav-card selected" : "nav-card"}
                  key={vault.id}
                  type="button"
                  onClick={() => setSelectedVaultId(vault.id)}
                >
                  <strong>{vault.name}</strong>
                  <span>{vault.secretCount} 个密钥 / {vaultDisplayLocked ? "已锁定" : "已解锁"}</span>
                </button>
              );
            })}
            {!vaults.length && (
              <div className="empty compact">
                <strong>暂无保险库</strong>
                <span>添加保险库来保存演示用假密钥。</span>
              </div>
            )}
          </div>
        </section>
      </aside>

      <section className="main-workspace">
        <header className="topbar">
          <div>
            <h1>{selectedVault ? selectedVault.name : "保险库工作台"}</h1>
            <p>{selectedVault ? "列表默认只展示密钥摘要，点击密钥名查看详情、版本审计和操作日志。" : "选择或创建保险库"}</p>
          </div>
          <div className="session-actions">
            <span>{selectedVault ? `保险库 ${vaultStatusLabel}` : "未选择保险库"}</span>
          </div>
        </header>

        <div className={error ? "banner error" : notice ? "banner" : "banner placeholder"} role="status">
          {error || notice || "状态占位"}
        </div>

        <section className="workspace-grid">
          <section className="secret-workbench" aria-label="Secret table">
            <div className="toolbar">
              <div>
                <span className="eyebrow">默认脱敏</span>
                <h2><HelpTerm term="密钥 Secrets" help={copy.help.secret} /></h2>
              </div>
              <div className="toolbar-actions">
                <button type="button" onClick={() => openDrawer("add-secret")} disabled={!canUseVault}>新增密钥</button>
                <button className="secondary" type="button" onClick={() => openTransfer("import")} disabled={!canUseVault}>导入 .env</button>
                <button className="secondary" type="button" onClick={() => openTransfer("export")} disabled={!canUseVault}>导出</button>
              </div>
            </div>

            <div className="vault-summary" aria-label="保险库状态">
              <div>
                <span className="eyebrow">保险库状态</span>
                <strong className={vaultStatusClass}>{vaultStatusLabel}</strong>
              </div>
              <dl className="health-list">
                <div><dt>密钥数</dt><dd>{secrets.length}</dd></div>
                <div><dt>审计行</dt><dd>{auditEvents.length}</dd></div>
                <div><dt><HelpTerm term="操作状态" help={copy.help.operationState} /></dt><dd>{isLocked ? "敏感操作已暂停" : "敏感操作可用"}</dd></div>
              </dl>
              <div className="vault-controls">
                {selectedVault && !isLocked && (
                  <button className="secondary" type="button" onClick={() => void lockVault()}>锁定保险库</button>
                )}
              </div>
              <p className="state-copy">{isLocked ? "需要先输入保险库密码，才能显示、复制、轮换、导入或导出；密码只保存在当前浏览器会话。" : "保险库已解锁：敏感操作可用，明文仍只在主动显示或导出确认后出现。"}</p>
            </div>

            {isLocked ? (
              <div className="state-panel locked-state" data-testid="locked-state">
                <strong>保险库已锁定</strong>
                <span>输入 6-20 位密码解锁。密码仅保存在当前浏览器会话，刷新不会丢失解锁状态。</span>
                {isVaultLocked ? (
                  <form className="unlock-form" onSubmit={unlockVault}>
                    <input
                      aria-label="保险库密码 Vault password"
                      type="password"
                      minLength={6}
                      maxLength={20}
                      value={unlockPassword}
                      onChange={(event) => setUnlockPassword(event.target.value)}
                    />
                    <button type="submit">解锁保险库</button>
                  </form>
                ) : null}
              </div>
            ) : !selectedVault ? (
              <div className="state-panel empty-state">
                <strong>选择或创建保险库</strong>
                <span>从左侧选择保险库，或为当前项目创建一个。</span>
                <button type="button" onClick={() => openDrawer("new-vault")} disabled={!selectedProjectId}>创建保险库</button>
              </div>
            ) : secrets.length === 0 ? (
              <div className="state-panel empty-state">
                <strong>当前保险库为空</strong>
                <span>新增第一个脱敏密钥，或先预览 .env 导入再应用。</span>
                <div className="inline-actions">
                  <button type="button" onClick={() => openDrawer("add-secret")} disabled={!canUseVault}>新增密钥</button>
                  <button className="secondary" type="button" onClick={() => openTransfer("import")} disabled={!canUseVault}>导入 .env</button>
                </div>
              </div>
            ) : (
              <>
                <div className="secret-table" role="table" aria-label="密钥 Secrets">
                  <div className="secret-row table-head" role="row">
                    <span>密钥名</span>
                    <span><HelpTerm term="脱敏值 Masked value" help={copy.help.maskedValue} /></span>
                    <span>更新时间</span>
                    <span>操作</span>
                  </div>
                  {secrets.map((secret) => (
                      <div
                        className={secret.id === selectedSecretId ? "secret-row selected" : "secret-row"}
                        key={secret.id}
                        role="row"
                        onClick={() => {
                          setSelectedSecretId(secret.id);
                          setRevealedValue("");
                          setDrawerMode("secret-detail");
                        }}
                      >
                        <span>
                          <button className="link-button key-button" type="button">{secret.key}</button>
                        </span>
                        <span
                          className={secret.id === selectedSecretId && revealedValue ? "revealed-value" : "masked"}
                          data-testid={`masked-${secret.key}`}
                        >
                          {secret.id === selectedSecretId && revealedValue ? revealedValue : secret.maskedValue}
                        </span>
                        <span>{formatDateTime(secret.updatedAt)}</span>
                        <span className="row-actions">
                          <button className="mini-button" type="button" onClick={(event) => { event.stopPropagation(); void copySecret(secret.id); }} disabled={plaintextActionsBlocked}>复制</button>
                          <button className="mini-button" type="button" onClick={(event) => { event.stopPropagation(); void revealSecret(secret.id); }} disabled={plaintextActionsBlocked}>显示明文</button>
                          <button className="mini-button" type="button" onClick={(event) => { event.stopPropagation(); setSelectedSecretId(secret.id); openDrawer("rotate-secret"); }} disabled={!canUseVault}>轮换</button>
                          <button className="mini-button danger-outline" type="button" onClick={(event) => { event.stopPropagation(); setSelectedSecretId(secret.id); openDrawer("delete-secret"); }} disabled={!canUseVault}>删除</button>
                        </span>
                      </div>
                  ))}
                </div>

              </>
            )}
          </section>
        </section>
      </section>

      {drawerMode && (
        <div className="overlay" role="presentation">
          <section className="drawer" role="dialog" aria-modal="true" aria-label="聚焦编辑抽屉 Focused edit drawer">
            <div className="drawer-header">
              <div>
                <span className="eyebrow">聚焦变更</span>
                <h2>
                  {drawerMode === "new-vault" && "创建保险库"}
                  {drawerMode === "add-secret" && "新增密钥"}
                  {drawerMode === "rotate-secret" && "轮换密钥"}
                  {drawerMode === "delete-secret" && "删除密钥"}
                  {drawerMode === "secret-detail" && "密钥详情"}
                </h2>
              </div>
              <button className="icon-button dark" type="button" aria-label="关闭抽屉 Close drawer" onClick={closeDrawer}>x</button>
            </div>

            {drawerMode === "new-vault" && (
              <form className="stack-form" onSubmit={createVault}>
                <label>保险库名称<input aria-label="新保险库名称 New vault name" value={vaultForm.name} onChange={(event) => setVaultForm({ ...vaultForm, name: event.target.value })} /></label>
                <label>保险库密码<input aria-label="新保险库密码 New vault password" type="password" minLength={6} maxLength={20} value={vaultForm.password} onChange={(event) => setVaultForm({ ...vaultForm, password: event.target.value })} /></label>
                <button type="submit" disabled={!selectedProjectId}>创建保险库</button>
              </form>
            )}

            {(drawerMode === "add-secret" || drawerMode === "rotate-secret") && (
              <form className="stack-form" onSubmit={drawerMode === "add-secret" ? createSecret : updateSecret}>
                <label>密钥名<input aria-label="新密钥名 New secret key" value={secretForm.key} disabled={drawerMode === "rotate-secret"} onChange={(event) => setSecretForm({ ...secretForm, key: event.target.value })} /></label>
                <label>值<input aria-label={drawerMode === "rotate-secret" ? "轮换后的密钥值 Rotated secret value" : "新密钥值 New secret value"} value={secretForm.value} onChange={(event) => setSecretForm({ ...secretForm, value: event.target.value })} /></label>
                <label>描述<input aria-label="新密钥描述 New secret description" value={secretForm.description} onChange={(event) => setSecretForm({ ...secretForm, description: event.target.value })} /></label>
                <label>标签<input aria-label="密钥标签 Secret tags" value={secretForm.tags} onChange={(event) => setSecretForm({ ...secretForm, tags: event.target.value })} /></label>
                {drawerMode === "add-secret" && hasDuplicateDraft && <p className="conflict">当前保险库已有同名密钥。请轮换现有行或选择其他名称。</p>}
                <button type="submit" disabled={drawerMode === "add-secret" && hasDuplicateDraft}>{drawerMode === "add-secret" ? "新增密钥" : "轮换密钥"}</button>
              </form>
            )}

            {drawerMode === "rotate-secret" && selectedSecret && (
              <p className="empty">轮换只更新当前密钥值；删除需要走单独确认流程。</p>
            )}

            {drawerMode === "delete-secret" && selectedSecret && (
              <div className="delete-confirm">
                <label htmlFor="delete-key-confirm">输入 {selectedSecret.key} 确认删除</label>
                <div className="delete-row">
                  <input id="delete-key-confirm" aria-label="删除确认密钥名 Delete confirmation key" value={deleteKeyConfirm} onChange={(event) => setDeleteKeyConfirm(event.target.value)} />
                  <button className="danger" type="button" onClick={deleteSecret} disabled={deleteKeyConfirm !== selectedSecret.key}>删除</button>
                </div>
              </div>
            )}

            {drawerMode === "secret-detail" && selectedSecret && (
              <div className="detail-drawer" aria-label="密钥详情、版本审计与操作日志">
                <section>
                  <div className="rail-header">
                    <div>
                      <span className="eyebrow">密钥详情</span>
                      <h3>{selectedSecret.key}</h3>
                    </div>
                    <span className="status-pill">v{selectedSecret.version}</span>
                  </div>
                  <dl className="detail-list">
                    <div><dt>更新时间</dt><dd>{formatDateTime(selectedSecret.updatedAt)}</dd></div>
                    <div><dt>说明</dt><dd>{selectedSecret.description || "暂无说明"}</dd></div>
                  </dl>
                </section>
                <section>
                  <div className="rail-header">
                    <div>
                      <span className="eyebrow">版本审计</span>
                      <h3>最近版本</h3>
                    </div>
                  </div>
                  <div className="version-list">
                    {versions.slice(0, 5).map((version) => (
                      <div key={version.version} className="version-row">
                        <strong>v{version.version}</strong>
                        <span className="masked">{version.maskedValue}</span>
                        <span>{version.changedBy}</span>
                      </div>
                    ))}
                    {!versions.length && <p className="empty">暂无版本记录。</p>}
                  </div>
                </section>
                <section>
                  <div className="rail-header">
                    <div>
                      <span className="eyebrow">操作日志</span>
                      <h3>最近审计</h3>
                    </div>
                    <button className="mini-button" type="button" onClick={loadAuditEvents}>刷新</button>
                  </div>
                  <div className="audit-feed">
                    {recentAudit.map((event) => (
                      <div key={event.id} className="audit-row">
                        <strong>{event.action}</strong>
                        <span>{event.secretKey || "保险库"}</span>
                        <span>{event.actor}</span>
                        <time>{formatTime(event.createdAt)}</time>
                      </div>
                    ))}
                    {!recentAudit.length && <p className="empty">显示、复制、导入和导出的证据会出现在这里。</p>}
                  </div>
                </section>
              </div>
            )}
          </section>
        </div>
      )}

      {transferMode && (
        <div className="overlay" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-label={transferMode === "import" ? "导入 .env 向导 Import .env wizard" : "导出安全流程 Export safety flow"}>
            <div className="drawer-header">
              <div>
                <span className="eyebrow">安全流程</span>
                <h2>{transferMode === "import" ? "导入 .env" : "导出设置"}</h2>
              </div>
              <button className="icon-button dark" type="button" aria-label="关闭导入导出流程 Close transfer flow" onClick={() => setTransferMode(null)}>x</button>
            </div>

            {transferMode === "import" ? (
              <div className="wizard-grid">
                <section className="wizard-step">
                  <span className="step-number">1</span>
                  <h3>粘贴或加载 .env</h3>
                  <textarea id="env-import" aria-label=".env 导入内容 .env import content" value={importContent} onChange={(event) => setImportContent(event.target.value)} />
                  <input aria-label=".env 导入文件 .env import file" type="file" accept=".env,text/plain" onChange={loadImportFile} />
                  <button type="button" onClick={previewImport} disabled={!canUseVault}>预览导入</button>
                </section>
                <section className="wizard-step">
                  <span className="step-number">2</span>
                  <h3>预览脱敏行</h3>
                  {importPreview ? (
                    <div className="import-preview" data-testid="import-preview">
                      <div className="preview-summary">
                        <span>{importPreview.validCount} 有效</span>
                        <span>{importPreview.duplicateCount} 重复</span>
                        <span>{importPreview.invalidCount} 无效</span>
                      </div>
                      {importPreview.lines.map((line) => (
                        <div className={`preview-row ${line.status}`} key={`${line.lineNumber}-${line.raw}`}>
                          <strong>第 {line.lineNumber} 行</strong>
                          <span>{line.key || line.raw}</span>
                          <span>{line.valuePreview || line.message}</span>
                          <span>{line.status}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty">应用前先运行预览；每一行都会保持脱敏。</p>
                  )}
                </section>
                <section className="wizard-step">
                  <span className="step-number">3</span>
                  <h3>处理冲突</h3>
                  <select aria-label="重复项冲突策略 Duplicate conflict strategy" value={conflictStrategy} onChange={(event) => setConflictStrategy(event.target.value as "skip" | "overwrite")}>
                    <option value="skip">跳过重复项</option>
                    <option value="overwrite">覆盖重复项</option>
                  </select>
                  <button type="button" onClick={applyImport} disabled={!canUseVault || !importPreview}>应用导入</button>
                </section>
              </div>
            ) : (
              <div className="export-flow">
                <section className="safe-export">
                  <span className="status-pill safe">默认</span>
                  <h3>加密备份</h3>
                  <p>用于演示证据和备份，避免在浏览器中显示明文。</p>
                  <button type="button" onClick={exportEncryptedBackup} disabled={!canUseVault}>加密备份</button>
                </section>
                <section className="warning-export" data-testid="export-warning">
                  <span className="status-pill danger">风险</span>
                  <h3>明文 .env 导出</h3>
                  <p>不要把导出文件粘贴到任务、聊天、文档、截图或演示录屏中。明文会先准备但不直接显示，需要再次确认显示。</p>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={plaintextConfirmed} onChange={(event) => setPlaintextConfirmed(event.target.checked)} />
                    <span>明文导出会暴露密钥值</span>
                  </label>
                  <button type="button" onClick={exportPlaintext} disabled={!selectedVaultId || plaintextActionsBlocked}>导出 .env</button>
                </section>
                {exportResult && (
                  <div className="export-result" data-testid="export-result">
                    <strong>{exportResult.filename || exportResult.status}</strong>
                    <span>{exportResult.warning || exportResult.reason}</span>
                    {exportResult.content && (
                      <div className="plaintext-gate">
                        <span>明文文件已准备好，默认隐藏行内内容。</span>
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => setShowPlaintextExport((current) => !current)}
                        >
                          {showPlaintextExport ? "隐藏明文" : "显示明文"}
                        </button>
                        {showPlaintextExport && <pre>{exportResult.content}</pre>}
                      </div>
                    )}
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
