import { describe, expect, it } from "vitest";
import {
  InMemoryDeveloperApiStore,
  createDeveloperSecretApi,
  developerApiErrorCodes,
  hashApiToken,
  toDeveloperApiError
} from "./developer-api.js";

function setup(now = () => new Date("2026-07-06T00:00:00.000Z")) {
  const store = new InMemoryDeveloperApiStore();
  const api = createDeveloperSecretApi({ store, now });
  return { api, store };
}

describe("DeveloperSecretApi token boundary", () => {
  it("allows read tokens to read but not write", async () => {
    const { api, store } = setup();
    await store.upsertSecretVersion({ vaultId: "vault_1", key: "DEMO_KEY", value: "first" });
    const { token } = await api.createToken({
      vaultId: "vault_1",
      name: "reader",
      scopes: ["read_secrets"]
    });

    await expect(api.readSecret({ token, vaultId: "vault_1", key: "DEMO_KEY" })).resolves.toMatchObject({
      key: "DEMO_KEY",
      value: "first",
      versionNumber: 1
    });
    await expect(
      api.upsertSecret({ token, vaultId: "vault_1", key: "DEMO_KEY", value: "second" })
    ).rejects.toMatchObject({ code: developerApiErrorCodes.forbidden });
  });

  it("allows read tokens to list current secret values for explicit export", async () => {
    const { api, store } = setup();
    await store.upsertSecretVersion({ vaultId: "vault_1", key: "Z_KEY", value: "last" });
    await store.upsertSecretVersion({ vaultId: "vault_1", key: "A_KEY", value: "first" });
    await store.upsertSecretVersion({ vaultId: "vault_1", key: "A_KEY", value: "current" });
    const { token } = await api.createToken({
      vaultId: "vault_1",
      name: "reader",
      scopes: ["read_secrets"]
    });

    await expect(api.listSecrets({ token, vaultId: "vault_1" })).resolves.toEqual([
      expect.objectContaining({ key: "A_KEY", value: "current", versionNumber: 2 }),
      expect.objectContaining({ key: "Z_KEY", value: "last", versionNumber: 1 })
    ]);
  });

  it("allows write tokens to create new versions", async () => {
    const { api } = setup();
    const { token } = await api.createToken({
      vaultId: "vault_1",
      name: "writer",
      scopes: ["write_secrets"]
    });

    await expect(api.upsertSecret({ token, vaultId: "vault_1", key: "DEMO_KEY", value: "first" })).resolves.toMatchObject({
      key: "DEMO_KEY",
      versionNumber: 1,
      created: true
    });
    await expect(api.upsertSecret({ token, vaultId: "vault_1", key: "DEMO_KEY", value: "second" })).resolves.toMatchObject({
      key: "DEMO_KEY",
      versionNumber: 2,
      created: false
    });
  });

  it("rejects revoked and expired tokens", async () => {
    const { api } = setup();
    const active = await api.createToken({
      vaultId: "vault_1",
      name: "active",
      scopes: ["write_secrets"]
    });
    await api.revokeTokenHash(hashApiToken(active.token));
    await expect(
      api.upsertSecret({ token: active.token, vaultId: "vault_1", key: "A", value: "x" })
    ).rejects.toMatchObject({ code: developerApiErrorCodes.tokenRevoked });

    const expired = await api.createToken({
      vaultId: "vault_1",
      name: "expired",
      scopes: ["write_secrets"],
      expiresAt: "2026-07-05T23:59:59.000Z"
    });
    await expect(
      api.upsertSecret({ token: expired.token, vaultId: "vault_1", key: "B", value: "x" })
    ).rejects.toMatchObject({ code: developerApiErrorCodes.tokenExpired });
  });

  it("revokes tokens by public token id without requiring the raw token or hash", async () => {
    const { api } = setup();
    const { token, tokenRecord } = await api.createToken({
      vaultId: "vault_1",
      name: "writer",
      scopes: ["write_secrets"]
    });

    await expect(api.revokeTokenId(tokenRecord.id)).resolves.toBe(true);
    await expect(
      api.upsertSecret({ token, vaultId: "vault_1", key: "A", value: "x" })
    ).rejects.toMatchObject({ code: developerApiErrorCodes.tokenRevoked });
  });

  it("stores hash and prefix without retaining the raw token and updates lastUsedAt", async () => {
    const now = new Date("2026-07-06T00:00:00.000Z");
    const { api, store } = setup(() => now);
    await store.upsertSecretVersion({ vaultId: "vault_1", key: "DEMO_KEY", value: "first" });
    const { token, tokenRecord } = await api.createToken({
      vaultId: "vault_1",
      name: "reader",
      scopes: ["read_secrets"]
    });

    expect(tokenRecord).not.toHaveProperty("tokenHash");
    expect(tokenRecord.tokenPrefix).toBe(token.slice(0, 10));

    await api.readSecret({ token, vaultId: "vault_1", key: "DEMO_KEY" });
    const stored = await store.findTokenByHash(hashApiToken(token));

    expect(stored).toMatchObject({
      tokenPrefix: token.slice(0, 10),
      tokenHash: hashApiToken(token),
      lastUsedAt: now
    });
    expect(stored).not.toHaveProperty("token");
  });

  it("serializes failures as request id plus error code only", () => {
    const response = toDeveloperApiError("req_1", new Error("demo-secret-value"));

    expect(response).toEqual({
      status: 500,
      body: {
        requestId: "req_1",
        error: { code: "internal_error" }
      }
    });
    expect(JSON.stringify(response)).not.toContain("demo-secret-value");
  });
});
