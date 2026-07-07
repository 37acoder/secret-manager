import { describe, expect, it } from "vitest";
import { createEnvelopeCrypto, generateMasterKey } from "./index.js";

describe("envelope crypto", () => {
  it("roundtrips encrypted values", () => {
    const crypto = createEnvelopeCrypto(generateMasterKey("v1"));

    const encrypted = crypto.encrypt("demo-secret-value");

    expect(encrypted.ciphertext).not.toContain("demo-secret-value");
    expect(crypto.decrypt(encrypted)).toBe("demo-secret-value");
  });

  it("fails decrypt with the wrong master key", () => {
    const encrypted = createEnvelopeCrypto(generateMasterKey("v1")).encrypt("demo-secret-value");
    const wrongCrypto = createEnvelopeCrypto(generateMasterKey("v1"));

    expect(() => wrongCrypto.decrypt(encrypted)).toThrow(/decrypt/i);
  });

  it("does not reuse nonces for repeated encryptions", () => {
    const crypto = createEnvelopeCrypto(generateMasterKey("v1"));

    const nonces = new Set(Array.from({ length: 50 }, () => crypto.encrypt("same-value").nonce));

    expect(nonces.size).toBe(50);
  });
});
