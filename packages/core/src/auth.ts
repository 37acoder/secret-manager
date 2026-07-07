import { hash, verify } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

const ARGON2ID_OPTIONS = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32
} as const;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  return hash(password, ARGON2ID_OPTIONS);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return verify(passwordHash, password);
}

export function createSessionToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function sessionExpiresAt(now = new Date(), ttlMs = 1000 * 60 * 60 * 24 * 7): Date {
  return new Date(now.getTime() + ttlMs);
}
