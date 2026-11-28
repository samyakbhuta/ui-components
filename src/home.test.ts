import { expect, test } from "vitest";
import partsPackage from "../examples/from-parts/package.json";
import partsPage from "../examples/from-parts/index.html?raw";
import starterPackage from "../examples/quick-start/package.json";
import starterPage from "../examples/quick-start/index.html?raw";
import frontPage from "../index.html?raw";
import componentsPackage from "../packages/ui-components/package.json";

const unescape = (html: string) => html.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const dedent = (text: string) => {
  const lines = text.split("\n");
  const indent = Math.min(...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)![0].length));
  return lines.map((line) => line.slice(indent)).join("\n").trim();
};
const shown = (label: string) => unescape(frontPage.match(new RegExp(`data-copy-label="${label}"><code>([\\s\\S]*?)</code></pre>`))![1]).trim();
const body = (page: string) => dedent(page.match(/<body>([\s\S]*?)<\/body>/)![1]);

test("the front page's quick starts are the starter projects' pages, word for word", () => {
  expect(body(starterPage)).toBe(shown("quick start"));
  expect(body(partsPage)).toBe(shown("parts example"));
  expect(shown("starter command")).toBe("npx degit samyakbhuta/ui-components/examples/quick-start my-chat");
  expect(shown("parts starter command")).toBe("npx degit samyakbhuta/ui-components/examples/from-parts my-chat");
});

test("one starter uses <ai-chat>, and the other builds the chat from the parts", () => {
  expect(starterPage).toContain("<ai-chat");
  expect(partsPage).not.toContain("<ai-chat");
  expect(partsPage).toContain("<ai-composer></ai-composer>");
});

test("the starters depend on the ui-sdk version the package is built against", () => {
  const { peerDependencies } = componentsPackage;
  for (const { dependencies } of [starterPackage, partsPackage]) {
    expect(`^${dependencies["@ui-sdk/web"]}`).toBe(peerDependencies["@ui-sdk/web"]);
    expect(`^${dependencies["@ui-sdk/core"]}`).toBe(peerDependencies["@ui-sdk/core"]);
  }
  expect(partsPackage.dependencies).toEqual(starterPackage.dependencies);
});
