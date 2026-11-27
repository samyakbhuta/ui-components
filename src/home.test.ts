import { expect, test } from "vitest";
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

test("the front page's quick start is the starter project's page, word for word", () => {
  const front = unescape(frontPage.match(/data-copy-label="quick start"><code>([\s\S]*?)<\/code><\/pre>/)![1]);
  const starter = starterPage.match(/<body>([\s\S]*?)<\/body>/)![1];
  expect(dedent(starter)).toBe(front.trim());
});

test("the starter depends on the ui-sdk version the package is built against", () => {
  const { dependencies } = starterPackage;
  const { peerDependencies } = componentsPackage;
  expect(`^${dependencies["@ui-sdk/web"]}`).toBe(peerDependencies["@ui-sdk/web"]);
  expect(`^${dependencies["@ui-sdk/core"]}`).toBe(peerDependencies["@ui-sdk/core"]);
});
