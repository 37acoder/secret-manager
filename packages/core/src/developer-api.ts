import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { ApiTokenScope } from "./permissions.js";

export type { ApiTokenScope };

export type ApiTokenRecord = {
  id: string;
  vaultId: string;
  name: string;
  tokenPrefix: string;
  tokenHash: string;
  scopes: ApiTokenScope[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export type PublicApiTokenRecord = Omit<ApiTokenRecord, "tokenHash">;

export type DeveloperSecret = {
  key: string;
  value: string;
  versionNumber: number;
  versionId: string;
};

export type SecretVersionWriteResult = {
  key: string;
  versionNumber: number;
  versionId: string;
  created: boolean;
};

export const developerApiErrorCodes = {
  missingToken: "missing_token",
  invalidToken: "invalid_token",
  tokenRevoked: "token_revoked",
  tokenExpired: "token_expired",
  forbidden: "forbidden",
  notFound: "not_found",
  invalidInput: "invalid_input",
  internal: "internal_error"
} as const;

export type DeveloperApiErrorCode =
  (typeof developerApiErrorCodes)[keyof typeof developerApiErrorCodes];

export class DeveloperApiError extends Error {
  constructor(
    readonly code: DeveloperApiErrorCode,
    readonly status: number
  ) {
    super(code);
  }
}

export interface DeveloperApiStore {
  saveToken(record: ApiTokenRecord): Promise<ApiTokenRecord>;
  findTokenByHash(tokenHash: string): Promise<ApiTokenRecord | null>;
  findTokenById(tokenId: string): Promise<ApiTokenRecord | null>;
  updateToken(record: ApiTokenRecord): Promise<ApiTokenRecord>;
  readSecret(input: { vaultId: string; key: string }): Promise<DeveloperSecret | null>;
  listSecrets(input: { vaultId: string }): Promise<DeveloperSecret[]>;
  upsertSecretVersion(input: {
    vaultId: string;
    key: string;
    value: string;
  }): Promise<SecretVersionWriteResult>;
}

export class InMemoryDeveloperApiStore implements DeveloperApiStore {
  readonly tokensByHash = new Map<string, ApiTokenRecord>();
  readonly secretsByVault = new Map<string, Map<string, DeveloperSecret[]>>();

  async saveToken(record: ApiTokenRecord): Promise<ApiTokenRecord> {
    this.tokensByHash.set(record.tokenHash, record);
    return record;
  }

  async findTokenByHash(tokenHash: string): Promise<ApiTokenRecord | null> {
    return this.tokensByHash.get(tokenHash) ?? null;
  }

  async findTokenById(tokenId: string): Promise<ApiTokenRecord | null> {
    return [...this.tokensByHash.values()].find((record) => record.id === tokenId) ?? null;
  }

  async updateToken(record: ApiTokenRecord): Promise<ApiTokenRecord> {
    this.tokensByHash.set(record.tokenHash, record);
    return record;
  }

  async readSecret(input: { vaultId: string; key: string }): Promise<DeveloperSecret | null> {
    return this.secretsByVault.get(input.vaultId)?.get(input.key)?.at(-1) ?? null;
  }

  async listSecrets(input: { vaultId: string }): Promise<DeveloperSecret[]> {
    return [...(this.secretsByVault.get(input.vaultId)?.values() ?? [])]
      .map((versions) => versions.at(-1))
      .filter((secret): secret is DeveloperSecret => Boolean(secret))
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  async upsertSecretVersion(input: {
    vaultId: string;
    key: string;
    value: string;
  }): Promise<SecretVersionWriteResult> {
    const vaultSecrets = this.getVaultSecrets(input.vaultId);
    const versions = vaultSecrets.get(input.key) ?? [];
    const version: DeveloperSecret = {
      key: input.key,
      value: input.value,
      versionNumber: versions.length + 1,
      versionId: randomUUID()
    };

    vaultSecrets.set(input.key, [...versions, version]);
    return {
      key: version.key,
      versionNumber: version.versionNumber,
      versionId: version.versionId,
      created: versions.length === 0
    };
  }

  private getVaultSecrets(vaultId: string): Map<string, DeveloperSecret[]> {
    const existing = this.secretsByVault.get(vaultId);
    if (existing) return existing;
    const created = new Map<string, DeveloperSecret[]>();
    this.secretsByVault.set(vaultId, created);
    return created;
  }
}

export class DeveloperApiTokenService {
  constructor(
    private readonly store: DeveloperApiStore,
    private readonly now: () => Date = () => new Date()
  ) {}

  async createToken(input: {
    vaultId: string;
    name: string;
    scopes: ApiTokenScope[];
    expiresAt?: Date | string | null;
  }): Promise<{ token: string; tokenRecord: PublicApiTokenRecord }> {
    validateScopes(input.scopes);
    const token = `sm_${randomBytes(24).toString("base64url")}`;
    const record: ApiTokenRecord = {
      id: randomUUID(),
      vaultId: input.vaultId,
      name: input.name,
      tokenPrefix: token.slice(0, 10),
      tokenHash: hashApiToken(token),
      scopes: [...new Set(input.scopes)],
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: this.now()
    };

    await this.store.saveToken(record);
    return { token, tokenRecord: toPublicTokenRecord(record) };
  }

  async revokeTokenHash(tokenHash: string): Promise<boolean> {
    const record = await this.store.findTokenByHash(tokenHash);
    if (!record) return false;
    await this.store.updateToken({ ...record, revokedAt: this.now() });
    return true;
  }

  async revokeTokenId(tokenId: string): Promise<boolean> {
    const record = await this.store.findTokenById(tokenId);
    if (!record) return false;
    await this.store.updateToken({ ...record, revokedAt: this.now() });
    return true;
  }

  async authenticate(input: {
    rawToken: string;
    vaultId: string;
    requiredScope: ApiTokenScope;
  }): Promise<PublicApiTokenRecord> {
    if (!input.rawToken) {
      throw new DeveloperApiError(developerApiErrorCodes.missingToken, 401);
    }

    const tokenHash = hashApiToken(input.rawToken);
    const record = await this.store.findTokenByHash(tokenHash);
    if (!record || !constantTimeEqual(record.tokenHash, tokenHash)) {
      throw new DeveloperApiError(developerApiErrorCodes.invalidToken, 401);
    }
    if (record.revokedAt) {
      throw new DeveloperApiError(developerApiErrorCodes.tokenRevoked, 401);
    }
    if (record.expiresAt && record.expiresAt <= this.now()) {
      throw new DeveloperApiError(developerApiErrorCodes.tokenExpired, 401);
    }
    if (record.vaultId !== input.vaultId || !record.scopes.includes(input.requiredScope)) {
      throw new DeveloperApiError(developerApiErrorCodes.forbidden, 403);
    }

    const updated = await this.store.updateToken({ ...record, lastUsedAt: this.now() });
    return toPublicTokenRecord(updated);
  }
}

export class DeveloperSecretApi {
  constructor(
    private readonly store: DeveloperApiStore,
    private readonly tokens: DeveloperApiTokenService
  ) {}

  createToken(input: Parameters<DeveloperApiTokenService["createToken"]>[0]) {
    return this.tokens.createToken(input);
  }

  revokeTokenHash(tokenHash: string) {
    return this.tokens.revokeTokenHash(tokenHash);
  }

  revokeTokenId(tokenId: string) {
    return this.tokens.revokeTokenId(tokenId);
  }

  async readSecret(input: {
    token: string;
    vaultId: string;
    key: string;
  }): Promise<DeveloperSecret> {
    await this.tokens.authenticate({
      rawToken: input.token,
      vaultId: input.vaultId,
      requiredScope: "read_secrets"
    });
    const secret = await this.store.readSecret({ vaultId: input.vaultId, key: input.key });
    if (!secret) {
      throw new DeveloperApiError(developerApiErrorCodes.notFound, 404);
    }
    return secret;
  }

  async listSecrets(input: {
    token: string;
    vaultId: string;
  }): Promise<DeveloperSecret[]> {
    await this.tokens.authenticate({
      rawToken: input.token,
      vaultId: input.vaultId,
      requiredScope: "read_secrets"
    });
    return this.store.listSecrets({ vaultId: input.vaultId });
  }

  async upsertSecret(input: {
    token: string;
    vaultId: string;
    key: string;
    value: string;
  }): Promise<SecretVersionWriteResult> {
    validateSecretInput(input);
    await this.tokens.authenticate({
      rawToken: input.token,
      vaultId: input.vaultId,
      requiredScope: "write_secrets"
    });
    return this.store.upsertSecretVersion({
      vaultId: input.vaultId,
      key: input.key,
      value: input.value
    });
  }
}

export function createDeveloperSecretApi(input?: {
  store?: DeveloperApiStore;
  now?: () => Date;
}): DeveloperSecretApi {
  const store = input?.store ?? new InMemoryDeveloperApiStore();
  const tokens = new DeveloperApiTokenService(store, input?.now);
  return new DeveloperSecretApi(store, tokens);
}

export function createRequestId(): string {
  return randomUUID();
}

export function toDeveloperApiSuccess<T>(requestId: string, data: T, status = 200) {
  return { status, body: { requestId, data } };
}

export function toDeveloperApiError(requestId: string, error: unknown) {
  if (error instanceof DeveloperApiError) {
    return {
      status: error.status,
      body: { requestId, error: { code: error.code } }
    };
  }

  return {
    status: 500,
    body: { requestId, error: { code: developerApiErrorCodes.internal } }
  };
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function toPublicTokenRecord(record: ApiTokenRecord): PublicApiTokenRecord {
  return {
    id: record.id,
    vaultId: record.vaultId,
    name: record.name,
    tokenPrefix: record.tokenPrefix,
    scopes: [...record.scopes],
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
    createdAt: record.createdAt
  };
}

function validateScopes(scopes: ApiTokenScope[]): void {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new DeveloperApiError(developerApiErrorCodes.invalidInput, 400);
  }

  const allowedScopes = new Set<ApiTokenScope>(["read_secrets", "write_secrets"]);
  if (scopes.some((scope) => !allowedScopes.has(scope))) {
    throw new DeveloperApiError(developerApiErrorCodes.invalidInput, 400);
  }
}

function validateSecretInput(input: { key: string; value: string }): void {
  if (typeof input.key !== "string" || !/^[A-Za-z0-9_.:/-]{1,128}$/.test(input.key)) {
    throw new DeveloperApiError(developerApiErrorCodes.invalidInput, 400);
  }
  if (typeof input.value !== "string" || Buffer.byteLength(input.value, "utf8") > 64 * 1024) {
    throw new DeveloperApiError(developerApiErrorCodes.invalidInput, 400);
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
