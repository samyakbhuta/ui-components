import { settle } from "@ui-sdk/core/testing";
import { expect, test } from "vitest";
import "./ai-message.ts";
import { highlight, highlightedLanguages } from "./highlight.ts";

/** The coloured tokens, as [kind, text] pairs. */
const tokens = (code: string, language: string) =>
  (highlight(code, language) ?? [])
    .filter((node): node is HTMLElement => node instanceof HTMLElement)
    .map((node) => [node.dataset.token, node.textContent]);

const text = (code: string, language: string) => (highlight(code, language) ?? []).map((node) => node.textContent).join("");

test("JavaScript and TypeScript: keywords, strings, comments, numbers, functions and types", () => {
  expect(tokens('const total = sum(1, 2.5); // add\nlet name = `hi ${who}`;', "js")).toEqual([
    ["keyword", "const"],
    ["function", "sum"],
    ["number", "1"],
    ["number", "2.5"],
    ["comment", "// add"],
    ["keyword", "let"],
    ["string", "`hi ${who}`"],
  ]);
  expect(tokens("interface Props { done: boolean }", "ts")).toEqual([
    ["keyword", "interface"],
    ["type", "Props"],
  ]);
  expect(tokens("if (ready) return null;", "typescript")).toEqual([
    ["keyword", "if"],
    ["keyword", "return"],
    ["builtin", "null"],
  ]);
});

test("HTML colours tags, attributes and values, but not the text between them", () => {
  expect(tokens('<a href="/docs" hidden>Don\'t "quote" me</a><!-- note -->', "html")).toEqual([
    ["tag", "<a"],
    ["attribute", "href"],
    ["string", '"/docs"'],
    ["tag", ">"],
    ["tag", "</a"],
    ["tag", ">"],
    ["comment", "<!-- note -->"],
  ]);
});

test("CSS colours properties, values, at-rules, variables and functions", () => {
  expect(tokens("@media (width > 40rem) {\n  a:hover { color: var(--accent); margin: 0 1.5rem }\n}", "css")).toEqual([
    ["keyword", "@media"],
    ["number", "40rem"],
    ["property", "color"],
    ["function", "var"],
    ["variable", "--accent"],
    ["property", "margin"],
    ["number", "0"],
    ["number", "1.5rem"],
  ]);
});

test("shell colours the prompt, commands, flags, variables, strings and comments", () => {
  expect(tokens('$ npm install --save-dev "vitest" # tests\necho $HOME | grep -i user', "bash")).toEqual([
    ["comment", "$"],
    ["function", "npm"],
    ["attribute", "--save-dev"],
    ["string", '"vitest"'],
    ["comment", "# tests"],
    ["function", "echo"],
    ["variable", "$HOME"],
    ["function", "grep"],
    ["attribute", "-i"],
  ]);
});

test("Python, SQL, JSON, YAML, TOML and diffs", () => {
  expect(tokens('@cache\ndef greet(name: str) -> None:\n    return f"hi {name}"', "py")).toEqual([
    ["attribute", "@cache"],
    ["keyword", "def"],
    ["function", "greet"],
    ["builtin", "None"],
    ["keyword", "return"],
    ["string", 'f"hi {name}"'],
  ]);
  expect(tokens("SELECT id FROM users WHERE age > 21 -- adults", "sql")).toEqual([
    ["keyword", "SELECT"],
    ["keyword", "FROM"],
    ["keyword", "WHERE"],
    ["number", "21"],
    ["comment", "-- adults"],
  ]);
  expect(tokens('{ "name": "chat", "private": true, "size": 3 }', "json")).toEqual([
    ["property", '"name"'],
    ["string", '"chat"'],
    ["property", '"private"'],
    ["builtin", "true"],
    ["property", '"size"'],
    ["number", "3"],
  ]);
  expect(tokens("build:\n  command: npm run build # ci\n  publish: dist", "yaml")).toEqual([
    ["property", "build"],
    ["property", "command"],
    ["comment", "# ci"],
    ["property", "publish"],
  ]);
  expect(tokens('[build]\ncommand = "npm run build"', "toml")).toEqual([
    ["type", "[build]"],
    ["property", "command"],
    ["string", '"npm run build"'],
  ]);
  expect(tokens("@@ -1 +1 @@\n-old\n+new", "diff")).toEqual([
    ["keyword", "@@ -1 +1 @@"],
    ["deleted", "-old"],
    ["inserted", "+new"],
  ]);
});

test("an unfinished string or comment runs to the end, as it does mid-stream", () => {
  expect(tokens('const a = "unfinished', "js").at(-1)).toEqual(["string", '"unfinished']);
  expect(tokens("/* still\ngoing", "js")).toEqual([["comment", "/* still\ngoing"]]);
});

test("colouring keeps every character, and never makes elements from the code", () => {
  const samples: [string, string][] = [
    ['<img src=x onerror="alert(1)"><script>alert(1)</script>', "html"],
    ['const s = "<img src=x onerror=alert(1)>";', "js"],
    ["a { background: url(javascript:alert(1)) }", "css"],
    ["echo '<script>' && rm -rf ~/tmp", "sh"],
  ];
  for (const [code, language] of samples) {
    const nodes = highlight(code, language)!;
    expect(text(code, language)).toBe(code);
    expect(nodes.every((node) => node.nodeType === Node.TEXT_NODE || (node as HTMLElement).tagName === "SPAN")).toBe(true);
    const host = document.createElement("div");
    host.append(...nodes);
    expect(host.querySelector("img, script, [onerror]")).toBeNull();
  }
  for (const language of highlightedLanguages) {
    const code = "x = 1 # a // b /* c */ <d e='f'> \"g\" $h @i";
    expect(text(code, language), language).toBe(code);
  }
});

test("unknown languages and very long code are left plain", () => {
  expect(highlight("let x", "brainfuck")).toBeNull();
  expect(highlight("let x", "")).toBeNull();
  expect(highlight("x".repeat(60_000), "js")).toBeNull();
  expect(tokens("CONST x", "JS")).toEqual([["type", "CONST"]]);
});

test("messages colour code blocks, and the highlighter can be replaced or turned off", async () => {
  document.body.insertAdjacentHTML("beforeend", "<ai-message></ai-message>");
  const message = document.body.lastElementChild as HTMLElementTagNameMap["ai-message"];
  message.text = "```ts\nconst a = 1;\n```";
  await settle();
  const code = () => message.querySelector("pre code")!;
  expect(code().querySelector("[data-token='keyword']")!.textContent).toBe("const");
  expect(code().textContent).toBe("const a = 1;");

  message.highlighter = null;
  expect(code().children).toHaveLength(0);
  expect(code().textContent).toBe("const a = 1;");

  message.highlighter = (source, language) => {
    const mark = document.createElement("mark");
    mark.textContent = `${language}:${source}`;
    return [mark];
  };
  expect(code().innerHTML).toBe("<mark>ts:const a = 1;</mark>");
});
