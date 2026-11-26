import { screen, within } from "@testing-library/dom";
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

async function renderShell() {
  const root = document.createElement("div");
  document.body.append(root);
  mountChatShell(root);
  await settle();
  const messages = () => within(screen.getByRole("region", { name: "Conversation" })).queryAllByRole("listitem");
  return {
    prompt: screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Prompt" }),
    send: screen.getByRole("button", { name: "Send" }),
    messages,
    texts: () => messages().map((item) => item.querySelector("p:not(.message-meta)")?.textContent ?? ""),
    metas: () => messages().map((item) => item.querySelector(".message-meta")!.textContent),
  };
}

test("the composer's controls are named and start on Auto, Sonnet 5.5 and Medium", async () => {
  const { prompt, send, messages } = await renderShell();

  expect(prompt.value).toBe("");
  expect(send.getAttribute("type")).toBe("submit");
  expect(screen.getByRole("radiogroup", { name: "Mode" })).toBeDefined();
  expect(screen.getAllByRole("radio").map((radio) => [radio.textContent, radio.getAttribute("aria-checked")])).toEqual([
    ["Auto", "true"],
    ["Plan", "false"],
    ["Accept-edits", "false"],
  ]);
  expect(screen.getByRole("combobox", { name: "Model" }).textContent).toContain("Sonnet 5.5");
  expect(screen.getByRole("combobox", { name: "Thinking" }).textContent).toContain("Medium");
  expect(screen.getByRole("button", { name: "Attach files" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Voice input" }).getAttribute("aria-pressed")).toBe("false");
  expect(messages()).toHaveLength(0);
});

test("Send adds the prompt with its settings, empties the box and keeps focus there", async () => {
  const user = userEvent.setup();
  const { prompt, send, texts, metas } = await renderShell();

  await user.type(prompt, "Explain web components");
  await user.click(send);

  expect(texts()).toEqual(["Explain web components"]);
  expect(metas()).toEqual(["Auto · Sonnet 5.5 · Thinking: Medium"]);
  expect(prompt.value).toBe("");
  expect(document.activeElement).toBe(prompt);
});

test("Enter sends, Shift+Enter adds a line, and an empty box sends nothing", async () => {
  const user = userEvent.setup();
  const { prompt, messages, texts } = await renderShell();

  await user.click(prompt);
  await user.keyboard("{Enter}");
  expect(messages()).toHaveLength(0);

  await user.keyboard("first{Shift>}{Enter}{/Shift}second{Enter}");
  expect(texts()).toEqual(["first\nsecond"]);
});

test("the chosen mode, model and thinking level go with the prompt", async () => {
  const user = userEvent.setup();
  const { prompt, metas } = await renderShell();

  await user.click(screen.getByRole("radio", { name: "Plan" }));
  await user.keyboard("{ArrowRight}");
  expect(screen.getByRole("radio", { name: "Accept-edits" }).getAttribute("aria-checked")).toBe("true");
  const [model, thinking] = document.querySelectorAll("ui-select");
  model.api.setValue("opus-5.5");
  thinking.api.setValue("off");
  await settle();

  await user.type(prompt, "Ship it{Enter}");
  expect(metas()).toEqual(["Accept-edits · Opus 5.5 · Thinking: Off"]);
});

// jsdom never reports a trigger match while typing, so typing into the list is checked in a real browser.
test("/ offers commands at the start of the prompt and @ offers files and docs", async () => {
  await renderShell();
  const [slash, at] = document.querySelector("ui-trigger-menu")!.triggers!;
  const labels = (items: unknown) =>
    (items as { label: string; items?: unknown[] }[]).map((item) =>
      item.items ? `${item.label}: ${item.items.join(", ")}` : item.label,
    );

  expect(slash).toMatchObject({ char: "/", boundary: "start" });
  expect(labels(slash.items)).toEqual(["summarize", "explain", "translate", "clear"]);
  expect(at.char).toBe("@");
  expect(labels(at.items)).toEqual([
    "Files: README.md, package.json, src/main.ts, src/components/app-root.ts",
    "Docs: llms.txt, trigger-menu.md, button.md",
  ]);
});

test("a sent prompt notes its command and the files it references", async () => {
  const user = userEvent.setup();
  const { prompt, send, metas } = await renderShell();

  await user.type(prompt, "/explain @package.json and @llms.txt");
  await user.click(send);

  expect(metas()).toEqual(["Auto · Sonnet 5.5 · Thinking: Medium · Command: /explain · References: @package.json, @llms.txt"]);
});

test("attached files show, can be removed, go with the prompt and clear after sending", async () => {
  const user = userEvent.setup();
  const { prompt, messages, metas } = await renderShell();
  const attachments = document.querySelector("ui-file-input")!;

  attachments.api.addFiles([new File(["a"], "notes.txt"), new File(["b"], "chart.png")]);
  await settle();
  const list = screen.getByRole("list", { name: "Attachments" });
  expect(within(list).getAllByRole("listitem").map((item) => item.querySelector('[data-file="name"]')!.textContent)).toEqual([
    "notes.txt",
    "chart.png",
  ]);

  attachments.api.removeFile(attachments.api.getValue()[1]);
  await settle();
  await user.type(prompt, "{Enter}");
  expect(messages()).toHaveLength(1);
  expect(metas()).toEqual(["Auto · Sonnet 5.5 · Thinking: Medium · Attached: notes.txt"]);
  expect(attachments.api.getValue()).toHaveLength(0);
});

test("/clear empties the conversation", async () => {
  const user = userEvent.setup();
  const { prompt, send, messages } = await renderShell();

  await user.type(prompt, "hello");
  await user.click(send);
  expect(messages()).toHaveLength(1);
  // user-event keeps its own copy of text it typed, so set the next prompt through the field.
  document.querySelector("ui-textarea")!.api.setValue("/clear");
  await user.keyboard("{Enter}");

  expect(messages()).toHaveLength(0);
  expect(prompt.value).toBe("");
});

test("voice input adds what was said to the prompt and turns off when listening ends", async () => {
  const user = userEvent.setup();
  let session: { onresult: (event: unknown) => void; onend: () => void } | undefined;
  speech.SpeechRecognition = class {
    start() {
      session = this as never;
    }
    stop() {}
  };
  const { prompt } = await renderShell();
  const voice = screen.getByRole("button", { name: "Voice input" });

  await user.type(prompt, "Draft:");
  await user.click(voice);
  expect(voice.getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelector(".voice-status")!.textContent).toBe("Listening…");

  session!.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: " hello there " }], { isFinal: true })] });
  session!.onend();
  await settle();

  expect(prompt.value).toBe("Draft: hello there");
  expect(voice.getAttribute("aria-pressed")).toBe("false");
  expect(document.querySelector(".voice-status")!.textContent).toBe("");
});

test("voice input is disabled where the browser can't recognize speech", async () => {
  await renderShell();
  const voice = screen.getByRole("button", { name: "Voice input" });

  expect(voice.hasAttribute("disabled") || voice.getAttribute("aria-disabled") === "true").toBe(true);
  expect(voice.title).toBe("Voice input isn't supported in this browser");
});

test("an agent can set the mode, model and thinking level, write a prompt and send it", async () => {
  const { prompt, texts, metas } = await renderShell();

  const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more");
  for (const entry of components) {
    expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
  }
  const labels = components.map((entry) => entry.label);
  for (const label of ["Mode", "Prompt", "Model", "Thinking", "Attach files", "Send"]) {
    expect(labels, `${label} is missing from the snapshot`).toContain(label);
  }
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
  expect(texts()).toEqual(["/summarize @README.md"]);
  expect(metas()).toEqual(["Plan · Haiku 5.5 · Thinking: High · Command: /summarize · References: @README.md"]);
  expect(prompt.value).toBe("");
});
