import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

import { articles, serialize } from "../../src/domain/model";
import { validate } from "../../src/domain/validation";

const base = process.env.LAW_BASE_PATH ?? "/";
const publicURL = (path: string) => `http://127.0.0.1:3108${base}${path}`;

test("公開HTMLはJSなしで直接閲覧でき、編集APIを含まない", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(publicURL("laws/constitution/#art-member-duties"));
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
  ).toHaveAttribute("href", `${base}edit/constitution/`);
  expect(await page.content()).not.toContain("X-Law-Token");
  await context.close();
});

test("公開ページのbase path・hydration・Git履歴が動く", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(publicURL("laws/constitution/"));
  await page.getByRole("link", { name: "変更履歴", exact: true }).click();
  await expect(page).toHaveURL(publicURL("history/constitution/"));
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

test("公開ページで編集したJSONをダウンロードでき、公開中の本文は変わらない", async ({
  page,
}) => {
  const errors: string[] = [];
  const apiRequests: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.goto(publicURL("laws/constitution/"));
  const original = await page.evaluate(() => window.__LAW_DATA__.documents[0]!);
  await page.getByRole("link", { name: "編集する", exact: true }).click();
  await expect(page).toHaveURL(publicURL("edit/constitution/"));
  const text = page.getByRole("textbox", {
    name: "第一条 第1項の本文",
    exact: true,
  });
  const body = await text.inputValue();
  await text.fill(body + "公開版の編集テスト。");
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(text).toHaveValue(body);
  await page.getByRole("button", { name: "やり直す", exact: true }).click();
  await expect(text).toHaveValue(body + "公開版の編集テスト。");
  const downloadButton = page.getByRole("button", {
    name: "JSONをダウンロード",
    exact: true,
  });
  const pendingDownload = page.waitForEvent("download");
  await downloadButton.click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe("constitution.json");
  const downloaded = await readFile((await download.path())!, "utf8");
  const expected = structuredClone(original);
  articles(expected)[0].paragraphs[0].text = body + "公開版の編集テスト。";
  expect(downloaded).toBe(serialize(expected));
  expect(validate(JSON.parse(downloaded))).toEqual([]);
  await expect(
    page.getByText("ダウンロード済み", { exact: true }),
  ).toBeVisible();
  await expect(downloadButton).toBeDisabled();
  await expect(page.locator(".changes")).toContainText("公開版の編集テスト");
  await page.getByRole("button", { name: "新旧対照表", exact: true }).click();
  await expect(page.getByRole("table", { name: "新旧対照表" })).toContainText(
    "公開版の編集テスト",
  );
  await page.getByRole("link", { name: "閲覧に戻る", exact: true }).click();
  await expect(page.locator("#art-name")).not.toContainText(
    "公開版の編集テスト",
  );
  expect(await page.evaluate(() => window.__LAW_DATA__.documents[0])).toEqual(
    original,
  );
  await page.goto(publicURL("edit/constitution/"));
  await expect(text).toHaveValue(body);
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test("公開ページで新規作成し、入力の検証後にショートカットでもダウンロードできる", async ({
  page,
}) => {
  const errors: string[] = [];
  const downloads: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  await page.goto(publicURL("new/"));
  await page.getByLabel("文書ID", { exact: true }).fill("public-notice");
  await page.getByLabel("題名", { exact: true }).fill("公開版の新規公示");
  await page.getByLabel("種別", { exact: true }).selectOption("執行部公示");
  await page.getByRole("radio", { name: /単一の文字列/ }).check();
  await page.getByRole("button", { name: "本文の編集へ", exact: true }).click();
  const downloadButton = page.getByRole("button", {
    name: "JSONをダウンロード",
    exact: true,
  });
  await expect(downloadButton).toBeDisabled();
  await expect(page.locator(".diagnostics")).toContainText(
    "本文を入力してください。",
  );
  await page.keyboard.press("ControlOrMeta+s");
  await page
    .getByRole("textbox", { name: "本文", exact: true })
    .fill("公示本文です。\n改行も保持します。");
  await expect(downloadButton).toBeEnabled();
  const pendingDownload = page.waitForEvent("download");
  await page.keyboard.press("ControlOrMeta+s");
  const download = await pendingDownload;
  const downloaded = JSON.parse(
    await readFile((await download.path())!, "utf8"),
  );
  expect(downloaded).toMatchObject({
    id: "public-notice",
    title: "公開版の新規公示",
    kind: "執行部公示",
    body: "公示本文です。\n改行も保持します。",
  });
  expect(validate(downloaded)).toEqual([]);
  expect(downloads).toEqual(["public-notice.json"]);
  await expect(
    page.getByText("ダウンロード済み", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "本文", exact: true })
    .fill("再編集した本文です。");
  await expect(
    page.getByText("未ダウンロードの変更あり", { exact: true }),
  ).toBeVisible();
  await expect(downloadButton).toBeEnabled();
  expect(errors).toEqual([]);
});
