// Type tests for `@samyakbhuta/ui-components/vue`: what vue-tsc checks a template against.
import type {} from "@samyakbhuta/ui-components/vue";
import type { GlobalComponents } from "vue";

type Props<Tag extends keyof GlobalComponents> = InstanceType<GlobalComponents[Tag]>["$props"];
type Emit<Tag extends keyof GlobalComponents> = InstanceType<GlobalComponents[Tag]>["$emit"];

export const composer: Props<"ai-composer"> = {
  attachments: true,
  voice: "hide",
  "max-files": "3",
  "submit-on": "enter",
  class: "composer",
  modes: [{ value: "chat", label: "Chat" }],
};
export const message: Props<"ai-message"> = { from: "user", actions: ["copy", "edit"], feedback: null };
export const suggestions: Props<"ai-suggestions"> = { for: "box", suggestions: ["Hi"], action: "fill" };

declare const emitComposer: Emit<"ai-composer">;
emitComposer("promptsubmit", new CustomEvent("promptsubmit", { detail: { text: "", files: [], references: [] } }));
declare const emitSuggestions: Emit<"ai-suggestions">;
emitSuggestions("suggestionselect", new CustomEvent("suggestionselect", { detail: { value: "a", label: "a" } }));

// @ts-expect-error status takes running, done or error
export const badToolCall: Props<"ai-tool-call"> = { status: "finished" };
// @ts-expect-error layout is chips or list
export const badSuggestions: Props<"ai-suggestions"> = { layout: "grid" };
// @ts-expect-error ai-suggestions fires no promptsubmit
emitSuggestions("promptsubmit", new CustomEvent("promptsubmit"));
