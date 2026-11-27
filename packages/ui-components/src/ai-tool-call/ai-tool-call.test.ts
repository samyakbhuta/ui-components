import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AiToolCallElement } from "./ai-tool-call.ts";
import "./ai-tool-call.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function mount(html = `<ai-tool-call name="search_web"></ai-tool-call>`) {
  document.body.insertAdjacentHTML("beforeend", html);
  const call = document.body.lastElementChild as AiToolCallElement;
  return {
    call,
    label: () => call.querySelector("[data-part='label']")!,
    summary: () => call.querySelector<HTMLElement>("[data-part='summary']")!,
    section: (part: string) => call.querySelector<HTMLElement>(`pre[data-part='${part}']`),
    announced: () => call.querySelector("[role='status']")!.textContent,
  };
}

test("while running it shimmers, is busy, and announces the start once", () => {
  const { call, label, summary, announced } = mount();

  expect(call.status).toBe("running");
  expect(label().textContent).toBe("Running search_web…");
  expect(label().hasAttribute("data-shimmer")).toBe(true);
  expect(call.hasAttribute("data-running")).toBe(true);
  expect(call.getAttribute("aria-busy")).toBe("true");
  // Nothing to open yet, so the summary isn't a button.
  expect(summary().tagName).toBe("DIV");
  expect(announced()).toBe("");
  vi.advanceTimersByTime(100);
  expect(announced()).toBe("Running search_web…");
});

test("label replaces the running text, and summary the done text", () => {
  const { call, label } = mount(`<ai-tool-call name="search_web" label="Searching the web…"></ai-tool-call>`);
  expect(label().textContent).toBe("Searching the web…");
  call.summary = "Searched 4 sites";
  call.done();
  expect(label().textContent).toBe("Searched 4 sites");
});

test("done(output) stops, announces, and opens to show the input and the result", () => {
  const { call, label, summary, section, announced } = mount();
  call.input = { query: "web components", limit: 3 };
  call.done([{ title: "MDN" }]);

  expect(call.status).toBe("done");
  expect(call.hasAttribute("data-done")).toBe(true);
  expect(call.hasAttribute("aria-busy")).toBe(false);
  expect(label().textContent).toBe("Ran search_web");
  expect(label().hasAttribute("data-shimmer")).toBe(false);
  expect(announced()).toBe("Ran search_web");

  expect(summary().tagName).toBe("SUMMARY");
  expect(call.querySelector("details")!.open).toBe(false);
  expect(section("input")!.textContent).toBe('{\n  "query": "web components",\n  "limit": 3\n}');
  expect(section("input")!.getAttribute("aria-label")).toBe("Input");
  expect(section("output")!.textContent).toBe('[\n  {\n    "title": "MDN"\n  }\n]');
  expect(section("output")!.tabIndex).toBe(0);
});

test("the result isn't shown while it's still running", () => {
  const { call, section } = mount();
  call.input = "SELECT 1";
  call.output = "partial";
  expect(section("input")!.textContent).toBe("SELECT 1");
  expect(section("output")).toBeNull();
});

test("fail(error) shows why, in place of the result", () => {
  const { call, label, section, announced } = mount();
  call.output = "ignored";
  call.fail("Timed out after 30s");

  expect(call.status).toBe("error");
  expect(call.hasAttribute("data-error")).toBe(true);
  expect(label().textContent).toBe("search_web failed");
  expect(announced()).toBe("search_web failed");
  expect(section("error")!.textContent).toBe("Timed out after 30s");
  expect(section("output")).toBeNull();
});

test("a call shown done from the start isn't announced, and text inside is its result", () => {
  const { call, section, announced } = mount(`<ai-tool-call name="read_file" status="done">42 lines</ai-tool-call>`);
  vi.advanceTimersByTime(500);
  expect(announced()).toBe("");
  expect(call.output).toBe("42 lines");
  expect(section("output")!.textContent).toBe("42 lines");
});

test("it stays open, and keeps focus, when it updates", () => {
  const { call, summary } = mount();
  call.input = { path: "a.ts" };
  const details = call.querySelector("details")!;
  details.open = true;
  summary().focus();

  call.done("ok");
  expect(call.querySelector("details")!.open).toBe(true);
  expect(document.activeElement).toBe(summary());
});

test("text from the model is shown as text, never as HTML", () => {
  const { call, section } = mount();
  call.done('<img src=x onerror="alert(1)">');
  expect(section("output")!.textContent).toBe('<img src=x onerror="alert(1)">');
  expect(call.querySelector("img")).toBeNull();
});

test("strings translate every word", () => {
  const { call, label, section } = mount();
  call.strings = { done: (name) => `${name} terminé`, input: "Entrée", output: "Résultat" };
  call.input = { q: 1 };
  call.done("ok");
  expect(label().textContent).toBe("search_web terminé");
  expect(call.querySelector("[data-part='section-label']")!.textContent).toBe("Entrée");
  expect(section("output")!.getAttribute("aria-label")).toBe("Résultat");
});
