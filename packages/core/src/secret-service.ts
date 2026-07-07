import type { EnvelopeCrypto, EncryptedSecret } from "@secret-manager/crypto";
import type { SecretRecord, SecretVersionRecord } from "@secret-manager/db";
import type { AuditSink } from "./audit.js";

export interface ActorContext {
  accountId: string;
  userId: string;
  requestId?: string | undefined;
}

export interface CreateSecretInput {
  vaultId: string;
  key: string;
  value: string;
  description?: string | undefined;
}

export interface UpdateSecretInput {
  secretId: string;
  value: string;
  description?: string | undefined;
}

export interface SecretListItem {
  id: string;
  vaultId: string;
  key: string;
  description?: string | undefined;
  maskedValue: "********";
  currentVersionNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RevealedSecret extends SecretListItem {
  value: string;
}

export interface SecretRepository {
  createSecret(input: {
    vaultId: string;
    key: string;
    description?: string | undefined;
    createdByUserId: string;
  }): Promise<SecretRecord>;
  updateSecretMetadata(secretId: string, input: { description?: string | undefined }): Promise<SecretRecord>;
  softDeleteSecret(secretId: string): Promise<SecretRecord>;
  findSecret(secretId: string): Promise<SecretRecord | null>;
  insertVersion(input: {
    secretId: string;
    versionNumber: number;
    encrypted: EncryptedSecret;
    createdByUserId: string;
  }): Promise<SecretVersionRecord>;
  findCurrentVersion(secretId: string): Promise<SecretVersionRecord | null>;
}

export class SecretService {
  constructor(
    private readonly repository: SecretRepository,
    private readonly crypto: EnvelopeCrypto,
    private readonly audit: AuditSink
  ) {}

  async createSecret(actor: ActorContext, input: CreateSecretInput): Promise<SecretListItem> {
    validateSecretKey(input.key);
    validateSecretValue(input.value);

    const createInput: Parameters<SecretRepository["createSecret"]>[0] = {
      vaultId: input.vaultId,
      key: input.key,
      createdByUserId: actor.userId
    };
    if (input.description !== undefined) {
      createInput.description = input.description;
    }
    const secret = await this.repository.createSecret(createInput);
    const version = await this.repository.insertVersion({
      secretId: secret.id,
      versionNumber: 1,
      encrypted: this.crypto.encrypt(input.value),
      createdByUserId: actor.userId
    });

    await this.audit.write({
      accountId: actor.accountId,
      actorUserId: actor.userId,
      action: "secret.create",
      targetType: "secret",
      targetId: secret.id,
      outcome: "success",
      requestId: actor.requestId,
      metadata: { vaultId: input.vaultId, key: input.key }
    });

    return toListItem(secret, version);
  }

  async updateSecret(actor: ActorContext, input: UpdateSecretInput): Promise<SecretListItem> {
    validateSecretValue(input.value);
    const secret = await this.requireSecret(input.secretId);
    const currentVersion = await this.repository.findCurrentVersion(secret.id);
    const versionNumber = currentVersion ? currentVersion.versionNumber + 1 : 1;

    const updateInput: Parameters<SecretRepository["updateSecretMetadata"]>[1] = {};
    const nextDescription = input.description ?? secret.description;
    if (nextDescription !== undefined) {
      updateInput.description = nextDescription;
    }
    const updated = await this.repository.updateSecretMetadata(secret.id, updateInput);
    const version = await this.repository.insertVersion({
      secretId: secret.id,
      versionNumber,
      encrypted: this.crypto.encrypt(input.value),
      createdByUserId: actor.userId
    });

    await this.audit.write({
      accountId: actor.accountId,
      actorUserId: actor.userId,
      action: "secret.update",
      targetType: "secret",
      targetId: secret.id,
      outcome: "success",
      requestId: actor.requestId,
      metadata: { versionNumber }
    });

    return toListItem(updated, version);
  }

  async revealSecret(actor: ActorContext, secretId: string): Promise<RevealedSecret> {
    const secret = await this.requireSecret(secretId);
    const version = await this.requireCurrentVersion(secret.id);
    const value = this.crypto.decrypt(toEncryptedSecret(version));

    await this.audit.write({
      accountId: actor.accountId,
      actorUserId: actor.userId,
      action: "secret.reveal",
      targetType: "secret",
      targetId: secret.id,
      outcome: "success",
      requestId: actor.requestId,
      metadata: { versionNumber: version.versionNumber }
    });

    return { ...toListItem(secret, version), value };
  }

  async deleteSecret(actor: ActorContext, secretId: string): Promise<void> {
    const secret = await this.requireSecret(secretId);
    await this.repository.softDeleteSecret(secret.id);

    await this.audit.write({
      accountId: actor.accountId,
      actorUserId: actor.userId,
      action: "secret.delete",
      targetType: "secret",
      targetId: secret.id,
      outcome: "success",
      requestId: actor.requestId,
      metadata: {}
    });
  }

  private async requireSecret(secretId: string): Promise<SecretRecord> {
    const secret = await this.repository.findSecret(secretId);
    if (!secret || secret.deletedAt) {
      throw new Error("Secret not found");
    }
    return secret;
  }

  private async requireCurrentVersion(secretId: string): Promise<SecretVersionRecord> {
    const version = await this.repository.findCurrentVersion(secretId);
    if (!version) {
      throw new Error("Secret version not found");
    }
    return version;
  }
}

export class InMemorySecretRepository implements SecretRepository {
  readonly secrets = new Map<string, SecretRecord>();
  readonly versions = new Map<string, SecretVersionRecord[]>();

  async createSecret(input: {
    vaultId: string;
    key: string;
    description?: string | undefined;
    createdByUserId: string;
  }): Promise<SecretRecord> {
    const now = new Date();
    const secret: SecretRecord = {
      id: `secret_${this.secrets.size + 1}`,
      vaultId: input.vaultId,
      key: input.key,
      currentVersionId: null,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    if (input.description !== undefined) {
      secret.description = input.description;
    }
    this.secrets.set(secret.id, secret);
    return secret;
  }

  async updateSecretMetadata(secretId: string, input: { description?: string | undefined }): Promise<SecretRecord> {
    const secret = await this.requireStoredSecret(secretId);
    const updated: SecretRecord = {
      ...secret,
      updatedAt: new Date()
    };
    if (input.description !== undefined) {
      updated.description = input.description;
    }
    this.secrets.set(secretId, updated);
    return updated;
  }

  async softDeleteSecret(secretId: string): Promise<SecretRecord> {
    const secret = await this.requireStoredSecret(secretId);
    const deleted: SecretRecord = {
      ...secret,
      deletedAt: new Date(),
      updatedAt: new Date()
    };
    this.secrets.set(secretId, deleted);
    return deleted;
  }

  async findSecret(secretId: string): Promise<SecretRecord | null> {
    return this.secrets.get(secretId) ?? null;
  }

  async insertVersion(input: {
    secretId: string;
    versionNumber: number;
    encrypted: EncryptedSecret;
    createdByUserId: string;
  }): Promise<SecretVersionRecord> {
    const secret = await this.requireStoredSecret(input.secretId);
    const now = new Date();
    const version: SecretVersionRecord = {
      id: `version_${input.secretId}_${input.versionNumber}`,
      secretId: input.secretId,
      versionNumber: input.versionNumber,
      ciphertext: input.encrypted.ciphertext,
      nonce: input.encrypted.nonce,
      encryptedDek: input.encrypted.encryptedDek,
      encryptionKeyVersion: input.encrypted.keyVersion,
      createdByUserId: input.createdByUserId,
      createdAt: now
    };

    this.versions.set(input.secretId, [...(this.versions.get(input.secretId) ?? []), version]);
    this.secrets.set(input.secretId, {
      ...secret,
      currentVersionId: version.id,
      updatedAt: now
    });
    return version;
  }

  async findCurrentVersion(secretId: string): Promise<SecretVersionRecord | null> {
    const secret = await this.findSecret(secretId);
    const versions = this.versions.get(secretId) ?? [];
    return versions.find((version) => version.id === secret?.currentVersionId) ?? null;
  }

  private async requireStoredSecret(secretId: string): Promise<SecretRecord> {
    const secret = await this.findSecret(secretId);
    if (!secret) {
      throw new Error("Secret not found");
    }
    return secret;
  }
}

function toListItem(secret: SecretRecord, version: SecretVersionRecord): SecretListItem {
  return {
    id: secret.id,
    vaultId: secret.vaultId,
    key: secret.key,
    description: secret.description,
    maskedValue: "********",
    currentVersionNumber: version.versionNumber,
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt
  };
}

function toEncryptedSecret(version: SecretVersionRecord): EncryptedSecret {
  return {
    ciphertext: version.ciphertext,
    nonce: version.nonce,
    encryptedDek: version.encryptedDek,
    keyVersion: version.encryptionKeyVersion
  };
}

function validateSecretKey(key: string): void {
  if (!/^[A-Z0-9_./-]{1,128}$/i.test(key)) {
    throw new Error("Secret key must be 1-128 chars and contain only letters, numbers, _, ., /, or -");
  }
}

function validateSecretValue(value: string): void {
  if (Buffer.byteLength(value, "utf8") > 64 * 1024) {
    throw new Error("Secret value must be 64KB or smaller");
  }
}
