import { PrismaClient } from "@prisma/client";
import type { KeyVersion } from "@secret-manager/crypto";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export type { PrismaClient };

export interface SecretRecord {
  id: string;
  vaultId: string;
  key: string;
  description?: string | undefined;
  currentVersionId: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface SecretVersionRecord {
  id: string;
  secretId: string;
  versionNumber: number;
  ciphertext: string;
  nonce: string;
  encryptedDek: string;
  encryptionKeyVersion: KeyVersion;
  createdByUserId: string;
  createdAt: Date;
}
