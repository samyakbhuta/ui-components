import { expect, test } from "vitest";
import guide from "../docs/making-ai-chat-your-own.md?raw";
import quickStart from "../examples/quick-start/index.html?raw";

// Every recipe page, by file name.
const recipes = Object.fromEntries(
  Object.entries(import.meta.glob<string>("../recipes/ai-chat/*.html", { query: "?raw", import: "default", eager: true })).map(
    ([path, page]) => [path.split("/").pop()!, page],
  ),
);
const site = "https://uisdk-components.netlify.app/recipes/ai-chat/";
const blocks = [...guide.matchAll(/```html\n([\s\S]*?)\n```/g)].map((match) => `${match[1]}\n`);
const liveLinks = [...guide.matchAll(new RegExp(`${site.replace(/[.]/g, "\\.")}([\\w-]+\\.html)`, "g"))].map((match) => match[1]);

// The <head> up to the end of the quick start's own CSS, without the <title>, which each page names itself.
const setup = (page: string) => page.slice(0, page.indexOf("</head>")).replace(/ *<title>.*<\/title>\n/, "");
const quickStartSetup = setup(quickStart).replace(/\n {4}<\/style>\n {2}$/, "");

test("there are recipes, and the guide shows each one in full, word for word", () => {
  expect(Object.keys(recipes).length).toBeGreaterThanOrEqual(8);
  for (const [file, page] of Object.entries(recipes)) {
    expect(blocks, `${file} isn't in the guide as it is`).toContain(page);
  }
  // And nothing else: every HTML block in the guide is a recipe.
  expect(blocks).toHaveLength(Object.keys(recipes).length);
});

test("the guide links to each recipe's live page, once, and to nothing that doesn't exist", () => {
  expect([...liveLinks].sort()).toEqual(Object.keys(recipes).sort());
});

test("each recipe keeps the quick start's setup, so it can replace its index.html", () => {
  for (const [file, page] of Object.entries(recipes)) {
    expect(setup(page).startsWith(quickStartSetup), `${file} changes the quick start's <head>`).toBe(true);
    expect(page, file).toMatch(/<title>.+<\/title>/);
    expect(page, file).toContain('import "@samyakbhuta/ui-components";');
    expect(page, file).toContain("chat.model = ");
  }
});
