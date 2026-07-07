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

async function unlockVault(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Production|保险库工作台/ })).toBeVisible();
  const entryState = await Promise.race([
    page.getByLabel(/Vault password|保险库密码/).waitFor({ state: "visible", timeout: 10_000 }).then(() => "locked" as const),
    page.getByRole("table", { name: /Secrets|密钥/ }).waitFor({ state: "visible", timeout: 10_000 }).then(() => "unlocked" as const)
  ]);
  if (entryState === "locked") {
    await page.getByLabel(/Vault password|保险库密码/).fill("demo123");
    await page.getByRole("button", { name: "解锁保险库" }).click();
    await expect(page.getByText(/保险库 .+ 已在当前浏览器会话中解锁。/)).toBeVisible();
  }
  await expect(page.getByRole("table", { name: /Secrets|密钥/ })).toBeVisible({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/demo/reset");
});

async function createVault(page: Page, name: string) {
  await page.getByLabel(/New vault|新建保险库/).click();
  await page.getByLabel(/New vault name|新保险库名称/).fill(name);
  await page.getByLabel(/New vault password|新保险库密码/).fill("demo123");
  await page.getByRole("dialog", { name: /Focused edit drawer|聚焦编辑抽屉/ }).getByRole("button", { name: "创建保险库" }).click();
  await expect(page.getByText(`保险库 ${name} 已创建。`)).toBeVisible();
}

async function createSecret(page: Page, key: string, value: string, description: string) {
  await page.locator(".toolbar").getByRole("button", { name: "新增密钥" }).click();
  await page.getByLabel(/New secret key|新密钥名/).fill(key);
  await page.getByLabel(/New secret value|新密钥值/).fill(value);
  await page.getByLabel(/New secret description|新密钥描述/).fill(description);
  await page.getByRole("dialog", { name: /Focused edit drawer|聚焦编辑抽屉/ }).getByRole("button", { name: "新增密钥" }).click();
  await expect(page.getByText(`密钥 ${key} 已创建，默认以脱敏值显示。`)).toBeVisible();
}

test("workbench hides permanent forms while supporting secret create reveal copy rotate and delete", async ({ page }) => {
  await unlockVault(page);

  await expect(page.getByRole("table", { name: /Secrets|密钥/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "新增密钥" })).toBeVisible();
  await expect(page.getByLabel(/New secret key|新密钥名/)).toHaveCount(0);

  await createVault(page, "QA Demo Vault");
  await createSecret(page, "DEMO_SECRET", "super-sensitive-demo-value", "End-to-end demo secret");

  await expect(page.getByTestId("masked-DEMO_SECRET")).toBeVisible();
  await expect(page.getByText("super-sensitive-demo-value")).toHaveCount(0);

  await page.locator(".toolbar").getByRole("button", { name: "新增密钥" }).click();
  await page.getByLabel(/New secret key|新密钥名/).fill("DEMO_SECRET");
  await expect(page.getByText("当前保险库已有同名密钥。")).toBeVisible();
  await page.getByLabel(/Close drawer|关闭抽屉/).click();

  await page.getByRole("row", { name: /DEMO_SECRET/ }).getByRole("button", { name: "显示明文" }).click();
  await expect(page.getByTestId("masked-DEMO_SECRET")).toHaveText("super-sensitive-demo-value");
  await expectAuditAction(page, "secret.reveal");

  await page.getByRole("row", { name: /DEMO_SECRET/ }).getByRole("button", { name: "复制" }).click();
  await expectAuditAction(page, "secret.copy");

  await page.getByRole("row", { name: /DEMO_SECRET/ }).getByRole("button", { name: "轮换" }).click();
  await page.getByLabel(/Rotated secret value|轮换后的密钥值/).fill("rotated-sensitive-demo-value");
  await page.getByRole("dialog", { name: /Focused edit drawer|聚焦编辑抽屉/ }).getByRole("button", { name: "轮换密钥" }).click();
  await expect(page.getByText("密钥已轮换到版本 2。")).toBeVisible();
  await page.getByRole("row", { name: /DEMO_SECRET/ }).getByRole("button", { name: "DEMO_SECRET" }).click();
  await expect(page.locator(".version-row").filter({ hasText: "v2" })).toBeVisible();
  await page.getByLabel(/Close drawer|关闭抽屉/).click();
  await expectAuditAction(page, "secret.update");
  await expect(page.getByText("rotated-sensitive-demo-value")).toHaveCount(0);

  await page.getByRole("row", { name: /DEMO_SECRET/ }).getByRole("button", { name: "轮换" }).click();
  await expect(page.getByRole("dialog", { name: /Focused edit drawer|聚焦编辑抽屉/ }).getByRole("button", { name: "删除", exact: true })).toHaveCount(0);
  await page.getByLabel(/Close drawer|关闭抽屉/).click();

  await page.getByRole("row", { name: /DEMO_SECRET/ }).getByRole("button", { name: "删除" }).click();
  await page.getByLabel(/Delete confirmation key|删除确认密钥名/).fill("DEMO_SECRET");
  await page.getByRole("dialog", { name: /Focused edit drawer|聚焦编辑抽屉/ }).getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByText("密钥已删除，并已写入审计记录。")).toBeVisible();
  await expectAuditAction(page, "secret.delete");
});

test("Chinese labels tooltips remove demo controls and selected detail avoids duplicated table fields", async ({ page }) => {
  await unlockVault(page);

  await expect(page.getByRole("button", { name: "新增密钥" })).toBeVisible();
  await expect(page.getByLabel("保险库状态")).toBeVisible();
  await expect(page.getByRole("button", { name: "重置演示数据" })).toHaveCount(0);
  await expect(page.getByLabel(/演示状态 Trust state/)).toHaveCount(0);

  await page.getByRole("button", { name: /保险库 Vaults 说明/ }).hover();
  await expect(page.getByRole("tooltip", { name: /加密保存密钥的容器/ })).toBeVisible();

  await page.getByRole("button", { name: /脱敏值 Masked value 说明/ }).focus();
  await expect(page.getByRole("tooltip", { name: /默认隐藏真实值/ })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /操作状态 说明/ }).click();
  await expect(page.getByRole("tooltip", { name: /是否可执行显示、复制、导入和导出/ })).toBeVisible();

  await expect(page.getByRole("dialog", { name: /聚焦编辑抽屉|Focused edit drawer/ })).toHaveCount(0);
  await page.getByRole("row", { name: /STRIPE_API_KEY/ }).getByRole("button", { name: "STRIPE_API_KEY" }).click();
  const detailDrawer = page.getByLabel("密钥详情、版本审计与操作日志");
  await expect(detailDrawer).toBeVisible();
  await expect(detailDrawer.getByRole("button", { name: /复制|显示明文|轮换|删除/ })).toHaveCount(0);
  await page.getByLabel(/Close drawer|关闭抽屉/).click();
});

test("reveal and copy do not shift the workbench vertically", async ({ page }) => {
  await unlockVault(page);
  const table = page.getByRole("table", { name: /Secrets|密钥/ });
  const beforeReveal = await table.boundingBox();

  await page.getByRole("row", { name: /STRIPE_API_KEY/ }).getByRole("button", { name: "显示明文" }).click();
  await expect(page.getByTestId("masked-STRIPE_API_KEY")).not.toHaveText("显示明文后在此处短暂查看");
  const afterReveal = await table.boundingBox();
  expect(Math.abs((afterReveal?.y ?? 0) - (beforeReveal?.y ?? 0))).toBeLessThanOrEqual(1);

  await page.getByRole("row", { name: /STRIPE_API_KEY/ }).getByRole("button", { name: "复制" }).click();
  await expectAuditAction(page, "secret.copy");
  const afterCopy = await table.boundingBox();
  expect(Math.abs((afterCopy?.y ?? 0) - (afterReveal?.y ?? 0))).toBeLessThanOrEqual(1);
});

test("import wizard export warning and trust states meet MVP safety acceptance", async ({ page }) => {
  await unlockVault(page);
  await createVault(page, "Transfer QA Vault");
  await createSecret(page, "STRIPE_API_KEY", "fake-existing-stripe", "Existing duplicate for import preview");

  await page.getByRole("button", { name: "导入 .env" }).click();
  await page.getByLabel(/.env import file|.env 导入文件/).setInputFiles({
    name: ".env",
    mimeType: "text/plain",
    buffer: Buffer.from("DEMO_IMPORT_ALPHA=fake-alpha\nSTRIPE_API_KEY=fake-duplicate\nBROKEN LINE")
  });
  await expect(page.getByText("已加载 .env，可进行预览。")).toBeVisible();
  await page.getByRole("button", { name: "预览导入" }).click();
  await expect(page.getByTestId("import-preview")).toContainText("1 有效");
  await expect(page.getByTestId("import-preview")).toContainText("1 重复");
  await expect(page.getByTestId("import-preview")).toContainText("1 无效");
  await expect(page.getByTestId("import-preview")).not.toContainText("fake-alpha");

  await page.getByRole("button", { name: "应用导入" }).click();
  await expect(page.getByText("导入已应用：新增 1，更新 0，跳过 1。")).toBeVisible();
  await page.getByLabel(/Close transfer flow|关闭导入导出流程/).click();
  await expect(page.getByRole("row", { name: /DEMO_IMPORT_ALPHA/ })).toBeVisible();
  await expectAuditAction(page, "secret.import");

  await page.getByRole("button", { name: "导出" }).click();
  await expect(page.getByTestId("export-warning")).toContainText("不要把导出文件粘贴到任务、聊天、文档、截图或演示录屏中。");
  await page.getByRole("button", { name: "导出 .env" }).click();
  await expect(page.getByText("Plaintext export requires explicit risk confirmation.")).toBeVisible();

  await page.getByLabel("明文导出会暴露密钥值").check();
  await page.getByRole("button", { name: "导出 .env" }).click();
  await expect(page.getByTestId("export-result")).toContainText("Plaintext exports expose secret values");
  await expect(page.getByTestId("export-result")).toContainText("明文文件已准备好，默认隐藏行内内容。");
  await expect(page.getByTestId("export-result")).not.toContainText("DEMO_IMPORT_ALPHA=fake-alpha");
  await page.getByTestId("export-result").getByRole("button", { name: "显示明文" }).click();
  await expect(page.getByTestId("export-result")).toContainText("DEMO_IMPORT_ALPHA=fake-alpha");
  await page.getByTestId("export-result").getByRole("button", { name: "隐藏明文" }).click();
  await expect(page.getByTestId("export-result")).not.toContainText("DEMO_IMPORT_ALPHA=fake-alpha");
  await expectAuditAction(page, "secret.export");

  await page.getByRole("button", { name: "加密备份" }).click();
  await expect(page.getByTestId("export-result")).toContainText("deferred");
  await expect(page.getByTestId("export-result")).toContainText("AHO-48");
  await page.getByLabel(/Close transfer flow|关闭导入导出流程/).click();

  await page.getByRole("row", { name: /STRIPE_API_KEY/ }).getByRole("button", { name: "显示明文" }).click();
  await expect(page.getByTestId("masked-STRIPE_API_KEY")).toHaveText("fake-existing-stripe");
  await expectAuditAction(page, "secret.reveal");

  await expect(page.getByRole("dialog", { name: /聚焦编辑抽屉|Focused edit drawer/ })).toHaveCount(0);
  await page.getByRole("row", { name: /STRIPE_API_KEY/ }).getByRole("button", { name: "STRIPE_API_KEY" }).click();
  await expect(page.getByLabel("密钥详情、版本审计与操作日志").getByRole("button", { name: "显示明文" })).toHaveCount(0);
  await expect(page.getByLabel("密钥详情、版本审计与操作日志").getByRole("button", { name: "复制" })).toHaveCount(0);
  await page.getByLabel(/Close drawer|关闭抽屉/).click();

  await page.getByRole("button", { name: "锁定保险库" }).click();
  await expect(page.getByTestId("locked-state")).toBeVisible();
  await expect(page.getByText("保险库已锁定")).toBeVisible();
  await expect(page.getByLabel(/保险库导航|Vault navigation/).getByText(/2 个密钥 \/ 已锁定/i)).toBeVisible();
  await expect(page.getByLabel("保险库状态").locator(".status-pill.danger", { hasText: "已锁定 Locked" })).toBeVisible();
  await expect(page.locator(".toolbar").getByRole("button", { name: "新增密钥" })).toBeDisabled();
  await expect(page.locator(".toolbar").getByRole("button", { name: "导入 .env" })).toBeDisabled();
  await expect(page.locator(".toolbar").getByRole("button", { name: "导出" })).toBeDisabled();

  await page.getByLabel(/Vault password|保险库密码/).fill("demo123");
  await page.getByRole("button", { name: "解锁保险库" }).click();
  await expect(page.locator(".toolbar").getByRole("button", { name: "新增密钥" })).toBeEnabled();
});

test("fresh demo reset and session reload keep the unlocked vault usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel(/保险库导航|Vault navigation/).getByRole("button", { name: /Demo Workspace/ })).toHaveCount(0);
  await expect(page.getByText("QA Project")).toHaveCount(0);
  await expect(page.getByTestId("locked-state")).toBeVisible();
  await expect(page.getByRole("table", { name: /Secrets|密钥/ })).toHaveCount(0);
  await expect(page.locator(".toolbar").getByRole("button", { name: "新增密钥" })).toBeDisabled();
  await expect(page.locator(".toolbar").getByRole("button", { name: "导入 .env" })).toBeDisabled();
  await expect(page.locator(".toolbar").getByRole("button", { name: "导出" })).toBeDisabled();

  await unlockVault(page);
  await expect(page.getByRole("table", { name: /Secrets|密钥/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("table", { name: /Secrets|密钥/ })).toBeVisible();
  await expect(page.getByLabel(/保险库导航|Vault navigation/).getByText(/1 个密钥 \/ 已解锁/i)).toBeVisible();
  await expect(page.locator(".toolbar").getByRole("button", { name: "新增密钥" })).toBeEnabled();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("table", { name: /Secrets|密钥/ })).toBeVisible();
  await expect(page.getByLabel("保险库状态")).toBeVisible();
  await expect(page.locator(".toolbar").getByRole("button", { name: "新增密钥" })).toBeInViewport();
  const authPanelTop = await page.getByRole("table", { name: /Secrets|密钥/ }).boundingBox();
  const sidebarTop = await page.getByLabel(/保险库导航|Vault navigation/).boundingBox();
  expect(authPanelTop?.y ?? 9999).toBeLessThan(sidebarTop?.y ?? 0);
  await expect(page.locator(".toolbar").getByRole("button", { name: "新增密钥" })).toBeEnabled();
});

test("core workbench contains horizontal overflow inside components, not the page shell", async ({ page }) => {
  await unlockVault(page);

  for (const size of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(size);
    await expect(page.getByRole("table", { name: /Secrets|密钥/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
});
