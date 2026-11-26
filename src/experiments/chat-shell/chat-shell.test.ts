import { screen, waitFor, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, expect, test } from "vitest";
import type { AiMessageElement } from "../../components/ai-message/ai-message.ts";
import { mountChatShell, suggestions } from "./chat-shell.ts";

const agent = createAgent();
const speech = window as { SpeechRecognition?: unknown };

afterEach(() => {
  delete speech.SpeechRecognition;
  localStorage.clear();
});

async function renderShell(speed = 0) {
  const root = document.createElement("div");
  document.body.append(root);
  mountChatShell(root, { speed });
  await settle();
  const transcript = document.querySelector("ai-transcript")!;
  const users = () => [...transcript.querySelectorAll<AiMessageElement>("ai-message[from='user']")];
  const replies = () => [...transcript.querySelectorAll<AiMessageElement>("ai-message:not([from='user'])")];
  return {
    composer: document.querySelector("ai-composer")!,
    transcript,
    prompt: screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Prompt" }),
    send: () => document.querySelector<HTMLButtonElement>("[data-part='send-button']")!,
    sent: () => users().map((message) => message.text),
    metas: () => users().map((message) => message.querySelector(".message-meta")!.textContent),
    replies,
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
  for (const attribute of ["history", "persist", "paste-as-file", "max-length"]) expect(composer.hasAttribute(attribute)).toBe(true);
});

test("a sent prompt shows with its settings, then a Markdown reply streams in after thinking", async () => {
  const user = userEvent.setup();
  const { prompt, send, sent, metas, replies, idle, transcript } = await renderShell();

  await user.type(prompt, "/explain @package.json");
  await user.click(send());
  expect(sent()).toEqual(["/explain @package.json"]);
  expect(metas()).toEqual(["Auto · Sonnet 5.5 · Thinking: Medium · Command: /explain · References: @package.json"]);
  expect(prompt.value).toBe("");
  expect(transcript.getAttribute("aria-busy")).toBe("true");

  await idle();
  const [reply] = replies();
  const thinking = reply.querySelector("ai-thinking")!;
  expect(thinking.status).toBe("done");
  expect(thinking.reasoning).toBe("Reading @package.json.\nThinking.");
  expect(reply.streaming).toBe(false);
  expect(reply.querySelector("strong")!.textContent).toBe("Sonnet 5.5");
  expect([...reply.querySelectorAll("td")].map((cell) => cell.textContent)).toContain("@package.json");
  expect(within(reply).getByRole("button", { name: "Copy ts code" })).toBeDefined();
  expect(reply.querySelector("blockquote")!.textContent).toContain("like <b>this</b>.");
  expect(reply.querySelector("b")).toBeNull();
  expect(transcript.hasAttribute("aria-busy")).toBe(false);
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
  expect(replies()[0].text).toContain("**Opus 5.5** in *Accept-edits* mode");
});

test("while a reply is coming, Send is Stop and Stop ends it", async () => {
  const user = userEvent.setup();
  const { composer, prompt, send, replies } = await renderShell(1);

  await user.type(prompt, "Long answer please{Enter}");
  expect(composer.busy).toBe(true);
  expect(send().getAttribute("aria-label")).toBe("Stop");
  expect(replies()[0].querySelector("ai-thinking")!.status).toBe("thinking");

  await user.click(send());
  await waitFor(() => expect(composer.busy).toBe(false));
  expect(replies()[0].querySelector("ai-thinking")).toBeNull();
  expect(replies()[0].querySelector(".message-meta")!.textContent).toBe("Stopped");
  expect(send().getAttribute("aria-label")).toBe("Send");
});

test("Retry asks again in place, and Edit puts your prompt back in the box", async () => {
  const user = userEvent.setup();
  const { composer, prompt, replies, idle } = await renderShell();
  composer.thinking = "off";
  await settle();

  await user.type(prompt, "Write a haiku about web components{Enter}");
  await idle();
  const first = replies()[0];
  expect(first.text).toContain("Custom tags bloom");

  await user.click(within(first).getByRole("button", { name: "Retry" }));
  await idle();
  expect(replies()).toHaveLength(1);
  expect(replies()[0]).not.toBe(first);

  const mine = document.querySelector<AiMessageElement>("ai-message[from='user']")!;
  await user.click(within(mine).getByRole("button", { name: "Edit" }));
  expect(prompt.value).toBe("Write a haiku about web components");
  expect(document.activeElement).toBe(prompt);
});

test("a suggestion sends straight away", async () => {
  const user = userEvent.setup();
  const { sent, idle } = await renderShell();
  await user.click(screen.getByRole("button", { name: suggestions[1] }));
  expect(sent()).toEqual([suggestions[1]]);
  await idle();
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
  const { composer, prompt, idle, transcript } = await renderShell();

  await user.type(prompt, "hello{Enter}");
  await idle();
  expect(transcript.querySelectorAll("ai-message")).toHaveLength(2);
  // user-event keeps its own copy of text it typed, so set the next prompt through the element.
  composer.value = "/clear";
  await user.keyboard("{Enter}");
  expect(transcript.querySelectorAll("ai-message")).toHaveLength(0);
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
