import { expect, test } from "@playwright/test";

test("閲覧・IME編集・Undo/Redo・保存後の差分と履歴", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByRole("heading", { name: "規則・決定", exact: true })
    .waitFor();
  await page
    .getByRole("link", { name: "コンピュータ研究会・WINC会則", exact: true })
    .click();
  await expect(page.locator("#art-member-duties")).toBeAttached();
  await expect(page.locator('[data-paragraph-number="1"]')).toHaveCount(0);
  await page.screenshot({
    path: "test-results/reader-desktop.png",
    fullPage: false,
  });
  await page.getByRole("link", { name: "編集する" }).click();
  const text = page.getByRole("textbox", {
    name: "第一条 第1項の本文",
    exact: true,
  });
  await text.waitFor();
  const original = await text.inputValue();
  await text.dispatchEvent("compositionstart");
  await text.fill(original + "改訂。");
  await text.dispatchEvent("compositionend");
  await expect(
    page.getByText("未保存の変更あり", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "元に戻す" }).click();
  await expect(text).toHaveValue(original);
  await page.getByRole("button", { name: "やり直す" }).click();
  await expect(text).toHaveValue(original + "改訂。");
  await page.getByRole("button", { name: "原本に保存" }).click();
  await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
  await expect(page.locator(".changes")).toContainText("改訂");
  await page.screenshot({
    path: "test-results/editor-desktop.png",
    fullPage: false,
  });
  await page.getByRole("button", { name: "新旧対照表", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "変更後", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "閲覧に戻る" }).click();
  await expect(page.locator("#art-name")).toContainText("改訂。");
  await page.getByRole("link", { name: "変更履歴", exact: true }).click();
  await expect(page.locator(".revision").nth(1)).toBeVisible();
  await page.locator(".revision").nth(1).click();
  await expect(page.locator(".historic-title")).toBeVisible();
  expect(errors).toEqual([]);
});

test("単一文字列の公示を新規作成・保存する", async ({ page }) => {
  await page.goto("/new/");
  await page.getByLabel("文書ID", { exact: true }).fill("test-notice");
  await page.getByLabel("題名", { exact: true }).fill("テスト公示");
  await page.getByLabel("種別", { exact: true }).selectOption("執行部公示");
  await page.getByRole("radio", { name: /単一の文字列/ }).check();
  await page.getByRole("button", { name: "本文の編集へ" }).click();
  await page
    .getByRole("textbox", { name: "本文", exact: true })
    .fill("公示の本文です。\n改行も保持します。");
  await page.getByRole("button", { name: "原本に保存" }).click();
  await expect(page).toHaveURL(/\/edit\/test-notice\//);
  await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "閲覧に戻る" }).click();
  await expect(page.locator(".plain-body")).toHaveText(
    "公示の本文です。\n改行も保持します。",
  );
});

test("狭い画面で本文と差分を切り替える", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/edit/constitution/");
  await page
    .getByRole("textbox", { name: "第一条 第1項の本文", exact: true })
    .waitFor();
  await page
    .locator(".editor-mobile-tabs")
    .getByRole("button", { name: "差分・検証", exact: true })
    .click();
  await expect(page.locator(".diff-panel")).toBeVisible();
  await expect(page.locator(".editor-main")).not.toBeVisible();
  await page.screenshot({
    path: "test-results/editor-mobile.png",
    fullPage: true,
  });
});

test("目次の表示操作とジャンプで履歴を動かさずに本文を移動できる", async ({
  page,
}) => {
  await page.goto("/laws/constitution/");
  const contents = page.getByRole("navigation", {
    name: "文書の目次",
    exact: true,
  });
  await contents
    .getByRole("button", { name: "第一章を非表示", exact: true })
    .click();
  await expect(page.locator("#ch-name")).not.toBeVisible();
  await contents
    .getByRole("button", { name: "第一章を表示", exact: true })
    .click();
  await expect(page.locator("#ch-name")).toBeVisible();
  await contents.getByRole("button", { name: "全非表示", exact: true }).click();
  await expect(page.locator("#art-name")).not.toBeVisible();
  await contents.getByRole("button", { name: "全表示", exact: true }).click();
  await contents
    .getByRole("link", { name: "第二十六条（会則の変更）", exact: true })
    .click();
  await expect(page).toHaveURL(/#art-amendment$/);
  await expect
    .poll(() => page.locator("#reader-scroll").evaluate((e) => e.scrollTop))
    .toBeGreaterThan(100);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(
    await page.locator(".revision-list").evaluate((e) => e.scrollTop),
  ).toBe(0);
  await page
    .getByRole("searchbox", { name: "文書内検索", exact: true })
    .fill("理事会");
  await expect(page.locator("mark.search-hit").first()).toBeAttached();
  await page.getByRole("button", { name: "次を検索", exact: true }).click();
  await page.screenshot({ path: "test-results/reader-navigation.png" });
});

test("条文比較に未変更の条文を残し、次の差分へ移動できる", async ({ page }) => {
  await page.goto("/edit/constitution/");
  const first = page.getByRole("textbox", {
    name: "第一条 第1項の本文",
    exact: true,
  });
  await first.waitFor();
  await first.fill((await first.inputValue()) + "比較テスト。");
  await page.getByRole("button", { name: "新旧対照表", exact: true }).click();
  const table = page.getByRole("table", { name: "新旧対照表", exact: true });
  await expect(table).toContainText("会員の義務");
  await expect(
    table.locator(".diff-highlight").filter({ hasText: "比較テスト" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "次の差分箇所", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement?.getAttribute("data-difference"),
      ),
    )
    .toBe("true");
  await page
    .getByRole("checkbox", { name: "変更箇所のみ", exact: true })
    .check();
  await expect(table).not.toContainText("会員の義務");
  await page.screenshot({ path: "test-results/editor-comparison.png" });
});

test("モバイルの目次から条文へ移動すると本文に戻る", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/laws/constitution/");
  await expect(page.locator(".reader-sidebar")).not.toBeVisible();
  await page.getByRole("button", { name: "履歴・目次", exact: true }).click();
  await expect(page.locator(".reader-sidebar")).toBeVisible();
  await page
    .getByRole("navigation", { name: "文書の目次", exact: true })
    .getByRole("link", { name: "第六条（会員の義務）", exact: true })
    .click();
  await expect(page.locator(".reader-sidebar")).not.toBeVisible();
  await expect(page.locator("#art-member-duties")).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/reader-mobile.png" });
});
