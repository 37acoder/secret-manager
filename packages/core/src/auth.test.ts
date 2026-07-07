import { describe, expect, it } from "vitest";
import { createSessionToken, hashPassword, sessionExpiresAt, verifyPassword } from "./auth.js";

describe("password hashing", () => {
  it("hashes with argon2id and verifies valid passwords", async () => {
    const passwordHash = await hashPassword("correct horse battery staple");

    expect(passwordHash).toContain("$argon2id$");
    await expect(verifyPassword("correct horse battery staple", passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", passwordHash)).resolves.toBe(false);
  });

  it("rejects short passwords", async () => {
    await expect(hashPassword("short")).rejects.toThrow("at least 8 characters");
  });
});

describe("sessions", () => {
  it("creates high entropy base64url tokens and expiration dates", () => {
    const token = createSessionToken();
    const expiresAt = sessionExpiresAt(new Date("2026-07-06T00:00:00.000Z"), 1000);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(expiresAt.toISOString()).toBe("2026-07-06T00:00:01.000Z");
  });
});
