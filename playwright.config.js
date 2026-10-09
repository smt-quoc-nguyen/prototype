import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    channel: "chromium",
    baseURL: "http://localhost:4173",
    viewport: { width: 1440, height: 1000 },
  },
  workers: 1,
  reporter: "list",
  webServer: {
    command: "npm run dev -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: true,
  },
});
