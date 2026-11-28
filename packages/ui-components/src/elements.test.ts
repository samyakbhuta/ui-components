import { settle } from "@ui-sdk/core/testing";
import { expect, test } from "vitest";
import "./index.ts";
import source from "./elements.ts?raw";

const tags = [
  "ai-composer",
  "ai-message",
  "ai-transcript",
  "ai-thinking",
  "ai-tool-call",
  "ai-sources",
  "ai-suggestions",
  "ai-question",
  "ai-approval",
  "ai-plan",
  "ai-chat",
  "ai-chat-list",
] as const;

const camel = (name: string) => name.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
const pascal = (tag: string) => camel(`-${tag}`);

/** The keys of one Props interface in elements.ts. */
function propKeys(tag: string) {
  const body = source.match(new RegExp(`export interface ${pascal(tag)}Props \\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) throw new Error(`No ${pascal(tag)}Props in elements.ts`);
  return new Set([...body.matchAll(/^\s+"?([\w-]+)"?\?:/gm)].map((match) => match[1]));
}

/** Sets a prop the way React 19, Vue and Svelte do: as a property when the element has one. */
function setProp(element: HTMLElement, name: string, value: unknown) {
  if (name in element) (element as unknown as Record<string, unknown>)[name] = value;
  else if (value === false || value == null) element.removeAttribute(name);
  else element.setAttribute(name, value === true ? "" : String(value));
}

test("every tag is in the map, with every attribute and writable property in its props", () => {
  expect(source.match(/^ {2}"(ai-[\w-]+)": \{ element/gm)?.map((line) => line.split('"')[1])).toEqual([...tags]);
  for (const tag of tags) {
    const element = customElements.get(tag)!;
    const keys = propKeys(tag);
    const setters = Object.entries(Object.getOwnPropertyDescriptors(element.prototype))
      .filter(([, descriptor]) => descriptor.set)
      .map(([name]) => name);
    const attributes = ((element as unknown as { observedAttributes?: string[] }).observedAttributes ?? []).filter(
      (name) => !keys.has(camel(name)),
    );
    const missing = [...setters, ...attributes].filter((name) => !keys.has(name));
    expect(missing, `${tag} props`).toEqual([]);
  }
});

test("flags set as properties turn attributes on and off, whatever the framework passes", async () => {
  const composer = document.createElement("ai-composer");
  for (const [name, value] of [
    ["attachments", true],
    ["voice", true],
    ["pasteAsFile", true],
    ["history", true],
  ] as const) {
    setProp(composer, name, value);
  }
  document.body.append(composer);
  await settle();
  expect(composer.getAttribute("attachments")).toBe("");
  expect(composer.getAttribute("voice")).toBe("");
  expect(composer.getAttribute("paste-as-file")).toBe("");
  expect(composer.hasAttribute("history")).toBe(true);
  expect(composer.querySelector("ui-file-input")).not.toBeNull();

  setProp(composer, "attachments", false);
  setProp(composer, "voice", "hide");
  setProp(composer, "pasteAsFile", 500);
  setProp(composer, "history", false);
  expect(composer.hasAttribute("attachments")).toBe(false);
  expect(composer.voice).toBe("hide");
  expect(composer.pasteAsFile).toBe(500);
  expect(composer.hasAttribute("history")).toBe(false);

  // Vue passes "" for a bare attribute; a list still seeds the history and leaves the flag alone.
  setProp(composer, "history", "");
  composer.history = ["earlier"];
  expect(composer.hasAttribute("history")).toBe(true);
  expect(composer.history).toEqual(["earlier"]);
  composer.remove();
});

test("actions take a list or the attribute's words", () => {
  const message = document.createElement("ai-message");
  setProp(message, "actions", "copy retry feedback");
  expect(message.actions).toEqual(["copy", "retry", "feedback"]);
  setProp(message, "actions", ["copy"]);
  expect(message.getAttribute("actions")).toBe("copy");

  const list = document.createElement("ai-chat-list");
  setProp(list, "actions", "rename export");
  expect(list.actions).toEqual(["rename", "export"]);
});
