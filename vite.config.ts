import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { guidePages } from "./scripts/guide-pages.mjs";

const page = (path: string) => resolve(import.meta.dirname, path);

/**
 * The showcase imports the components by their package name, as an app would. This points those
 * imports at the package's source, so the site needs no build of the package first.
 */
export const packageAlias = [
  { find: /^@samyakbhuta\/ui-components$/, replacement: page("packages/ui-components/src/index.ts") },
  { find: /^@samyakbhuta\/ui-components\/(.+)$/, replacement: page("packages/ui-components/src/$1.ts") },
];

export default defineConfig({
  resolve: { alias: packageAlias },
  // The guides and component READMEs, as pages at /guides/…
  plugins: [guidePages(import.meta.dirname)],
  build: {
    rollupOptions: {
      input: {
        main: page("index.html"),
        showcase: page("showcase.html"),
        "chat-shell": page("experiments/chat-shell.html"),
        "ai-composer": page("experiments/ai-composer.html"),
        "search-field": page("experiments/search-field.html"),
        // The recipes in docs/making-ai-chat-your-own.md, each a page of its own.
        ...Object.fromEntries(
          readdirSync(page("recipes/ai-chat"))
            .filter((file) => file.endsWith(".html"))
            .map((file) => [`recipe-${file.replace(/\.html$/, "")}`, page(`recipes/ai-chat/${file}`)]),
        ),
      },
    },
  },
});
