// Type tests for `@samyakbhuta/ui-components/svelte`: what svelte-check checks markup against.
import type {} from "@samyakbhuta/ui-components/svelte";
import type { SvelteHTMLElements } from "svelte/elements";

export const composer: SvelteHTMLElements["ai-composer"] = {
  attachments: true,
  history: true,
  "max-length": 8000,
  class: "composer",
  onpromptsubmit: (event) => event.detail.text,
  onclick: (event) => event.currentTarget.focus(),
};
export const message: SvelteHTMLElements["ai-message"] = {
  from: "assistant",
  actions: "copy retry",
  onmessageaction: (event) => event.detail,
};
export const sources: SvelteHTMLElements["ai-sources"] = { sources: [{ title: "MDN", url: "https://developer.mozilla.org" }], max: 2 };

// @ts-expect-error status takes running, done or error
export const badToolCall: SvelteHTMLElements["ai-tool-call"] = { status: "finished" };
// @ts-expect-error the detail of suggestionselect has no `text`
export const badSuggestions: SvelteHTMLElements["ai-suggestions"] = { onsuggestionselect: (event) => event.detail.text };
