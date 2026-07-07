export type VaultGrantRole = "owner" | "editor" | "viewer";
export type ApiTokenScope = "read_secrets" | "write_secrets" | "manage_tokens";

export type VaultGrant = {
  vaultId: string;
  userId: string;
  role: VaultGrantRole;
};

export type ApiTokenPrincipal = {
  accountId: string;
  vaultId: string | null;
  scopes: ApiTokenScope[];
  revokedAt?: Date | null;
  expiresAt?: Date | null;
};

export type VaultAction = "read_secret" | "write_secret" | "manage_vault" | "manage_tokens";

const grantPermissions: Record<VaultGrantRole, ReadonlySet<VaultAction>> = {
  owner: new Set(["read_secret", "write_secret", "manage_vault", "manage_tokens"]),
  editor: new Set(["read_secret", "write_secret"]),
  viewer: new Set(["read_secret"])
};

const scopePermissions: Record<ApiTokenScope, ReadonlySet<VaultAction>> = {
  read_secrets: new Set(["read_secret"]),
  write_secrets: new Set(["read_secret", "write_secret"]),
  manage_tokens: new Set(["manage_tokens"])
};

export function canUserAccessVault(grant: VaultGrant | null | undefined, action: VaultAction): boolean {
  if (!grant) {
    return false;
  }

  return grantPermissions[grant.role].has(action);
}

export function canTokenAccessVault(
  token: ApiTokenPrincipal | null | undefined,
  vaultId: string,
  action: VaultAction,
  now = new Date()
): boolean {
  if (!token || token.revokedAt || (token.expiresAt && token.expiresAt <= now)) {
    return false;
  }

  if (token.vaultId !== null && token.vaultId !== vaultId) {
    return false;
  }

  return token.scopes.some((scope) => scopePermissions[scope].has(action));
}

export function requireVaultGrant(grant: VaultGrant | null | undefined, action: VaultAction): void {
  if (!canUserAccessVault(grant, action)) {
    throw new Error("Forbidden");
  }
}

export function requireTokenScope(token: ApiTokenPrincipal | null | undefined, vaultId: string, action: VaultAction): void {
  if (!canTokenAccessVault(token, vaultId, action)) {
    throw new Error("Forbidden");
  }
}
