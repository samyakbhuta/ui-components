// @vitest-environment node
import { expect, test } from "vitest";

test("importing the package on a server, with no DOM, does nothing and doesn't throw", async () => {
  expect(globalThis.HTMLElement).toBeUndefined();
  expect(globalThis.customElements).toBeUndefined();
  const all = await import("./index.ts");
  expect(Object.keys(all)).toEqual(expect.arrayContaining(["AiComposerElement", "AiMessageElement", "renderMarkdown"]));
  for (const entry of ["./ai-composer.ts", "./ai-message.ts", "./ai-transcript.ts", "./ai-thinking.ts", "./ai-tool-call.ts", "./ai-sources.ts", "./ai-suggestions.ts", "./ai-question.ts", "./ai-approval.ts", "./ai-plan.ts", "./ai-chat.ts", "./ai-chat-list.ts", "./highlight.ts"]) {
    await expect(import(entry)).resolves.toBeDefined();
  }
});
