import { expect, type Page, test } from "@playwright/test";

async function expectAuditAction(page: Page, action: string) {
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/audit-events");
      const body = await response.json();
      return body.auditEvents?.some((event: { action: string }) => event.action === action) ?? false;
    })
    .toBe(true);
}

async function login(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByText("Signed in to the demo workspace.")).toBeVisible({ timeout: 15_000 });
  if (await page.getByLabel("Vault password").isVisible().catch(() => false)) {
    await page.getByLabel("Vault password").fill("demo123");
    await page.getByRole("button", { name: "Unlock vault" }).click();
    await expect(page.getByText("Vault Production unlocked for this session.")).toBeVisible();
  }
}

async function createVault(page: Page, name: string, environment: string) {
  await page.getByLabel("New vault").click();
  await page.getByLabel("New vault name").fill(name);
  await page.getByLabel("New vault environment").fill(environment);
  await page.getByLabel("New vault password").fill("demo123");
  await page.getByRole("dialog", { name: "Focused edit drawer" }).getByRole("button", { name: "Create Vault" }).click();
  await expect(page.getByText(`Vault ${name} created.`)).toBeVisible();
}

async function createSecret(page: Page, key: string, value: string, description: string) {
  await page.locator(".toolbar").getByRole("button", { name: "Add secret" }).click();
  await page.getByLabel("New secret key").fill(key);
  await page.getByLabel("New secret value").fill(value);
  await page.getByLabel("New secret description").fill(description);
  await page.getByRole("dialog", { name: "Focused edit drawer" }).getByRole("button", { name: "Add secret" }).click();
  await expect(page.getByText(`Secret ${key} created with a masked default view.`)).toBeVisible();
}

test("workbench hides permanent forms while supporting secret create reveal copy rotate and delete", async ({ page }) => {
  await login(page);

  await expect(page.getByRole("table", { name: "Secrets" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add secret" })).toBeVisible();
  await expect(page.getByLabel("New secret key")).toHaveCount(0);

  await page.getByLabel("New project").click();
  await page.getByLabel("New project name").fill("QA Project");
  await page.getByLabel("New project description").fill("QA acceptance project");
  await page.getByRole("button", { name: "Create Project" }).click();
  await expect(page.getByText("Project QA Project created.")).toBeVisible();

  await createVault(page, "QA Demo Vault", "qa");
  await createSecret(page, "DEMO_SECRET", "super-sensitive-demo-value", "End-to-end demo secret");

  await expect(page.getByTestId("masked-DEMO_SECRET")).toBeVisible();
  await expect(page.getByText("super-sensitive-demo-value")).toHaveCount(0);

  await page.locator(".toolbar").getByRole("button", { name: "Add secret" }).click();
  await page.getByLabel("New secret key").fill("DEMO_SECRET");
  await expect(page.getByText("Duplicate secret key in this environment.")).toBeVisible();
  await page.getByLabel("Close drawer").click();

  await page.getByRole("row", { name: /DEMO_SECRET/ }).getByRole("button", { name: "Reveal" }).click();
  await expect(page.getByTestId("revealed-value")).toHaveText("super-sensitive-demo-value");
  await expectAuditAction(page, "secret.reveal");

  await page.getByRole("row", { name: /DEMO_SECRET/ }).getByRole("button", { name: "Copy" }).click();
  await expect(page.getByText(/Secret copied|Clipboard unavailable/)).toBeVisible();
  await expectAuditAction(page, "secret.copy");

  await page.getByRole("row", { name: /DEMO_SECRET/ }).getByRole("button", { name: "Rotate" }).click();
  await page.getByLabel("Rotated secret value").fill("rotated-sensitive-demo-value");
  await page.getByRole("dialog", { name: "Focused edit drawer" }).getByRole("button", { name: "Rotate secret" }).click();
  await expect(page.getByText("Secret rotated to version 2.")).toBeVisible();
  await expect(page.locator(".version-row").filter({ hasText: "v2" })).toBeVisible();
  await expectAuditAction(page, "secret.update");
  await expect(page.getByText("rotated-sensitive-demo-value")).toHaveCount(0);

  await page.getByRole("row", { name: /DEMO_SECRET/ }).getByRole("button", { name: "Rotate" }).click();
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
  await page.getByLabel("Delete confirmation key").fill("DEMO_SECRET");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Secret deleted and audit event recorded.")).toBeVisible();
  await expectAuditAction(page, "secret.delete");
});

test("import wizard export warning and trust states meet MVP safety acceptance", async ({ page }) => {
  await login(page);
  await createVault(page, "Transfer QA Vault", "qa-transfer");
  await createSecret(page, "STRIPE_API_KEY", "fake-existing-stripe", "Existing duplicate for import preview");

  await page.getByRole("button", { name: "Import .env" }).click();
  await page.getByLabel(".env import file").setInputFiles({
    name: ".env",
    mimeType: "text/plain",
    buffer: Buffer.from("DEMO_IMPORT_ALPHA=fake-alpha\nSTRIPE_API_KEY=fake-duplicate\nBROKEN LINE")
  });
  await expect(page.getByText("Loaded .env for preview.")).toBeVisible();
  await page.getByRole("button", { name: "Preview Import" }).click();
  await expect(page.getByTestId("import-preview")).toContainText("1 valid");
  await expect(page.getByTestId("import-preview")).toContainText("1 duplicate");
  await expect(page.getByTestId("import-preview")).toContainText("1 invalid");
  await expect(page.getByTestId("import-preview")).not.toContainText("fake-alpha");

  await page.getByRole("button", { name: "Apply Import" }).click();
  await expect(page.getByText("Import applied: 1 created, 0 updated, 1 skipped.")).toBeVisible();
  await page.getByLabel("Close transfer flow").click();
  await expect(page.getByRole("row", { name: /DEMO_IMPORT_ALPHA/ })).toBeVisible();
  await expectAuditAction(page, "secret.import");

  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByTestId("export-warning")).toContainText("Do not paste exported files into issues, chat, docs, screenshots, or demo recordings.");
  await page.getByRole("button", { name: "Export .env" }).click();
  await expect(page.getByText("Plaintext export requires explicit risk confirmation.")).toBeVisible();

  await page.getByLabel("Plaintext export exposes secret values").check();
  await page.getByRole("button", { name: "Export .env" }).click();
  await expect(page.getByTestId("export-result")).toContainText("Plaintext exports expose secret values");
  await expect(page.getByTestId("export-result")).toContainText("DEMO_IMPORT_ALPHA=fake-alpha");
  await expectAuditAction(page, "secret.export");

  await page.getByRole("button", { name: "Encrypted Backup" }).click();
  await expect(page.getByTestId("export-result")).toContainText("deferred");
  await expect(page.getByTestId("export-result")).toContainText("AHO-48");
  await page.getByLabel("Close transfer flow").click();

  await page.getByRole("row", { name: /STRIPE_API_KEY/ }).getByRole("button", { name: "Reveal" }).click();
  await expect(page.getByTestId("revealed-value")).toHaveText("fake-existing-stripe");
  await expectAuditAction(page, "secret.reveal");

  await page.getByLabel("Trust state").selectOption("screenshot-safe");
  await expect(page.getByText("Screenshot-safe: values remain masked and reveal output is hidden.")).toBeVisible();
  await expect(page.getByTestId("revealed-value")).toHaveText("Hidden until reveal");
  await expect(page.getByText("fake-existing-stripe")).toHaveCount(0);
  await expect(page.getByLabel("Vault context").getByRole("button", { name: "Reveal" })).toBeDisabled();
  await expect(page.getByLabel("Vault context").getByRole("button", { name: "Copy" })).toBeDisabled();

  await page.getByLabel("Trust state").selectOption("locked");
  await expect(page.getByTestId("locked-state")).toBeVisible();
  await expect(page.getByText("Vault is locked")).toBeVisible();
  await expect(page.locator(".toolbar").getByRole("button", { name: "Add secret" })).toBeDisabled();
  await expect(page.locator(".toolbar").getByRole("button", { name: "Import .env" })).toBeDisabled();

  await page.getByLabel("Trust state").selectOption("demo-safe");
  await expect(page.getByText("Demo-safe: fake provider keys and local sample data only.")).toBeVisible();
  await expect(page.locator(".toolbar").getByRole("button", { name: "Add secret" })).toBeEnabled();
});
