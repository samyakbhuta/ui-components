import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // e2e/ holds the Playwright browser tests, run with `npm run test:e2e`.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
