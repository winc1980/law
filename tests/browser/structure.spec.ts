import { expect, test } from "@playwright/test";

test("条・項・号をボタンで追加・削除し、Undoと保存に反映する", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/edit/constitution/");
  const first = page.locator("#art-name");
  await first
    .getByRole("textbox", { name: "第一条 第1項の本文", exact: true })
    .click();
  await first
    .getByRole("button", { name: "次に条を追加", exact: true })
    .click();

  const added = page.locator(".law-article").filter({
    has: page.getByRole("textbox", {
      name: "新しい条 第1項の本文",
      exact: true,
    }),
  });
  await expect(added).toBeVisible();
  await added
    .getByRole("textbox", { name: "新しい条 第1項の本文", exact: true })
    .fill("追加条の本文。");
  await added
    .getByRole("textbox", { name: "新しい条の名称", exact: true })
    .fill("第一条の二");
  const article = page.locator(".law-article").filter({
    has: page.getByRole("textbox", {
      name: "第一条の二 第1項の本文",
      exact: true,
    }),
  });
  await article
    .getByRole("button", { name: "＋ 項を追加", exact: true })
    .click();
  const second = article.locator(".paragraph-block").nth(1);
  await second
    .getByRole("textbox", { name: "第一条の二 第2項の本文", exact: true })
    .fill("追加項の本文。");
  await second.getByRole("button", { name: "号を追加", exact: true }).click();
  const item = second.getByRole("textbox", {
    name: "第一条の二 第2項 第1号",
    exact: true,
  });
  await item.fill("追加号の本文。");
  await second.getByRole("button", { name: "号を削除", exact: true }).click();
  await expect(item).toHaveCount(0);
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(item).toHaveValue("追加号の本文。");
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(item).toHaveCount(0);

  await second
    .getByRole("textbox", { name: "第一条の二 第2項の本文", exact: true })
    .click();
  await second.getByRole("button", { name: "項を削除", exact: true }).click();
  await expect(article.locator(".paragraph-block")).toHaveCount(1);
  await article
    .getByRole("textbox", { name: "第一条の二 第1項の本文", exact: true })
    .click();
  await article.getByRole("button", { name: "条を削除", exact: true }).click();
  await expect(article).toHaveCount(0);
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(article).toBeVisible();

  // 既存の条・項も削除でき、保存後の原本と差分に反映される。
  const originalSecond = first.locator(".paragraph-block").nth(1);
  const thirdText = await first
    .getByRole("textbox", { name: "第一条 第3項の本文", exact: true })
    .inputValue();
  await originalSecond.getByRole("textbox").click();
  await originalSecond
    .getByRole("button", { name: "項を削除", exact: true })
    .click();
  await expect(
    first.getByRole("textbox", { name: "第一条 第2項の本文", exact: true }),
  ).toHaveValue(thirdText);
  await expect(first.locator(".paragraph-block")).toHaveCount(2);
  const removedArticle = page.locator("#art-activities");
  await removedArticle
    .getByRole("textbox", { name: "第三条 第1項の本文", exact: true })
    .click();
  await removedArticle
    .getByRole("button", { name: "条を削除", exact: true })
    .click();
  await expect(removedArticle).toHaveCount(0);
  await expect(page.locator(".changes")).toContainText("削除");
  await page.getByRole("button", { name: "原本に保存", exact: true }).click();
  await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "第一条の二 第1項の本文", exact: true }),
  ).toHaveValue("追加条の本文。");
  await expect(page.locator("#art-name .paragraph-block")).toHaveCount(2);
  await expect(page.locator("#art-activities")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("フォーカスが外れても選択した条の操作欄を保持し、キーボードで追加できる", async ({
  page,
}) => {
  await page.goto("/edit/constitution/");
  const article = page.locator("#art-name");
  await article
    .getByRole("textbox", { name: "第一条 第1項の本文", exact: true })
    .click();
  await page.getByRole("heading", { level: 1 }).click();
  const add = article.getByRole("button", {
    name: "次に条を追加",
    exact: true,
  });
  await expect(add).toBeVisible();
  await add.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "新しい条 第1項の本文", exact: true }),
  ).toBeVisible();
});

test.describe("タッチ操作", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });
  test("条・項・号をタップで追加・削除できる", async ({ page }) => {
    await page.goto("/edit/constitution/");
    const first = page.locator("#art-name");
    await first
      .getByRole("textbox", { name: "第一条 第1項の本文", exact: true })
      .waitFor();
    const count = await page.locator(".law-article").count();
    await first
      .getByRole("textbox", { name: "第一条 第1項の本文", exact: true })
      .tap();
    await expect(page.locator(".law-article")).toHaveCount(count);
    await first
      .getByRole("button", { name: "次に条を追加", exact: true })
      .tap();
    await expect(page.locator(".law-article")).toHaveCount(count + 1);
    const article = page.locator(".law-article").filter({
      has: page.getByRole("textbox", {
        name: "新しい条 第1項の本文",
        exact: true,
      }),
    });
    await article
      .getByRole("button", { name: "＋ 項を追加", exact: true })
      .tap();
    const paragraph = article.locator(".paragraph-block").nth(1);
    await paragraph.getByRole("textbox").tap();
    await paragraph
      .getByRole("button", { name: "号を追加", exact: true })
      .tap();
    await paragraph.locator(".law-items textarea").tap();
    await paragraph
      .getByRole("button", { name: "号を削除", exact: true })
      .tap();
    await expect(paragraph.locator(".law-items li")).toHaveCount(0);
    await paragraph
      .getByRole("button", { name: "項を削除", exact: true })
      .tap();
    await expect(article.locator(".paragraph-block")).toHaveCount(1);
    await article.getByRole("button", { name: "条を削除", exact: true }).tap();
    await expect(article).toHaveCount(0);
  });
});
