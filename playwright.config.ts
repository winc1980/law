import { defineConfig } from "@playwright/test";
const browserName = process.env.LAW_TEST_BROWSER === "webkit" ? "webkit" : "chromium";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  // 各ファイルが同じ一時原本を編集するため、ファイル間も直列に実行する。
  workers: 1,
  use: { browserName, baseURL: "http://127.0.0.1:3107", headless: true, launchOptions: { executablePath: browserName === "chromium" ? process.env.LAW_CHROMIUM_PATH || undefined : undefined } },
  webServer: { command: "bun tests/browser/server.ts", url: "http://127.0.0.1:3107/api/session", reuseExistingServer: false },
});
