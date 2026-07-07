import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

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
  locked: boolean;
  unlockedUntil?: string;
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
    | "secret.export"
    | "vault.unlock"
    | "vault.lock"
    | "token.create";
  projectId: string;
  vaultId?: string;
  secretId?: string;
  secretKey?: string;
  actor: string;
  createdAt: string;
};

type EncryptedPayload = {
  ciphertext: string;
  nonce: string;
  authTag: string;
};

type SecretRecord = {
  id: string;
  vaultId: string;
  key: string;
  description: string;
  version: number;
  updatedAt: string;
  versions: Array<SecretVersion & { encrypted: EncryptedPayload }>;
};

type VaultRecord = Vault & {
  passwordSalt: string;
  verifier: EncryptedPayload;
  unlockedKey?: Buffer;
  unlockedUntilMs?: number;
};

type TemporaryTokenRecord = {
  tokenHash: string;
  tokenPrefix: string;
  vaultId: string;
  vaultKey: Buffer;
  scopes: Array<"read_secrets">;
  actor: string;
  expiresAtMs: number;
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
  vaults: VaultRecord[];
  secrets: SecretRecord[];
  auditEvents: AuditEvent[];
  temporaryTokens: TemporaryTokenRecord[];
  nextId: number;
};

const globalState = globalThis as typeof globalThis & { __secretManagerState?: State };
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 20;
const UNLOCK_TTL_MS = 10 * 60 * 1000;
const CLI_TOKEN_TTL_MS = 15 * 60 * 1000;
const VERIFIER_TEXT = "secret-manager-vault-verifier";

function now() {
  return new Date().toISOString();
}

function mask(value: string) {
  return "•".repeat(Math.min(Math.max(value.length, 8), 16));
}

function valuePreview(value: string) {
  return `${value.length} chars, masked`;
}

function assertVaultPassword(input: unknown): string {
  const password = assertText(input, "Vault password is required");
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new Error("Vault password must be 6-20 characters.");
  }
  return password;
}

function deriveVaultKey(password: string, salt: string): Buffer {
  return scryptSync(password, Buffer.from(salt, "base64"), KEY_BYTES);
}

function encryptWithKey(value: string, key: Buffer): EncryptedPayload {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: nonce.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

function decryptWithKey(payload: EncryptedPayload, key: Buffer): string {
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.nonce, "base64"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function createPasswordConfig(password: string) {
  const passwordSalt = randomBytes(16).toString("base64");
  const vaultKey = deriveVaultKey(password, passwordSalt);
  return {
    passwordSalt,
    verifier: encryptWithKey(VERIFIER_TEXT, vaultKey),
    vaultKey
  };
}

function assertPasswordForVault(vault: VaultRecord, password: string): Buffer {
  const vaultKey = deriveVaultKey(password, vault.passwordSalt);
  try {
    if (decryptWithKey(vault.verifier, vaultKey) !== VERIFIER_TEXT) {
      throw new Error("Invalid vault password.");
    }
  } catch {
    throw new Error("Invalid vault password.");
  }
  return vaultKey;
}

function isVaultUnlocked(vault: VaultRecord): boolean {
  if (!vault.unlockedKey || !vault.unlockedUntilMs) return false;
  if (vault.unlockedUntilMs <= Date.now()) {
    delete vault.unlockedKey;
    delete vault.unlockedUntilMs;
    return false;
  }
  return true;
}

function requireUnlockedKey(vault: VaultRecord): Buffer {
  if (!isVaultUnlocked(vault) || !vault.unlockedKey) {
    throw new Error("Vault is locked. Unlock with the vault password first.");
  }
  return vault.unlockedKey;
}

function publicVault(vault: VaultRecord): Vault {
  return {
    id: vault.id,
    projectId: vault.projectId,
    name: vault.name,
    environment: vault.environment,
    secretCount: state().secrets.filter((secret) => secret.vaultId === vault.id).length,
    updatedAt: vault.updatedAt,
    locked: !isVaultUnlocked(vault),
    ...(isVaultUnlocked(vault) && vault.unlockedUntilMs ? { unlockedUntil: new Date(vault.unlockedUntilMs).toISOString() } : {})
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function constantTimeTokenEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function createInitialState(): State {
  const createdAt = now();
  const passwordConfig = createPasswordConfig("demo123");
  const demoValue = "demo-provider-secret-value";
  const project: Project = {
    id: "proj_demo",
    name: "Demo Workspace",
    description: "MVP validation workspace"
  };
  const vault: VaultRecord = {
    id: "vault_demo",
    projectId: project.id,
    name: "Production",
    environment: "prod",
    secretCount: 1,
    updatedAt: createdAt,
    locked: true,
    passwordSalt: passwordConfig.passwordSalt,
    verifier: passwordConfig.verifier
  };
  const secret: SecretRecord = {
    id: "sec_demo",
    vaultId: vault.id,
    key: "STRIPE_API_KEY",
    description: "Payment provider API key",
    version: 1,
    updatedAt: createdAt,
    versions: [
      {
        version: 1,
        maskedValue: mask(demoValue),
        encrypted: encryptWithKey(demoValue, passwordConfig.vaultKey),
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
    temporaryTokens: [],
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

function publicSecret(secret: SecretRecord): SecretDetail {
  const currentVersion = secret.versions[0];
  return {
    id: secret.id,
    vaultId: secret.vaultId,
    key: secret.key,
    maskedValue: currentVersion?.maskedValue ?? mask(""),
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

  createVault(projectId: string, input: { name?: unknown; environment?: unknown; password?: unknown }, actor: string) {
    const project = state().projects.find((item) => item.id === projectId);
    if (!project) throw new Error("Project not found");
    const passwordConfig = createPasswordConfig(assertVaultPassword(input.password));

    const vault: VaultRecord = {
      id: id("vault"),
      projectId,
      name: assertText(input.name, "Vault name is required"),
      environment: assertText(input.environment, "Environment is required"),
      secretCount: 0,
      updatedAt: now(),
      locked: false,
      unlockedKey: passwordConfig.vaultKey,
      unlockedUntilMs: Date.now() + UNLOCK_TTL_MS,
      passwordSalt: passwordConfig.passwordSalt,
      verifier: passwordConfig.verifier
    };
    state().vaults.unshift(vault);
    addAudit({ action: "vault.create", projectId, vaultId: vault.id, actor });
    return publicVault(vault);
  },

  unlockVault(vaultId: string, input: { password?: unknown }, actor: string) {
    const vault = vaultFor(vaultId);
    const vaultKey = assertPasswordForVault(vault, assertVaultPassword(input.password));
    vault.unlockedKey = vaultKey;
    vault.unlockedUntilMs = Date.now() + UNLOCK_TTL_MS;
    addAudit({ action: "vault.unlock", projectId: vault.projectId, vaultId, actor });
    return publicVault(vault);
  },

  lockVault(vaultId: string, actor: string) {
    const vault = vaultFor(vaultId);
    delete vault.unlockedKey;
    delete vault.unlockedUntilMs;
    addAudit({ action: "vault.lock", projectId: vault.projectId, vaultId, actor });
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
    const vaultKey = requireUnlockedKey(vault);

    const value = assertText(input.value, "Secret value is required");
    const key = assertSecretKey(input.key);
    const duplicate = state().secrets.find((secret) => secret.vaultId === vaultId && secret.key === key);
    if (duplicate) throw new Error("Duplicate secret key in this environment");

    const createdAt = now();
    const secret: SecretRecord = {
      id: id("sec"),
      vaultId,
      key,
      description: typeof input.description === "string" ? input.description.trim() : "",
      version: 1,
      updatedAt: createdAt,
      versions: [
        {
        version: 1,
        maskedValue: mask(value),
          encrypted: encryptWithKey(value, vaultKey),
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
    requireUnlockedKey(vault);
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
    const vaultKey = requireUnlockedKey(vault);
    const currentVersion = secret.versions[0];
    if (!currentVersion) throw new Error("Secret version not found");

    addAudit({ action, projectId: vault.projectId, vaultId: vault.id, secretId: secret.id, secretKey: secret.key, actor });
    return { id: secret.id, key: secret.key, value: decryptWithKey(currentVersion.encrypted, vaultKey) };
  },

  updateSecret(secretId: string, input: { value?: unknown; description?: unknown }, actor: string) {
    const secret = state().secrets.find((item) => item.id === secretId);
    if (!secret) throw new Error("Secret not found");
    const vault = state().vaults.find((item) => item.id === secret.vaultId);
    if (!vault) throw new Error("Vault not found");
    const vaultKey = requireUnlockedKey(vault);

    const value = assertText(input.value, "Secret value is required");
    const changedAt = now();
    secret.version += 1;
    secret.updatedAt = changedAt;
    if (typeof input.description === "string") {
      secret.description = input.description.trim();
    }
    secret.versions.unshift({
      version: secret.version,
      maskedValue: mask(value),
      encrypted: encryptWithKey(value, vaultKey),
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
    return secret.versions.map(({ encrypted: _encrypted, ...version }) => version);
  },

  exportPlaintext(vaultId: string, input: { confirmedPlaintextRisk?: unknown }, actor: string): PlaintextExport {
    const vault = vaultFor(vaultId);
    const vaultKey = requireUnlockedKey(vault);
    if (input.confirmedPlaintextRisk !== true) {
      throw new Error("Plaintext export requires explicit risk confirmation.");
    }

    const content = state()
      .secrets.filter((secret) => secret.vaultId === vaultId)
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((secret) => {
        const currentVersion = secret.versions[0];
        if (!currentVersion) return `${secret.key}=`;
        return `${secret.key}=${decryptWithKey(currentVersion.encrypted, vaultKey)}`;
      })
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
    requireUnlockedKey(vault);
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

  issueTemporaryToken(vaultId: string, input: { password?: unknown }, actor: string) {
    const vault = vaultFor(vaultId);
    const vaultKey = assertPasswordForVault(vault, assertVaultPassword(input.password));
    const token = `sm_tmp_${randomBytes(24).toString("base64url")}`;
    const expiresAtMs = Date.now() + CLI_TOKEN_TTL_MS;
    const record: TemporaryTokenRecord = {
      tokenHash: hashToken(token),
      tokenPrefix: token.slice(0, 14),
      vaultId,
      vaultKey,
      scopes: ["read_secrets"],
      actor,
      expiresAtMs
    };
    state().temporaryTokens = state().temporaryTokens.filter((item) => item.expiresAtMs > Date.now());
    state().temporaryTokens.push(record);
    addAudit({ action: "token.create", projectId: vault.projectId, vaultId, secretKey: "temporary CLI token", actor });
    return {
      token,
      tokenRecord: {
        tokenPrefix: record.tokenPrefix,
        vaultId,
        scopes: record.scopes,
        expiresAt: new Date(expiresAtMs).toISOString()
      }
    };
  },

  readSecretWithToken(vaultId: string, key: string, token: string) {
    const tokenRecord = authenticateTemporaryToken(vaultId, token);
    const secret = state().secrets.find((item) => item.vaultId === vaultId && item.key === key);
    if (!secret) {
      throw new Error("Secret key not found.");
    }
    const currentVersion = secret.versions[0];
    if (!currentVersion) {
      throw new Error("Secret version not found.");
    }
    return {
      key: secret.key,
      value: decryptWithKey(currentVersion.encrypted, tokenRecord.vaultKey),
      versionNumber: secret.version,
      versionId: `${secret.id}:v${secret.version}`
    };
  },

  listSecretsWithToken(vaultId: string, token: string) {
    const tokenRecord = authenticateTemporaryToken(vaultId, token);
    return state()
      .secrets.filter((secret) => secret.vaultId === vaultId)
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((secret) => {
        const currentVersion = secret.versions[0];
        if (!currentVersion) {
          return { key: secret.key, value: "", versionNumber: secret.version, versionId: `${secret.id}:v${secret.version}` };
        }
        return {
          key: secret.key,
          value: decryptWithKey(currentVersion.encrypted, tokenRecord.vaultKey),
          versionNumber: secret.version,
          versionId: `${secret.id}:v${secret.version}`
        };
      });
  },

  listAuditEvents() {
    return state().auditEvents;
  }
};

function authenticateTemporaryToken(vaultId: string, token: string): TemporaryTokenRecord {
  const tokenHash = hashToken(token);
  state().temporaryTokens = state().temporaryTokens.filter((item) => item.expiresAtMs > Date.now());
  const record = state().temporaryTokens.find((item) => item.vaultId === vaultId && constantTimeTokenEqual(item.tokenHash, tokenHash));
  if (!record) {
    throw new Error("Invalid or expired temporary access token.");
  }
  if (!record.scopes.includes("read_secrets")) {
    throw new Error("Temporary access token cannot read this vault.");
  }
  return record;
}
