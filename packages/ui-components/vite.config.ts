import { resolve } from "node:path";
import { defineConfig } from "vite";

/** Each entry is an import path: `@samyakbhuta/ui-components/ai-composer` and so on. */
export const entries = ["index", "ai-composer", "ai-message", "ai-transcript", "ai-thinking", "ai-tool-call", "ai-sources", "ai-suggestions", "ai-question", "ai-approval", "ai-plan", "ai-chat", "ai-chat-list", "markdown", "highlight"];

export default defineConfig({
  root: import.meta.dirname,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    sourcemap: true,
    lib: {
      entry: Object.fromEntries(entries.map((entry) => [entry, resolve(import.meta.dirname, "src", `${entry}.ts`)])),
      formats: ["es"],
    },
    rollupOptions: {
      // ui-sdk is a peer dependency: the app installs it, and every component shares one copy.
      external: [/^@ui-sdk\//],
      output: { entryFileNames: "[name].js", chunkFileNames: "shared/[name]-[hash].js" },
    },
  },
});
