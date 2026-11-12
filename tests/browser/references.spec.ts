import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { articles } from "../../src/domain/model";
import { validate } from "../../src/domain/validation";

const base = process.env.LAW_BASE_PATH ?? "/";
const publicURL = (path: string) => `http://127.0.0.1:3108${base}${path}`;

test("参照先を小窓で表示し、移動・閉じる・非表示の条へのジャンプができる", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(publicURL("laws/constitution/"));
  await page
    .getByRole("navigation", { name: "文書の目次", exact: true })
    .getByRole("button", { name: "第二条を非表示", exact: true })
    .click();
  const link = page
    .locator("#art-activities")
    .getByRole("link", { name: "前条", exact: true });
  await expect(link).toHaveAttribute("href", "#art-purpose");
  await link.click();
  const preview = page.getByRole("dialog", {
    name: "第二条の参照先",
    exact: true,
  });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("情報サービスを安全かつ有効に活用");
  await expect(page.locator("#art-purpose")).not.toBeVisible();
  expect(new URL(page.url()).hash).toBe("");

  const handle = preview.locator(".reference-drag-handle");
  const before = (await preview.boundingBox())!;
  const grip = (await handle.boundingBox())!;
  await page.mouse.move(grip.x + 10, grip.y + 10);
  await page.mouse.down();
  await page.mouse.move(grip.x + 40, grip.y + 50, { steps: 5 });
  await page.mouse.up();
  const after = (await preview.boundingBox())!;
  expect(after.y).toBeGreaterThan(before.y);
  await page.screenshot({ path: "test-results/reference-preview-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(link).toBeFocused();

  await link.press("Enter");
  await expect(preview).toBeVisible();
  await preview
    .getByRole("link", { name: "第二条へ移動", exact: true })
    .click();
  await expect(preview).toHaveCount(0);
  await expect(page).toHaveURL(/#art-purpose$/);
  await expect(page.locator("#art-purpose")).toBeInViewport();
  await expect(page.locator("#art-purpose")).toBeFocused();
  expect(errors).toEqual([]);
});

test("号の算用数字の参照から全項を表示できる", async ({ page }) => {
  await page.goto(publicURL("laws/constitution/"));
  await page
    .locator(".law-items .article-reference")
    .filter({ hasText: "第6条" })
    .click();
  const preview = page.getByRole("dialog", {
    name: "第六条の参照先",
    exact: true,
  });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("会員の義務");
  const count = await page
    .locator("#art-member-duties .paragraph-block")
    .count();
  await expect(preview.locator(".paragraph-block")).toHaveCount(count);
  await preview
    .getByRole("button", { name: "参照先を閉じる", exact: true })
    .click();
  await expect(preview).toHaveCount(0);
});

test("JavaScriptなしでも参照リンクから条文へ移動できる", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(publicURL("laws/constitution/"));
  await page
    .locator("#art-activities")
    .getByRole("link", { name: "前条", exact: true })
    .click();
  await expect(page).toHaveURL(/#art-purpose$/);
  await expect(page.locator("#art-purpose")).toBeInViewport();
  await context.close();
});

test("挿入と再採番で参照先を保ち、Undo・Redo・復元・JSONに反映する", async ({
  page,
}) => {
  await page.goto(publicURL("edit/constitution/"));
  const purpose = page.locator("#art-purpose");
  const activities = page.locator("#art-activities");
  await purpose
    .getByRole("textbox", { name: "第二条 第1項の本文", exact: true })
    .click();
  await purpose
    .getByRole("button", { name: "次に条を追加", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "新しい条 第1項の本文", exact: true })
    .fill("間に挿入した条。");
  await expect(
    activities.getByRole("textbox", {
      name: "第三条 第1項の本文",
      exact: true,
    }),
  ).toHaveValue(/本会は、第二条の目的/);

  // Move the original purpose below the inserted article, then renumber.
  await purpose
    .getByRole("textbox", { name: "第二条 第1項の本文", exact: true })
    .click();
  await purpose
    .getByRole("button", { name: "第二条を下へ", exact: true })
    .click();
  await page.locator(".renumber-panel summary").click();
  await page
    .getByRole("button", { name: "本則の条名を再採番", exact: true })
    .click();
  const text = activities.getByRole("textbox", {
    name: "第四条 第1項の本文",
    exact: true,
  });
  await expect(text).toHaveValue(/本会は、第三条の目的/);
  await expect(
    page.getByRole("textbox", { name: "第九条 第1項 第1号", exact: true }),
  ).toHaveValue("第7条の義務に違反する行為があったとき");
  await activities.getByRole("link", { name: "第三条", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "第三条の参照先", exact: true }),
  ).toContainText("情報サービスを安全かつ有効に活用");
  await page
    .getByRole("button", { name: "参照先を閉じる", exact: true })
    .click();

  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(
    activities.getByRole("textbox", {
      name: "第三条 第1項の本文",
      exact: true,
    }),
  ).toHaveValue(/本会は、第二条の目的/);
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(text).toHaveValue(/本会は、第三条の目的/);
  await page.reload();
  await expect(text).toHaveValue(/本会は、第三条の目的/);
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "JSONをダウンロード", exact: true })
    .click();
  const downloaded = JSON.parse(
    await readFile((await (await pending).path())!, "utf8"),
  );
  expect(validate(downloaded)).toEqual([]);
  expect(
    articles(downloaded).find((a) => a.anchor === "activities")!.paragraphs[0]
      .text,
  ).toContain("第三条の目的");
  expect(articles(downloaded).find((a) => a.anchor === "purpose")!.name).toBe(
    "第三条",
  );
});

test("スマートフォンでも参照先が画面内に収まりタップで閉じられる", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(publicURL("laws/constitution/"));
  await page
    .locator("#art-activities")
    .getByRole("link", { name: "前条", exact: true })
    .click();
  const preview = page.getByRole("dialog", {
    name: "第二条の参照先",
    exact: true,
  });
  await expect(preview).toBeVisible();
  const bounds = (await preview.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "test-results/reference-preview-mobile.png" });
  await preview
    .getByRole("button", { name: "参照先を閉じる", exact: true })
    .click();
  await expect(preview).toHaveCount(0);
});
