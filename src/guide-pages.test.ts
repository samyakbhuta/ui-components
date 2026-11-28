// @vitest-environment node
import { existsSync } from "node:fs";
import { expect, test } from "vitest";
import { guideSources, renderGuides, resolveLink, slug } from "../scripts/guide-pages.mjs";

const root = new URL("..", import.meta.url).pathname;
const pages = renderGuides(root);

test("every guide and every component's README becomes a page", () => {
  const sources = pages.map((page) => page.source);
  expect(sources).toContain("docs/using-the-components.md");
  expect(sources).toContain("docs/making-ai-chat-your-own.md");
  expect(pages.filter((page) => page.group === "Components")).toHaveLength(12);
  for (const page of pages) expect(page.html, page.page).toContain(`<title>`);
});

test("links between the guides go to their pages, keeping the #section; anything else goes to GitHub", () => {
  const entries = guideSources(root);
  expect(resolveLink("../packages/ui-components/src/ai-chat/README.md#the-model", "docs/making-ai-chat-your-own.md", entries)).toBe(
    "/guides/components/ai-chat.html#the-model",
  );
  expect(resolveLink("../ai-message/README.md#translation", "packages/ui-components/src/ai-chat/README.md", entries)).toBe(
    "/guides/components/ai-message.html#translation",
  );
  expect(resolveLink("https://github.com/samyakbhuta/ui-components/blob/main/docs/making-ai-chat-your-own.md", "packages/ui-components/src/ai-chat/README.md", entries)).toBe(
    "/guides/making-ai-chat-your-own.html",
  );
  expect(resolveLink("../examples/from-parts", "docs/making-ai-chat-your-own.md", entries)).toBe(
    "https://github.com/samyakbhuta/ui-components/blob/main/examples/from-parts",
  );
  expect(resolveLink("https://uisdk-components.netlify.app/recipes/ai-chat/welcome.html", "docs/making-ai-chat-your-own.md", entries)).toBe(
    "/recipes/ai-chat/welcome.html",
  );
  expect(resolveLink("https://developer.mozilla.org/", "docs/using-the-components.md", entries)).toBe("https://developer.mozilla.org/");
});

test("every link on the site's own pages leads to a page, and every #section exists", () => {
  const ids = new Map(pages.map((page) => [`/${page.page}`, new Set([...page.html.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]))]));
  for (const page of pages) {
    const content = page.html.slice(page.html.indexOf('<main class="guide-content"'));
    for (const [, href] of content.matchAll(/<a href="([^"]+)"/g)) {
      if (/^(https?:|mailto:)/.test(href)) continue;
      const [path, hash] = href.startsWith("#") ? [`/${page.page}`, href.slice(1)] : href.split("#");
      if (path.startsWith("/guides/")) {
        expect(ids.has(path), `${page.page} links to ${href}`).toBe(true);
        if (hash) expect(ids.get(path)!.has(hash), `${page.page} links to ${href}`).toBe(true);
      } else {
        expect(existsSync(`${root}${path.slice(1)}`), `${page.page} links to ${href}`).toBe(true);
      }
    }
  }
});

test("headings get GitHub's ids, so the same #links work on both", () => {
  expect(slug("1. Files and a model picker in the message box")).toBe("1-files-and-a-model-picker-in-the-message-box");
  expect(slug("Making <ai-chat> your own")).toBe("making-ai-chat-your-own");
  expect(slug("Richer replies: thinking, tools, sources and follow-ups")).toBe("richer-replies-thinking-tools-sources-and-follow-ups");
});

test("code in the Markdown is shown as text, never run as HTML", () => {
  const guide = pages.find((page) => page.source === "docs/making-ai-chat-your-own.md")!.html;
  const content = guide.slice(guide.indexOf('<main class="guide-content"'), guide.indexOf("</main>"));
  expect(content).toContain("&lt;ai-chat style=&quot;height: 80vh&quot;&gt;");
  expect(content).not.toMatch(/<(script|ai-chat|style)\b/);
});
