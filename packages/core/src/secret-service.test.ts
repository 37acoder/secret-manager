import { describe, expect, it, vi } from "vitest";
import { createEnvelopeCrypto, generateMasterKey } from "@secret-manager/crypto";
import { InMemoryAuditSink } from "./audit.js";
import { InMemorySecretRepository, SecretService } from "./secret-service.js";

describe("SecretService", () => {
  it("stores only encrypted version fields and decrypts only on reveal", async () => {
    const crypto = createEnvelopeCrypto(generateMasterKey("v1"));
    const decryptSpy = vi.spyOn(crypto, "decrypt");
    const repository = new InMemorySecretRepository();
    const audit = new InMemoryAuditSink();
    const service = new SecretService(repository, crypto, audit);

    const created = await service.createSecret(
      { accountId: "acct_1", userId: "user_1", requestId: "req_1" },
      { vaultId: "vault_1", key: "OPENAI_API_KEY", value: "demo-secret-value" }
    );

    expect(created).toMatchObject({
      key: "OPENAI_API_KEY",
      maskedValue: "********",
      currentVersionNumber: 1
    });
    expect(decryptSpy).not.toHaveBeenCalled();

    const storedVersion = await repository.findCurrentVersion(created.id);
    expect(storedVersion).toMatchObject({
      ciphertext: expect.any(String),
      nonce: expect.any(String),
      encryptedDek: expect.any(String),
      encryptionKeyVersion: "v1"
    });
    expect(JSON.stringify(storedVersion)).not.toContain("demo-secret-value");

    const revealed = await service.revealSecret(
      { accountId: "acct_1", userId: "user_1", requestId: "req_2" },
      created.id
    );

    expect(decryptSpy).toHaveBeenCalledTimes(1);
    expect(revealed.value).toBe("demo-secret-value");
    expect(audit.events.map((event) => event.action)).toEqual(["secret.create", "secret.reveal"]);
  });

  it("creates a new encrypted version on update", async () => {
    const crypto = createEnvelopeCrypto(generateMasterKey("v1"));
    const repository = new InMemorySecretRepository();
    const service = new SecretService(repository, crypto, new InMemoryAuditSink());
    const actor = { accountId: "acct_1", userId: "user_1" };

    const created = await service.createSecret(actor, {
      vaultId: "vault_1",
      key: "STRIPE_TOKEN",
      value: "old-demo-token"
    });
    const updated = await service.updateSecret(actor, {
      secretId: created.id,
      value: "new-demo-token"
    });

    expect(updated.currentVersionNumber).toBe(2);
    expect(repository.versions.get(created.id)).toHaveLength(2);
    expect(await service.revealSecret(actor, created.id)).toMatchObject({ value: "new-demo-token" });
  });

  it("redacts audit metadata before storage", async () => {
    const sink = new InMemoryAuditSink();

    await sink.write({
      accountId: "acct_1",
      actorUserId: "user_1",
      action: "secret.create",
      targetType: "secret",
      targetId: "secret_1",
      outcome: "success",
      metadata: { value: "plain", authorization: "Bearer plain", key: "VISIBLE_KEY" }
    });

    expect(sink.events[0]?.metadata).toEqual({
      value: "[REDACTED]",
      authorization: "[REDACTED]",
      key: "VISIBLE_KEY"
    });
  });
});
