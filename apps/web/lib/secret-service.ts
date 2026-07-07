export type Project = {
  id: string;
  name: string;
  description: string;
};

export type Vault = {
  id: string;
  projectId: string;
  name: string;
  environment: string;
  secretCount: number;
  updatedAt: string;
};

export type SecretSummary = {
  id: string;
  vaultId: string;
  key: string;
  maskedValue: string;
  version: number;
  updatedAt: string;
  description: string;
};

export type SecretDetail = SecretSummary & {
  value?: never;
};

export type SecretVersion = {
  version: number;
  maskedValue: string;
  changedAt: string;
  changedBy: string;
};

export type AuditEvent = {
  id: string;
  action:
    | "login"
    | "project.create"
    | "project.update"
    | "project.delete"
    | "vault.create"
    | "vault.update"
    | "vault.delete"
    | "secret.create"
    | "secret.reveal"
    | "secret.copy"
    | "secret.update"
    | "secret.delete"
    | "secret.import"
    | "secret.export";
  projectId: string;
  vaultId?: string;
  secretId?: string;
  secretKey?: string;
  actor: string;
  createdAt: string;
};

type SecretRecord = {
  id: string;
  vaultId: string;
  key: string;
  value: string;
  description: string;
  version: number;
  updatedAt: string;
  versions: Array<SecretVersion & { value: string }>;
};

export type ImportConflictStrategy = "skip" | "overwrite";

export type ImportPreviewLine = {
  lineNumber: number;
  raw: string;
  key?: string;
  valuePreview?: string;
  status: "valid" | "invalid" | "duplicate";
  message: string;
  existingSecretId?: string;
};

export type ImportPreview = {
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  lines: ImportPreviewLine[];
};

export type ImportResult = {
  created: SecretDetail[];
  updated: SecretDetail[];
  skipped: ImportPreviewLine[];
  invalid: ImportPreviewLine[];
};

export type PlaintextExport = {
  filename: string;
  content: string;
  warning: string;
};

export type EncryptedBackupExport = {
  status: "deferred";
  reason: string;
  nextStep: string;
};

type State = {
  projects: Project[];
  vaults: Vault[];
  secrets: SecretRecord[];
  auditEvents: AuditEvent[];
  nextId: number;
};

const globalState = globalThis as typeof globalThis & { __secretManagerState?: State };

function now() {
  return new Date().toISOString();
}

function mask(value: string) {
  return "•".repeat(Math.min(Math.max(value.length, 8), 16));
}

function valuePreview(value: string) {
  return `${value.length} chars, masked`;
}

function createInitialState(): State {
  const createdAt = now();
  const project: Project = {
    id: "proj_demo",
    name: "Demo Workspace",
    description: "MVP validation workspace"
  };
  const vault: Vault = {
    id: "vault_demo",
    projectId: project.id,
    name: "Production",
    environment: "prod",
    secretCount: 1,
    updatedAt: createdAt
  };
  const secret: SecretRecord = {
    id: "sec_demo",
    vaultId: vault.id,
    key: "STRIPE_API_KEY",
    value: "demo-provider-secret-value",
    description: "Payment provider API key",
    version: 1,
    updatedAt: createdAt,
    versions: [
      {
        version: 1,
        maskedValue: mask("demo-provider-secret-value"),
        value: "demo-provider-secret-value",
        changedAt: createdAt,
        changedBy: "system"
      }
    ]
  };

  return {
    projects: [project],
    vaults: [vault],
    secrets: [secret],
    auditEvents: [],
    nextId: 1
  };
}

function state() {
  globalState.__secretManagerState ??= createInitialState();
  return globalState.__secretManagerState;
}

function id(prefix: string) {
  const current = state().nextId++;
  return `${prefix}_${current.toString(36)}`;
}

function publicVault(vault: Vault): Vault {
  return {
    ...vault,
    secretCount: state().secrets.filter((secret) => secret.vaultId === vault.id).length
  };
}

function publicSecret(secret: SecretRecord): SecretDetail {
  return {
    id: secret.id,
    vaultId: secret.vaultId,
    key: secret.key,
    maskedValue: mask(secret.value),
    version: secret.version,
    updatedAt: secret.updatedAt,
    description: secret.description
  };
}

function addAudit(event: Omit<AuditEvent, "id" | "createdAt">) {
  const auditEvent: AuditEvent = {
    ...event,
    id: id("aud"),
    createdAt: now()
  };
  state().auditEvents.unshift(auditEvent);
  return auditEvent;
}

function vaultFor(vaultId: string) {
  const vault = state().vaults.find((item) => item.id === vaultId);
  if (!vault) throw new Error("Vault not found");
  return vault;
}

function assertText(input: unknown, fallback: string) {
  if (typeof input !== "string" || input.trim().length === 0) {
    throw new Error(fallback);
  }
  return input.trim();
}

function assertSecretKey(input: unknown) {
  const key = assertText(input, "Secret key is required");
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
    throw new Error("Secret key must start with a letter or _ and contain only letters, numbers, and _");
  }
  return key;
}

function normalizeEnvValue(rawValue: string) {
  let value = rawValue.trim();
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return value;
}

function parseEnvLine(raw: string, index: number, vaultId: string): ImportPreviewLine {
  const lineNumber = index + 1;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return { lineNumber, raw, status: "invalid", message: "Blank and comment lines are ignored." };
  }

  const separator = raw.indexOf("=");
  if (separator <= 0) {
    return { lineNumber, raw, status: "invalid", message: "Expected KEY=value format." };
  }

  const key = raw.slice(0, separator).trim();
  const value = normalizeEnvValue(raw.slice(separator + 1));
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
    return { lineNumber, raw, key, status: "invalid", message: "Key must be shell-safe: letters, numbers, and _." };
  }

  const existing = state().secrets.find((secret) => secret.vaultId === vaultId && secret.key === key);
  if (existing) {
    return {
      lineNumber,
      raw,
      key,
      valuePreview: valuePreview(value),
      status: "duplicate",
      message: "Key already exists in this vault.",
      existingSecretId: existing.id
    };
  }

  return { lineNumber, raw, key, valuePreview: valuePreview(value), status: "valid", message: "Ready to import." };
}

function parseEnvContent(vaultId: string, content: unknown): ImportPreview {
  const text = assertText(content, ".env content is required");
  const lines = text.split(/\r?\n/).map((line, index) => parseEnvLine(line, index, vaultId));
  return {
    validCount: lines.filter((line) => line.status === "valid").length,
    invalidCount: lines.filter((line) => line.status === "invalid").length,
    duplicateCount: lines.filter((line) => line.status === "duplicate").length,
    lines
  };
}

function envValueFromLine(raw: string) {
  const separator = raw.indexOf("=");
  return normalizeEnvValue(raw.slice(separator + 1));
}

export const secretService = {
  login(actor: string) {
    const project = state().projects[0];
    addAudit({ action: "login", projectId: project.id, actor });
    return { actor, project };
  },

  listProjects() {
    return state().projects;
  },

  createProject(input: { name?: unknown; description?: unknown }, actor: string) {
    const project: Project = {
      id: id("proj"),
      name: assertText(input.name, "Project name is required"),
      description: typeof input.description === "string" ? input.description.trim() : ""
    };
    state().projects.unshift(project);
    addAudit({ action: "project.create", projectId: project.id, actor });
    return project;
  },

  updateProject(projectId: string, input: { name?: unknown; description?: unknown }, actor: string) {
    const project = state().projects.find((item) => item.id === projectId);
    if (!project) throw new Error("Project not found");

    project.name = assertText(input.name, "Project name is required");
    if (typeof input.description === "string") {
      project.description = input.description.trim();
    }
    addAudit({ action: "project.update", projectId, actor });
    return project;
  },

  deleteProject(projectId: string, actor: string) {
    const projectIndex = state().projects.findIndex((item) => item.id === projectId);
    if (projectIndex === -1) throw new Error("Project not found");
    const relatedVaultIds = new Set(state().vaults.filter((vault) => vault.projectId === projectId).map((vault) => vault.id));
    state().projects.splice(projectIndex, 1);
    state().vaults = state().vaults.filter((vault) => vault.projectId !== projectId);
    state().secrets = state().secrets.filter((secret) => !relatedVaultIds.has(secret.vaultId));
    addAudit({ action: "project.delete", projectId, actor });
    return { deleted: true };
  },

  listVaults(projectId: string) {
    return state().vaults.filter((vault) => vault.projectId === projectId).map(publicVault);
  },

  createVault(projectId: string, input: { name?: unknown; environment?: unknown }, actor: string) {
    const project = state().projects.find((item) => item.id === projectId);
    if (!project) throw new Error("Project not found");

    const vault: Vault = {
      id: id("vault"),
      projectId,
      name: assertText(input.name, "Vault name is required"),
      environment: assertText(input.environment, "Environment is required"),
      secretCount: 0,
      updatedAt: now()
    };
    state().vaults.unshift(vault);
    addAudit({ action: "vault.create", projectId, vaultId: vault.id, actor });
    return publicVault(vault);
  },

  updateVault(vaultId: string, input: { name?: unknown; environment?: unknown }, actor: string) {
    const vault = state().vaults.find((item) => item.id === vaultId);
    if (!vault) throw new Error("Vault not found");

    vault.name = assertText(input.name, "Vault name is required");
    vault.environment = assertText(input.environment, "Environment is required");
    vault.updatedAt = now();
    addAudit({ action: "vault.update", projectId: vault.projectId, vaultId: vault.id, actor });
    return publicVault(vault);
  },

  deleteVault(vaultId: string, actor: string) {
    const vaultIndex = state().vaults.findIndex((item) => item.id === vaultId);
    if (vaultIndex === -1) throw new Error("Vault not found");
    const [vault] = state().vaults.splice(vaultIndex, 1);
    state().secrets = state().secrets.filter((secret) => secret.vaultId !== vault.id);
    addAudit({ action: "vault.delete", projectId: vault.projectId, vaultId: vault.id, actor });
    return { deleted: true };
  },

  getVault(vaultId: string) {
    return publicVault(vaultFor(vaultId));
  },

  listSecrets(vaultId: string) {
    return state().secrets.filter((secret) => secret.vaultId === vaultId).map(publicSecret);
  },

  createSecret(vaultId: string, input: { key?: unknown; value?: unknown; description?: unknown }, actor: string) {
    const vault = vaultFor(vaultId);

    const value = assertText(input.value, "Secret value is required");
    const key = assertSecretKey(input.key);
    const duplicate = state().secrets.find((secret) => secret.vaultId === vaultId && secret.key === key);
    if (duplicate) throw new Error("Duplicate secret key in this environment");

    const createdAt = now();
    const secret: SecretRecord = {
      id: id("sec"),
      vaultId,
      key,
      value,
      description: typeof input.description === "string" ? input.description.trim() : "",
      version: 1,
      updatedAt: createdAt,
      versions: [
        {
          version: 1,
          maskedValue: mask(value),
          value,
          changedAt: createdAt,
          changedBy: actor
        }
      ]
    };
    state().secrets.unshift(secret);
    vault.updatedAt = createdAt;
    addAudit({ action: "secret.create", projectId: vault.projectId, vaultId, secretId: secret.id, secretKey: secret.key, actor });
    return publicSecret(secret);
  },

  previewImport(vaultId: string, input: { content?: unknown }) {
    vaultFor(vaultId);
    return parseEnvContent(vaultId, input.content);
  },

  importEnv(vaultId: string, input: { content?: unknown; conflictStrategy?: ImportConflictStrategy }, actor: string): ImportResult {
    const vault = vaultFor(vaultId);
    const strategy = input.conflictStrategy === "overwrite" ? "overwrite" : "skip";
    const preview = parseEnvContent(vaultId, input.content);
    const result: ImportResult = { created: [], updated: [], skipped: [], invalid: [] };

    for (const line of preview.lines) {
      if (line.status === "invalid") {
        result.invalid.push(line);
        continue;
      }
      if (!line.key) continue;

      const existing = state().secrets.find((secret) => secret.vaultId === vaultId && secret.key === line.key);
      if (existing && strategy === "skip") {
        result.skipped.push(line);
        continue;
      }

      const value = envValueFromLine(line.raw);
      if (existing) {
        result.updated.push(this.updateSecret(existing.id, { value, description: existing.description }, actor));
      } else {
        result.created.push(
          this.createSecret(vaultId, { key: line.key, value, description: "Imported from .env" }, actor)
        );
      }
    }

    addAudit({
      action: "secret.import",
      projectId: vault.projectId,
      vaultId,
      secretKey: `${result.created.length} created, ${result.updated.length} updated, ${result.skipped.length} skipped`,
      actor
    });
    return result;
  },

  getSecret(secretId: string) {
    const secret = state().secrets.find((item) => item.id === secretId);
    if (!secret) throw new Error("Secret not found");
    return publicSecret(secret);
  },

  revealSecret(secretId: string, actor: string, action: "secret.reveal" | "secret.copy") {
    const secret = state().secrets.find((item) => item.id === secretId);
    if (!secret) throw new Error("Secret not found");
    const vault = state().vaults.find((item) => item.id === secret.vaultId);
    if (!vault) throw new Error("Vault not found");

    addAudit({ action, projectId: vault.projectId, vaultId: vault.id, secretId: secret.id, secretKey: secret.key, actor });
    return { id: secret.id, key: secret.key, value: secret.value };
  },

  updateSecret(secretId: string, input: { value?: unknown; description?: unknown }, actor: string) {
    const secret = state().secrets.find((item) => item.id === secretId);
    if (!secret) throw new Error("Secret not found");
    const vault = state().vaults.find((item) => item.id === secret.vaultId);
    if (!vault) throw new Error("Vault not found");

    const value = assertText(input.value, "Secret value is required");
    const changedAt = now();
    secret.value = value;
    secret.version += 1;
    secret.updatedAt = changedAt;
    if (typeof input.description === "string") {
      secret.description = input.description.trim();
    }
    secret.versions.unshift({
      version: secret.version,
      maskedValue: mask(value),
      value,
      changedAt,
      changedBy: actor
    });
    vault.updatedAt = changedAt;
    addAudit({ action: "secret.update", projectId: vault.projectId, vaultId: vault.id, secretId: secret.id, secretKey: secret.key, actor });
    return publicSecret(secret);
  },

  deleteSecret(secretId: string, actor: string) {
    const index = state().secrets.findIndex((item) => item.id === secretId);
    if (index === -1) throw new Error("Secret not found");
    const [secret] = state().secrets.splice(index, 1);
    const vault = state().vaults.find((item) => item.id === secret.vaultId);
    if (!vault) throw new Error("Vault not found");

    addAudit({ action: "secret.delete", projectId: vault.projectId, vaultId: vault.id, secretId: secret.id, secretKey: secret.key, actor });
    return { deleted: true };
  },

  listVersions(secretId: string): SecretVersion[] {
    const secret = state().secrets.find((item) => item.id === secretId);
    if (!secret) throw new Error("Secret not found");
    return secret.versions.map(({ value: _value, ...version }) => version);
  },

  exportPlaintext(vaultId: string, input: { confirmedPlaintextRisk?: unknown }, actor: string): PlaintextExport {
    const vault = vaultFor(vaultId);
    if (input.confirmedPlaintextRisk !== true) {
      throw new Error("Plaintext export requires explicit risk confirmation.");
    }

    const content = state()
      .secrets.filter((secret) => secret.vaultId === vaultId)
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((secret) => `${secret.key}=${secret.value}`)
      .join("\n");

    addAudit({
      action: "secret.export",
      projectId: vault.projectId,
      vaultId,
      secretKey: "plaintext .env export",
      actor
    });

    return {
      filename: `${vault.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "vault"}.env`,
      content,
      warning: "Plaintext exports expose secret values. Store or transmit this file only in a trusted channel."
    };
  },

  exportEncryptedBackup(vaultId: string, actor: string): EncryptedBackupExport {
    const vault = vaultFor(vaultId);
    addAudit({
      action: "secret.export",
      projectId: vault.projectId,
      vaultId,
      secretKey: "encrypted backup deferred",
      actor
    });
    return {
      status: "deferred",
      reason: "Encrypted backup export needs the AHO-48 mechanism before it can be implemented safely.",
      nextStep: "Use plaintext export only for demos with explicit warning and fake secrets."
    };
  },

  listAuditEvents() {
    return state().auditEvents;
  }
};
