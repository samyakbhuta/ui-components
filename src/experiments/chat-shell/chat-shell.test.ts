import { screen, waitFor, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, expect, test } from "vitest";
import { mountChatShell } from "./chat-shell.ts";

const agent = createAgent();
const speech = window as { SpeechRecognition?: unknown };

afterEach(() => {
  delete speech.SpeechRecognition;
});

async function renderShell(speed = 0) {
  const root = document.createElement("div");
  document.body.append(root);
  mountChatShell(root, { speed });
  await settle();
  const conversation = screen.getByRole("region", { name: "Conversation" });
  const items = (kind: string) => [...conversation.querySelectorAll<HTMLElement>(`.message.${kind}`)];
  return {
    composer: document.querySelector("ai-composer")!,
    conversation,
    prompt: screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Prompt" }),
    send: () => document.querySelector<HTMLButtonElement>("[data-part='send-button']")!,
    sent: () => items("user").map((item) => item.querySelector("p:not(.message-meta)")?.textContent ?? ""),
    metas: () => items("user").map((item) => item.querySelector(".message-meta")!.textContent),
    replies: () => items("reply"),
    idle: () => waitFor(() => expect(document.querySelector("ai-composer")!.busy).toBe(false)),
  };
}

test("the composer has every feature on, starting on Auto, Sonnet 5.5 and Medium", async () => {
  speech.SpeechRecognition = class {};
  const { composer } = await renderShell();

  expect(screen.getAllByRole("radio").map((radio) => [radio.textContent, radio.getAttribute("aria-checked")])).toEqual([
    ["Auto", "true"],
    ["Plan", "false"],
    ["Accept-edits", "false"],
  ]);
  expect(screen.getByRole("combobox", { name: "Model" }).textContent).toContain("Sonnet 5.5");
  expect(screen.getByRole("combobox", { name: "Thinking" }).textContent).toContain("Medium");
  for (const name of ["Attach files", "Voice input"]) expect(screen.getByRole("button", { name })).toBeDefined();
  expect(composer.querySelector("ui-trigger-menu")!.triggers!.map((trigger) => trigger.char)).toEqual(["/", "@"]);
});

test("a sent prompt shows with its settings, then a reply after the thinking indicator", async () => {
  const user = userEvent.setup();
  const { prompt, send, sent, metas, replies, idle } = await renderShell();

  await user.type(prompt, "/explain @package.json");
  await user.click(send());
  expect(sent()).toEqual(["/explain @package.json"]);
  expect(metas()).toEqual(["Auto · Sonnet 5.5 · Thinking: Medium · Command: /explain · References: @package.json"]);
  expect(prompt.value).toBe("");

  await idle();
  const [reply] = replies();
  const thinking = reply.querySelector("ai-thinking")!;
  expect(thinking.status).toBe("done");
  expect(thinking.timer).toBe(true);
  expect(thinking.reasoning).toBe("Reading @package.json.\nThinking.");
  expect(reply.querySelector("p")!.textContent).toBe(
    "This is a pretend reply from Sonnet 5.5 in Auto mode. A real app would send your prompt to the model here and stream its answer.",
  );
});

test("with thinking off the reply comes without the indicator", async () => {
  const user = userEvent.setup();
  const { composer, prompt, replies, idle } = await renderShell();
  composer.thinking = "off";
  composer.mode = "accept-edits";
  composer.model = "opus-5.5";
  await settle();

  await user.type(prompt, "Ship it{Enter}");
  await idle();
  expect(replies()[0].querySelector("ai-thinking")).toBeNull();
  expect(replies()[0].textContent).toContain("Opus 5.5 in Accept-edits mode");
});

test("while a reply is coming, Send is Stop, the conversation is busy, and Stop ends it", async () => {
  const user = userEvent.setup();
  const { composer, conversation, prompt, send, replies } = await renderShell(1);

  await user.type(prompt, "Long answer please{Enter}");
  expect(composer.busy).toBe(true);
  expect(conversation.getAttribute("aria-busy")).not.toBeNull();
  expect(send().getAttribute("aria-label")).toBe("Stop");
  expect(replies()[0].querySelector("ai-thinking")!.status).toBe("thinking");

  await user.click(send());
  await waitFor(() => expect(composer.busy).toBe(false));
  expect(replies()[0].querySelector("ai-thinking")).toBeNull();
  expect(replies()[0].textContent).toBe("Stopped");
  expect(conversation.hasAttribute("aria-busy")).toBe(false);
  expect(send().getAttribute("aria-label")).toBe("Send");
});

test("attached files go with the prompt and the reply looks at them", async () => {
  const user = userEvent.setup();
  const { composer, prompt, metas, replies, idle } = await renderShell();

  composer.addFiles([new File(["a"], "notes.txt")]);
  await settle();
  await user.type(prompt, "{Enter}");
  expect(metas()).toEqual(["Auto · Sonnet 5.5 · Thinking: Medium · Attached: notes.txt"]);
  expect(composer.files).toHaveLength(0);
  await idle();
  expect(replies()[0].querySelector("ai-thinking")!.reasoning).toBe("Looking at notes.txt.\nThinking.");
});

test("/clear empties the conversation", async () => {
  const user = userEvent.setup();
  const { composer, prompt, sent, idle, conversation } = await renderShell();

  await user.type(prompt, "hello{Enter}");
  await idle();
  expect(sent()).toHaveLength(1);
  // user-event keeps its own copy of text it typed, so set the next prompt through the element.
  composer.value = "/clear";
  await user.keyboard("{Enter}");

  expect(within(conversation).queryAllByRole("listitem")).toHaveLength(0);
  expect(conversation.querySelector<HTMLElement>(".transcript-empty")!.hidden).toBe(false);
});

test("an agent can set the mode, model and thinking level, write a prompt and send it", async () => {
  const { sent, metas, idle } = await renderShell();

  const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more");
  for (const entry of components) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
  const labels = components.map((entry) => entry.label);
  for (const label of ["Mode", "Prompt", "Model", "Thinking", "Attach files", "Send"]) expect(labels).toContain(label);
  expect(labels).not.toContain("Voice input");

  const result = await agent.act({
    steps: [
      { ref: "Mode", action: "setValue", args: ["Plan"] },
      { ref: "Model", action: "setValue", args: ["Haiku 5.5"] },
      { ref: "Thinking", action: "setValue", args: ["High"] },
      { ref: "Prompt", action: "setValue", args: ["/summarize @README.md"] },
      { ref: "Send", action: "press" },
    ],
  });
  expect(result.ok, result.error?.message).toBe(true);
  expect(sent()).toEqual(["/summarize @README.md"]);
  expect(metas()).toEqual(["Plan · Haiku 5.5 · Thinking: High · Command: /summarize · References: @README.md"]);
  await idle();
});
