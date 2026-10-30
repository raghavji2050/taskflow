import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // CI builds first, then serves the production build for stable timings.
    command: process.env.E2E_SERVER_COMMAND ?? (process.env.CI ? "npm run start:next" : "npm run dev:next"),
    timeout: 180_000,
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
