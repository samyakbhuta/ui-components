import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const ci = Boolean(process.env.CI);

/**
 * Browser tests for the built site. `npm run test:e2e` builds the site, serves it with
 * `vite preview`, and runs `e2e/` in Chromium: every test in light mode, and the ones tagged
 * @theme in dark mode too.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [["github"], ["html", { open: "never" }]] : [["list"]],
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: "only-on-failure",
    // Where a Chromium is already installed, point at it instead of downloading one.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `npm run build && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/showcase.html`,
    reuseExistingServer: !ci,
    timeout: 120_000,
  },
  projects: [
    { name: "light", use: { ...devices["Desktop Chrome"], colorScheme: "light" } },
    { name: "dark", use: { ...devices["Desktop Chrome"], colorScheme: "dark" }, grep: /@theme/ },
  ],
});
