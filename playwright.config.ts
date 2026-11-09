import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3107", headless: true, launchOptions: { executablePath: process.env.LAW_CHROMIUM_PATH || undefined } },
  webServer: { command: "bun tests/browser/server.ts", url: "http://127.0.0.1:3107/api/session", reuseExistingServer: false },
});
