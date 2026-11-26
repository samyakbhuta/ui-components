import { resolve } from "node:path";
import { defineConfig } from "vite";

const page = (path: string) => resolve(import.meta.dirname, path);

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: page("index.html"),
        showcase: page("showcase.html"),
        "chat-shell": page("experiments/chat-shell.html"),
        "ai-composer": page("experiments/ai-composer.html"),
      },
    },
  },
});
