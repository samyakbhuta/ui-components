import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { afterEach, expect, test } from "vitest";
import "../ai-message/ai-message.ts";
import type { AiMessageElement } from "../ai-message/ai-message.ts";
import "./ai-sources.ts";
import type { AiSourcesElement, Source } from "./ai-sources.ts";

afterEach(() => document.body.replaceChildren());

const sources: Source[] = [
  { title: "Using custom elements", url: "https://developer.mozilla.org/docs/Web/API/Web_components/Using_custom_elements", description: "How to define and use them." },
  { title: "Custom elements spec", url: "https://html.spec.whatwg.org/multipage/custom-elements.html", site: "WHATWG" },
  { title: "Sneaky", url: "javascript:alert(1)" },
];

async function mountSources(setup?: (element: AiSourcesElement) => void) {
  const element = document.createElement("ai-sources");
  setup?.(element);
  document.body.append(element);
  await settle();
  return element;
}

test("sources show as a numbered list of links named \"Sources\", with their sites", async () => {
  const element = await mountSources((el) => (el.sources = sources));
  const list = within(element).getByRole("list", { name: "Sources" });
  const items = within(list).getAllByRole("listitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "1Using custom elementsdeveloper.mozilla.org",
    "2Custom elements specWHATWG",
    "3Sneaky",
  ]);
  const link = within(items[0]).getByRole("link", { name: "Using custom elements" });
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  // An address that isn't a web link shows as text, never as a link.
  expect(within(items[2]).queryByRole("link")).toBeNull();
});

test("with max, the rest open from \"Show N more\", which moves focus to the first one shown", async () => {
  const user = userEvent.setup();
  const element = await mountSources((el) => {
    el.sources = sources;
    el.max = 1;
  });
  expect(within(element).getAllByRole("listitem")).toHaveLength(1);
  const more = within(element).getByRole("button", { name: "Show 2 more" });
  expect(more.getAttribute("aria-expanded")).toBe("false");
  await user.click(more);
  expect(within(element).getAllByRole("listitem")).toHaveLength(3);
  expect(document.activeElement).toBe(within(element).getByRole("link", { name: "Custom elements spec" }));
  const fewer = within(element).getByRole("button", { name: "Show fewer" });
  expect(fewer.getAttribute("aria-expanded")).toBe("true");
  await user.click(fewer);
  expect(within(element).getAllByRole("listitem")).toHaveLength(1);
});

test("no sources hides the element", async () => {
  const element = await mountSources();
  expect(element.hasAttribute("data-empty")).toBe(true);
  element.sources = sources;
  expect(element.hasAttribute("data-empty")).toBe(false);
});

test("in a message, [n] markers become named links to their sources, outside code and links", async () => {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<ai-message>Custom elements have callbacks [1][2]. See \`arr[1]\` and [9] and [3].

\`\`\`js
list[1]
\`\`\`</ai-message>`,
  );
  const message = document.body.lastElementChild as AiMessageElement;
  const element = document.createElement("ai-sources");
  element.slot = "footer";
  element.sources = sources;
  message.append(element);
  await settle();

  const body = message.querySelector<HTMLElement>("[data-part='body']")!;
  const first = within(body).getByRole("link", { name: "Source 1: Using custom elements" });
  expect(first.textContent).toBe("1");
  expect(first.getAttribute("href")).toBe(sources[0].url);
  expect(first.closest("ui-hover-card-trigger")!.getAttribute("for")).toBe(element.cardId);
  expect(within(body).getByRole("link", { name: "Source 2: Custom elements spec" })).toBeDefined();
  // [9] has no source, inline code and code blocks stay as written, and an unsafe source isn't a link.
  expect(body.textContent).toContain("[9]");
  expect(body.querySelector("p code")!.textContent).toBe("arr[1]");
  expect(body.querySelector("pre code")!.textContent).toBe("list[1]");
  const third = body.querySelector("sup[data-part='citation']")!;
  expect(third.textContent).toBe("3");
  expect(third.closest("a")).toBeNull();
  // Copy still copies what the model wrote.
  expect(message.text).toContain("[1][2]");
});

test("citations link up when sources arrive after the text, and while it streams", async () => {
  const message = document.createElement("ai-message");
  message.streaming = true;
  document.body.append(message);
  const element = document.createElement("ai-sources");
  element.slot = "footer";
  message.append(element);
  message.appendText("First claim [1]");
  message.done();
  await settle();
  expect(message.querySelector("[data-part='citation']")).toBeNull();

  element.sources = sources;
  await settle();
  expect(within(message).getByRole("link", { name: "Source 1: Using custom elements" })).toBeDefined();
});

test("strings translate the heading, the button and the citation names", async () => {
  const element = await mountSources((el) => {
    el.sources = sources;
    el.max = 1;
    el.strings = { heading: "Fuentes", showMore: (count) => `Ver ${count} más`, citationName: (n, title) => `Fuente ${n}: ${title}` };
  });
  expect(within(element).getByRole("list", { name: "Fuentes" })).toBeDefined();
  expect(within(element).getByRole("button", { name: "Ver 2 más" })).toBeDefined();
  expect(element.citation(1)!.querySelector("a")!.getAttribute("aria-label")).toBe("Fuente 1: Using custom elements");
  expect(element.citation(7)).toBeNull();
});
