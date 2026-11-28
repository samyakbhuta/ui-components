// @vitest-environment node
import { getLanguageService, newHTMLDataProvider, TextDocument } from "vscode-html-languageservice";
import { expect, test } from "vitest";
import { buildEditorData } from "../scripts/editor-data.mjs";
import * as elements from "./index.ts";

const tagOf = (name: string) => name.replace(/Element$/, "").replace(/[A-Z]/g, (letter, index) => `${index ? "-" : ""}${letter.toLowerCase()}`);
const attributes = Object.fromEntries(
  Object.entries(elements)
    .filter(([name]) => /^Ai\w+Element$/.test(name))
    .map(([name, element]) => [tagOf(name), (element as { observedAttributes?: string[] }).observedAttributes ?? []]),
);
const { vscode, webTypes } = buildEditorData({ root: new URL("..", import.meta.url).pathname, attributes, version: "0.0.0" });

// VS Code's own HTML language service, given the data the way the html.customData setting does.
const service = getLanguageService({ customDataProviders: [newHTMLDataProvider("ui-components", vscode)] });
const at = (markup: string) => {
  const offset = markup.indexOf("|");
  const document = TextDocument.create("file:///page.html", "html", 1, markup.replace("|", ""));
  return { document, position: document.positionAt(offset), html: service.parseHTMLDocument(document) };
};
const complete = (markup: string) => {
  const { document, position, html } = at(markup);
  return service.doComplete(document, position, html).items.map((item) => item.label);
};
const hover = (markup: string) => {
  const { document, position, html } = at(markup);
  const contents = service.doHover(document, position, html)?.contents;
  return typeof contents === "object" && contents && "value" in contents ? contents.value : JSON.stringify(contents);
};

test("VS Code completes every tag", () => {
  expect(complete("<ai-|")).toEqual(expect.arrayContaining(Object.keys(attributes)));
  expect(Object.keys(attributes)).toHaveLength(10);
});

test("VS Code completes attributes and their values, and explains them on hover", () => {
  expect(complete("<ai-composer |")).toEqual(expect.arrayContaining(["attachments", "submit-on", "history", "voice"]));
  expect(complete('<ai-composer submit-on="|"')).toEqual(expect.arrayContaining(["enter", "mod-enter"]));
  expect(complete('<ai-message from="|"')).toEqual(expect.arrayContaining(["assistant", "user"]));
  expect(complete('<ai-tool-call status="|"')).toEqual(["running", "done", "error"]);
  expect(hover("<ai-appro|val>")).toContain("An agent asks permission before it acts");
  expect(hover('<ai-composer submit-o|n="enter">')).toContain("Ctrl+Enter");
});

test("every attribute has a description from its README, and every tag links to its live example", () => {
  for (const tag of vscode.tags) {
    expect(tag.attributes.map((attribute) => attribute.name)).toEqual(attributes[tag.name]);
    for (const attribute of tag.attributes) expect(attribute.description?.value, `${tag.name} ${attribute.name}`).toBeTruthy();
    expect(tag.references.map((reference) => reference.name), tag.name).toEqual(["Live example", "API reference"]);
  }
});

test("web-types lists the same elements, with their events and detail types, for JetBrains IDEs", () => {
  const { elements: tags } = webTypes.contributions.html;
  expect(tags.map((tag) => tag.name)).toEqual(vscode.tags.map((tag) => tag.name));
  const composer = tags.find((tag) => tag.name === "ai-composer")!;
  expect(composer.events.find((event) => event.name === "promptsubmit")).toMatchObject({
    arguments: [{ name: "event", type: "CustomEvent<PromptSubmitDetail>" }],
  });
  expect(composer.attributes.find((attribute) => attribute.name === "attachments")?.value).toEqual({ kind: "no-value" });
  for (const tag of tags) for (const event of tag.events) expect(event.description, `${tag.name} ${event.name}`).toBeTruthy();
});
