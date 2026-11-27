import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, expect, test, vi } from "vitest";
import "../ai-composer/ai-composer.ts";
import type { AiComposerElement } from "../ai-composer/ai-composer.ts";
import "./ai-suggestions.ts";
import type { AiSuggestionsElement } from "./ai-suggestions.ts";

afterEach(() => document.body.replaceChildren());

async function mount(markup: string) {
  document.body.insertAdjacentHTML("beforeend", markup);
  await settle();
  const suggestions = document.querySelector("ai-suggestions") as AiSuggestionsElement;
  const composer = document.querySelector("ai-composer") as AiComposerElement | null;
  return { suggestions, composer };
}

test("each suggestion is a button in a list named \"Suggestions\", from a list written inside", async () => {
  const { suggestions } = await mount(`<ai-suggestions><ul><li>Explain this</li><li>Write a haiku</li></ul></ai-suggestions>`);
  const list = within(suggestions).getByRole("list", { name: "Suggestions" });
  expect(within(list).getAllByRole("button").map((button) => button.textContent)).toEqual(["Explain this", "Write a haiku"]);
});

test("pressing one sends it through the composer named by for", async () => {
  const user = userEvent.setup();
  const { suggestions, composer } = await mount(`<ai-composer id="box"></ai-composer><ai-suggestions for="box"></ai-suggestions>`);
  suggestions.suggestions = ["Write a haiku", { label: "Explain", value: "/explain @README.md", description: "Walks through the README" }];
  await settle();
  const sent = vi.fn();
  const selected = vi.fn();
  composer!.addEventListener("promptsubmit", (event) => sent(event.detail.text));
  suggestions.addEventListener("suggestionselect", (event) => selected(event.detail));

  await user.click(within(suggestions).getByRole("button", { name: /Explain/ }));
  expect(selected).toHaveBeenCalledWith({ value: "/explain @README.md", label: "Explain" });
  expect(sent).toHaveBeenCalledWith("/explain @README.md");
  expect(within(suggestions).getByRole("button", { name: /Explain/ }).textContent).toBe("ExplainWalks through the README");
});

test("action=fill puts it in the box to edit, and focuses the box", async () => {
  const user = userEvent.setup();
  const { suggestions, composer } = await mount(`<ai-composer id="box"></ai-composer><ai-suggestions for="box" action="fill"></ai-suggestions>`);
  suggestions.suggestions = ["Translate this to French"];
  await settle();
  const sent = vi.fn();
  composer!.addEventListener("promptsubmit", sent);
  await user.click(within(suggestions).getByRole("button", { name: "Translate this to French" }));
  expect(composer!.value).toBe("Translate this to French");
  expect(sent).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(composer!.querySelector("textarea"));
});

test("nothing is sent while the composer is busy, when disabled, or when the event is cancelled", async () => {
  const { suggestions, composer } = await mount(`<ai-composer id="box"></ai-composer><ai-suggestions for="box"></ai-suggestions>`);
  suggestions.suggestions = ["Hello"];
  await settle();
  const sent = vi.fn();
  composer!.addEventListener("promptsubmit", sent);

  composer!.busy = true;
  expect(suggestions.select("Hello")).toBe(false);
  composer!.busy = false;

  suggestions.disabled = true;
  await settle();
  expect((within(suggestions).getByRole("button", { name: "Hello" }) as HTMLButtonElement).disabled).toBe(true);
  expect(suggestions.select("Hello")).toBe(false);
  suggestions.disabled = false;

  suggestions.addEventListener("suggestionselect", (event) => event.preventDefault(), { once: true });
  expect(suggestions.select("Hello")).toBe(false);
  expect(sent).not.toHaveBeenCalled();
  expect(suggestions.select("Hello")).toBe(true);
  expect(sent).toHaveBeenCalledOnce();
});

test("without a composer, the event is yours to handle; an empty list hides the element", async () => {
  const { suggestions } = await mount(`<ai-suggestions label="Follow-ups" layout="list"></ai-suggestions>`);
  expect(suggestions.hasAttribute("data-empty")).toBe(true);
  suggestions.suggestions = ["Why?"];
  await settle();
  expect(suggestions.hasAttribute("data-empty")).toBe(false);
  expect(within(suggestions).getByRole("list", { name: "Follow-ups" })).toBeDefined();
  const selected = vi.fn();
  suggestions.addEventListener("suggestionselect", (event) => selected(event.detail.value));
  expect(suggestions.select("Why?")).toBe(true);
  expect(selected).toHaveBeenCalledWith("Why?");
});

test("agents can press a suggestion", async () => {
  const { suggestions } = await mount(`<ai-suggestions></ai-suggestions>`);
  suggestions.suggestions = ["Write a haiku"];
  await settle();
  const selected = vi.fn();
  suggestions.addEventListener("suggestionselect", selected);
  const result = await createAgent().act({ steps: [{ ref: "Write a haiku", action: "press" }] });
  expect(result.ok, result.error?.message).toBe(true);
  expect(selected).toHaveBeenCalledOnce();
});
