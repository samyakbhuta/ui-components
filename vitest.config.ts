import { configDefaults, defineConfig } from "vitest/config";
import { packageAlias } from "./vite.config.ts";

export default defineConfig({
  resolve: { alias: packageAlias },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // e2e/ holds the Playwright browser tests, run with `npm run test:e2e`.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
