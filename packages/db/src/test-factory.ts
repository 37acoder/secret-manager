import type { ApiTokenScope, VaultGrantRole } from "../../core/src/permissions.js";

export type TestAccount = {
  id: string;
  name: string;
};

export type TestUser = {
  id: string;
  accountId: string;
  email: string;
};

export type TestVaultGrant = {
  vaultId: string;
  userId: string;
  role: VaultGrantRole;
};

export type TestApiToken = {
  id: string;
  accountId: string;
  vaultId: string | null;
  scopes: ApiTokenScope[];
  revokedAt: Date | null;
  expiresAt: Date | null;
};

export function makeTestAccount(overrides: Partial<TestAccount> = {}): TestAccount {
  return {
    id: "acct_test",
    name: "Test Account",
    ...overrides
  };
}

export function makeTestUser(overrides: Partial<TestUser> = {}): TestUser {
  return {
    id: "user_test",
    accountId: "acct_test",
    email: "owner@example.test",
    ...overrides
  };
}

export function makeTestVaultGrant(overrides: Partial<TestVaultGrant> = {}): TestVaultGrant {
  return {
    vaultId: "vault_test",
    userId: "user_test",
    role: "viewer",
    ...overrides
  };
}

export function makeTestApiToken(overrides: Partial<TestApiToken> = {}): TestApiToken {
  return {
    id: "token_test",
    accountId: "acct_test",
    vaultId: "vault_test",
    scopes: ["read_secrets"],
    revokedAt: null,
    expiresAt: null,
    ...overrides
  };
}
