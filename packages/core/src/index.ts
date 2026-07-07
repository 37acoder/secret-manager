export type VaultRole = "owner" | "editor" | "viewer";
export type ApiTokenScope = "read_secrets" | "write_secrets" | "manage_tokens";
export type SecretContentType = "text" | "json" | "env";
export type AuditAction =
  | "login"
  | "create_secret"
  | "update_secret"
  | "delete_secret"
  | "reveal_secret"
  | "copy_secret"
  | "create_token"
  | "revoke_token"
  | "grant_access"
  | "revoke_access";

export type SecretMetadata = {
  id: string;
  vaultId: string;
  key: string;
  description?: string;
  currentVersionId: string;
  maskedValue: "••••••••";
};

export type SecretVersionDraft = {
  key: string;
  value: string;
  contentType: SecretContentType;
  description?: string;
};

export function validateSecretDraft(draft: SecretVersionDraft): string[] {
  const errors: string[] = [];
  if (!/^[A-Z0-9_./:-]{2,120}$/.test(draft.key)) {
    errors.push("Secret key must be 2-120 characters and use safe identifier characters.");
  }

  if (Buffer.byteLength(draft.value, "utf8") > 64 * 1024) {
    errors.push("Secret value must be 64KB or smaller.");
  }

  return errors;
}

export function canRevealSecret(role: VaultRole | null): boolean {
  return role === "owner" || role === "editor" || role === "viewer";
}

export function canWriteSecret(role: VaultRole | null): boolean {
  return role === "owner" || role === "editor";
}

export function tokenCanRead(scopes: ApiTokenScope[]): boolean {
  return scopes.includes("read_secrets");
}

export function tokenCanWrite(scopes: ApiTokenScope[]): boolean {
  return scopes.includes("write_secrets");
}

export function maskSecretValue(): SecretMetadata["maskedValue"] {
  return "••••••••";
}

export * from "./audit.js";
export * from "./developer-api.js";
export * from "./secret-service.js";
