import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const KEY_BYTES = 32;

export type KeyVersion = `v${number}`;

export type EncryptedSecretVersion = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  encryptedDek: string;
  dekNonce: string;
  dekAuthTag: string;
  encryptionKeyVersion: string;
};

export type MasterKey = {
  bytes: Buffer;
  version: KeyVersion;
};

export function loadMasterKeyFromEnv(env: NodeJS.ProcessEnv = process.env): MasterKey {
  const raw = env.SM_MASTER_KEY;
  if (!raw) {
    throw new Error("SM_MASTER_KEY is required");
  }

  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== KEY_BYTES) {
    throw new Error("SM_MASTER_KEY must decode to 32 bytes");
  }

  return {
    bytes,
    version: toKeyVersion(env.SM_KEY_VERSION ?? "v1")
  };
}

export function encryptSecretValue(value: string, masterKey: MasterKey): EncryptedSecretVersion {
  const dek = randomBytes(KEY_BYTES);
  const valueNonce = randomBytes(NONCE_BYTES);
  const valueCipher = createCipheriv(ALGORITHM, dek, valueNonce);
  const ciphertext = Buffer.concat([
    valueCipher.update(value, "utf8"),
    valueCipher.final()
  ]);

  const dekNonce = randomBytes(NONCE_BYTES);
  const dekCipher = createCipheriv(ALGORITHM, masterKey.bytes, dekNonce);
  const encryptedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64"),
    nonce: valueNonce.toString("base64"),
    authTag: valueCipher.getAuthTag().toString("base64"),
    encryptedDek: encryptedDek.toString("base64"),
    dekNonce: dekNonce.toString("base64"),
    dekAuthTag: dekCipher.getAuthTag().toString("base64"),
    encryptionKeyVersion: masterKey.version
  };
}

export function decryptSecretValue(
  encrypted: EncryptedSecretVersion,
  masterKey: MasterKey
): string {
  const dekDecipher = createDecipheriv(
    ALGORITHM,
    masterKey.bytes,
    Buffer.from(encrypted.dekNonce, "base64")
  );
  dekDecipher.setAuthTag(Buffer.from(encrypted.dekAuthTag, "base64"));
  const dek = Buffer.concat([
    dekDecipher.update(Buffer.from(encrypted.encryptedDek, "base64")),
    dekDecipher.final()
  ]);

  const valueDecipher = createDecipheriv(
    ALGORITHM,
    dek,
    Buffer.from(encrypted.nonce, "base64")
  );
  valueDecipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  return Buffer.concat([
    valueDecipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    valueDecipher.final()
  ]).toString("utf8");
}

const SENSITIVE_KEYS = [
  "authorization",
  "cookie",
  "password",
  "secret",
  "token",
  "value",
  "SM_MASTER_KEY"
];

export function redactSensitive(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => redactSensitive(item));
  }

  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        isSensitiveKey(key) ? "[REDACTED]" : redactSensitive(value)
      ])
    );
  }

  return input;
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) =>
    normalized.includes(sensitive.toLowerCase())
  );
}

export interface EncryptedSecret {
  ciphertext: string;
  nonce: string;
  encryptedDek: string;
  keyVersion: KeyVersion;
}

export interface EnvelopeCrypto {
  encrypt(plaintext: string): EncryptedSecret;
  decrypt(payload: EncryptedSecret): string;
}

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

export function masterKeyFromBase64(version: KeyVersion, encoded: string): MasterKey {
  const bytes = Buffer.from(encoded, "base64");
  assertMasterKey(bytes);
  return { bytes, version };
}

export function generateMasterKey(version: KeyVersion = "v1"): MasterKey {
  return { bytes: randomBytes(KEY_BYTES), version };
}

export function createEnvelopeCrypto(activeKey: MasterKey, historicalKeys: MasterKey[] = []): EnvelopeCrypto {
  const keyring = new Map<string, MasterKey>();
  for (const key of [activeKey, ...historicalKeys]) {
    assertMasterKey(key.bytes);
    keyring.set(key.version, key);
  }

  return {
    encrypt(plaintext: string): EncryptedSecret {
      const encrypted = encryptSecretValue(plaintext, activeKey);
      return {
        ciphertext: packCiphertext(encrypted),
        nonce: encrypted.nonce,
        encryptedDek: packEncryptedDek(encrypted),
        keyVersion: encrypted.encryptionKeyVersion as KeyVersion
      };
    },
    decrypt(payload: EncryptedSecret): string {
      const masterKey = keyring.get(payload.keyVersion);
      if (!masterKey) {
        throw new CryptoError(`Missing master key for ${payload.keyVersion}`);
      }

      try {
        return decryptSecretValue(unpackEncryptedSecret(payload), masterKey);
      } catch {
        throw new CryptoError("Unable to decrypt secret payload");
      }
    }
  };
}

export const redact = redactSensitive;

export function redactForLog(input: unknown): string {
  return JSON.stringify(redactSensitive(input));
}

export function redactError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { error: redactSensitive(error) };
  }

  return redactSensitive({
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: "cause" in error ? error.cause : undefined
  }) as Record<string, unknown>;
}

export function redactForSnapshot(input: unknown): unknown {
  return redactSensitive(input);
}

function packCiphertext(encrypted: EncryptedSecretVersion): string {
  return `${encrypted.ciphertext}.${encrypted.authTag}`;
}

function packEncryptedDek(encrypted: EncryptedSecretVersion): string {
  return `${encrypted.encryptedDek}.${encrypted.dekNonce}.${encrypted.dekAuthTag}`;
}

function unpackEncryptedSecret(payload: EncryptedSecret): EncryptedSecretVersion {
  const [ciphertext, authTag] = payload.ciphertext.split(".");
  const [encryptedDek, dekNonce, dekAuthTag] = payload.encryptedDek.split(".");
  if (!ciphertext || !authTag || !encryptedDek || !dekNonce || !dekAuthTag) {
    throw new CryptoError("Invalid encrypted secret payload");
  }

  return {
    ciphertext,
    authTag,
    nonce: payload.nonce,
    encryptedDek,
    dekNonce,
    dekAuthTag,
    encryptionKeyVersion: payload.keyVersion
  };
}

function assertMasterKey(bytes: Buffer): void {
  if (bytes.length !== KEY_BYTES) {
    throw new CryptoError(`Master key must be ${KEY_BYTES} bytes`);
  }
}

function toKeyVersion(version: string): KeyVersion {
  if (!/^v\d+$/.test(version)) {
    throw new Error("SM_KEY_VERSION must look like v1");
  }

  return version as KeyVersion;
}
