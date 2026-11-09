import { expect, test } from "@playwright/test";

test("公開HTMLはJSなしで直接閲覧でき、編集APIを含まない", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(
    "http://127.0.0.1:3108/law/laws/constitution/#art-member-duties",
  );
  await expect(
    page.getByRole("heading", {
      name: "コンピュータ研究会・WINC会則",
      level: 1,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("#art-member-duties")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "編集する", exact: true }),
  ).toHaveCount(0);
  expect(await page.content()).not.toContain("X-Law-Token");
  await context.close();
});

test("公開ページのbase path・hydration・Git履歴が動く", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3108/law/laws/constitution/");
  await page.getByRole("link", { name: "変更履歴", exact: true }).click();
  await expect(page).toHaveURL(/\/law\/history\/constitution\//);
  const revisions = await page.evaluate(
    () => window.__LAW_DATA__.histories?.constitution ?? [],
  );
  await expect(page.locator(".revision")).toHaveCount(revisions.length + 1);
  if (revisions.length) {
    await page.locator(".revision").nth(1).click();
    await expect(page.locator(".historic-title")).toBeVisible();
    await page.getByRole("tab", { name: "条文比較", exact: true }).click();
    await expect(page.getByRole("table", { name: "新旧対照表" })).toBeVisible();
  } else {
    await expect(page.getByText("履歴なし", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "条文比較", exact: true }),
    ).toBeDisabled();
  }
  const body = revisions.length
    ? page.getByRole("table", { name: "新旧対照表" })
    : page.locator(".document-text");
  const contents = page.getByRole("navigation", {
    name: "文書の目次",
    exact: true,
  });
  await contents
    .getByRole("link", { name: "第二十六条（会則の変更）", exact: true })
    .click();
  await expect(page).toHaveURL(/#art-amendment$/);
  await expect
    .poll(() => page.locator("#reader-scroll").evaluate((e) => e.scrollTop))
    .toBeGreaterThan(100);
  await contents.getByRole("button", { name: "全非表示", exact: true }).click();
  if (revisions.length)
    await expect(body).not.toContainText("本会則を変更する場合");
  else await expect(page.locator("#art-amendment")).not.toBeVisible();
  await contents.getByRole("button", { name: "全表示", exact: true }).click();
  await expect(body).toContainText("本会則を変更する場合");
  if (!revisions.length)
    await expect(page.locator("#art-amendment")).toBeVisible();
  await page.reload();
  await expect(body).toBeVisible();
  expect(errors).toEqual([]);
});
