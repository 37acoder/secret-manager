import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("Prisma-backed secret service storage", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "secret-manager-prisma-"));
  const dbPath = join(tempDir, "runtime.sqlite");

  let prisma: import("@secret-manager/db").PrismaClient;
  let serviceModule: typeof import("./secret-service");

  beforeAll(async () => {
    process.env.SECRET_MANAGER_STORAGE = "prisma";
    process.env.DATABASE_URL = `file:${dbPath}`;

    const { db } = await import("@secret-manager/db");
    prisma = db;
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RuntimeState" (
        "key" TEXT NOT NULL PRIMARY KEY,
        "value" TEXT NOT NULL,
        "updatedAt" DATETIME NOT NULL
      )
    `);
    await prisma.runtimeState.deleteMany();

    serviceModule = await import("./secret-service");
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists encrypted state through Prisma without plaintext or transient unlock material", async () => {
    const { secretService } = serviceModule;
    const actor = "qa@example.test";
    const project = await secretService.createProject({ name: "Connector QA", description: "Prisma path" }, actor);
    const vault = await secretService.createVault(
      project.id,
      { name: "Connector Vault", environment: "qa", password: "demo123" },
      actor
    );

    const secret = await secretService.createSecret(
      vault.id,
      { key: "CONNECTOR_SECRET", value: "fake-connector-secret-value", description: "connector test" },
      actor
    );

    const row = await prisma.runtimeState.findUnique({ where: { key: "secret-manager-state" } });
    expect(row).not.toBeNull();
    expect(row?.value).not.toContain("fake-connector-secret-value");
    expect(row?.value).not.toContain("demo123");
    expect(row?.value).not.toContain("unlockedKey");
    expect(row?.value).not.toContain("temporaryTokens");

    const persisted = JSON.parse(row?.value ?? "{}") as {
      secrets: Array<{
        id: string;
        versions: Array<{ encrypted: { ciphertext: string; nonce: string; authTag: string } }>;
      }>;
      vaults: Array<{ id: string; locked: boolean }>;
    };
    const persistedSecret = persisted.secrets.find((item) => item.id === secret.id);
    const persistedVault = persisted.vaults.find((item) => item.id === vault.id);

    expect(persistedSecret?.versions[0]?.encrypted).toEqual({
      ciphertext: expect.any(String),
      nonce: expect.any(String),
      authTag: expect.any(String)
    });
    expect(persistedVault?.locked).toBe(true);
  });
});
