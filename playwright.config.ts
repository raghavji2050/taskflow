import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    // Phone layouts (Chromium engine so CI only needs one browser).
    { name: "iphone-13", testMatch: /mobile\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } },
    { name: "android-small", testMatch: /mobile\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    // CI builds first, then serves the production build for stable timings.
    command: process.env.E2E_SERVER_COMMAND ?? (process.env.CI ? "npm run start:next" : "npm run dev:next"),
    timeout: 180_000,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
