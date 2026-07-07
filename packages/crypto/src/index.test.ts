import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptSecretValue,
  encryptSecretValue,
  redactSensitive,
  type MasterKey
} from "./index";

const masterKey: MasterKey = {
  bytes: randomBytes(32),
  version: "v1"
};

describe("envelope encryption", () => {
  it("roundtrips a fake secret without storing plaintext", () => {
    const encrypted = encryptSecretValue("demo-api-key-value", masterKey);

    expect(encrypted.ciphertext).not.toContain("demo-api-key-value");
    expect(decryptSecretValue(encrypted, masterKey)).toBe("demo-api-key-value");
    expect(encrypted.encryptionKeyVersion).toBe("v1");
  });

  it("uses a fresh nonce per encryption", () => {
    const first = encryptSecretValue("same-fake-value", masterKey);
    const second = encryptSecretValue("same-fake-value", masterKey);

    expect(first.nonce).not.toBe(second.nonce);
    expect(first.encryptedDek).not.toBe(second.encryptedDek);
  });
});

describe("redaction", () => {
  it("redacts sensitive fields recursively", () => {
    expect(
      redactSensitive({
        authorization: "Bearer fake-token",
        nested: { secretValue: "demo-api-key-value" },
        safe: "request-123"
      })
    ).toEqual({
      authorization: "[REDACTED]",
      nested: { secretValue: "[REDACTED]" },
      safe: "request-123"
    });
  });
});
