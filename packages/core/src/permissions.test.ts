import { describe, expect, it } from "vitest";
import { canTokenAccessVault, canUserAccessVault, requireTokenScope, requireVaultGrant } from "./permissions.js";

describe("vault grant permissions", () => {
  it("allows owners to read, write, manage vaults, and manage tokens", () => {
    const grant = { vaultId: "vault_1", userId: "user_1", role: "owner" as const };

    expect(canUserAccessVault(grant, "read_secret")).toBe(true);
    expect(canUserAccessVault(grant, "write_secret")).toBe(true);
    expect(canUserAccessVault(grant, "manage_vault")).toBe(true);
    expect(canUserAccessVault(grant, "manage_tokens")).toBe(true);
  });

  it("allows editors to read and write but not administer", () => {
    const grant = { vaultId: "vault_1", userId: "user_1", role: "editor" as const };

    expect(canUserAccessVault(grant, "read_secret")).toBe(true);
    expect(canUserAccessVault(grant, "write_secret")).toBe(true);
    expect(canUserAccessVault(grant, "manage_vault")).toBe(false);
    expect(canUserAccessVault(grant, "manage_tokens")).toBe(false);
  });

  it("allows viewers to read only", () => {
    const grant = { vaultId: "vault_1", userId: "user_1", role: "viewer" as const };

    expect(canUserAccessVault(grant, "read_secret")).toBe(true);
    expect(canUserAccessVault(grant, "write_secret")).toBe(false);
    expect(canUserAccessVault(grant, "manage_vault")).toBe(false);
    expect(canUserAccessVault(grant, "manage_tokens")).toBe(false);
  });

  it("throws from the require helper when access is missing", () => {
    expect(() => requireVaultGrant(null, "read_secret")).toThrow("Forbidden");
  });
});

describe("api token scope permissions", () => {
  it("allows read scoped tokens to read only in their vault", () => {
    const token = { accountId: "acct_1", vaultId: "vault_1", scopes: ["read_secrets" as const] };

    expect(canTokenAccessVault(token, "vault_1", "read_secret")).toBe(true);
    expect(canTokenAccessVault(token, "vault_1", "write_secret")).toBe(false);
    expect(canTokenAccessVault(token, "vault_2", "read_secret")).toBe(false);
  });

  it("allows write scoped tokens to read and write but not manage tokens", () => {
    const token = { accountId: "acct_1", vaultId: "vault_1", scopes: ["write_secrets" as const] };

    expect(canTokenAccessVault(token, "vault_1", "read_secret")).toBe(true);
    expect(canTokenAccessVault(token, "vault_1", "write_secret")).toBe(true);
    expect(canTokenAccessVault(token, "vault_1", "manage_tokens")).toBe(false);
  });

  it("allows manage token scope only for token management", () => {
    const token = { accountId: "acct_1", vaultId: null, scopes: ["manage_tokens" as const] };

    expect(canTokenAccessVault(token, "vault_1", "manage_tokens")).toBe(true);
    expect(canTokenAccessVault(token, "vault_1", "read_secret")).toBe(false);
  });

  it("denies revoked and expired tokens", () => {
    const now = new Date("2026-07-06T00:00:00.000Z");

    expect(
      canTokenAccessVault(
        { accountId: "acct_1", vaultId: "vault_1", scopes: ["read_secrets"], revokedAt: now },
        "vault_1",
        "read_secret",
        now
      )
    ).toBe(false);
    expect(
      canTokenAccessVault(
        { accountId: "acct_1", vaultId: "vault_1", scopes: ["read_secrets"], expiresAt: now },
        "vault_1",
        "read_secret",
        now
      )
    ).toBe(false);
  });

  it("throws from the require helper when scope is missing", () => {
    expect(() =>
      requireTokenScope({ accountId: "acct_1", vaultId: "vault_1", scopes: ["read_secrets"] }, "vault_1", "write_secret")
    ).toThrow("Forbidden");
  });
});
