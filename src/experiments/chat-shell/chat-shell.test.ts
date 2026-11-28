import { screen, waitFor, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AiMessageElement } from "@samyakbhuta/ui-components/ai-message";
import { mountChatShell, suggestions } from "./chat-shell.ts";
import { ChatStore } from "./chat-store.ts";

const agent = createAgent();
const speech = window as { SpeechRecognition?: unknown };
const cleanups: (() => void)[] = [];

beforeEach(() => {
  history.replaceState(null, "", "/experiments/chat-shell.html");
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  delete speech.SpeechRecognition;
  localStorage.clear();
});

async function renderShell(speed = 0) {
  const root = document.createElement("div");
  document.body.append(root);
  cleanups.push(mountChatShell(root, { speed }));
  await settle();
  const transcript = root.querySelector("ai-transcript")!;
  const list = root.querySelector("ai-chat-list")!;
  const users = () => [...transcript.querySelectorAll<AiMessageElement>("ai-message[from='user']")];
  const replies = () => [...transcript.querySelectorAll<AiMessageElement>("ai-message:not([from='user'])")];
  return {
    root,
    composer: root.querySelector("ai-composer")!,
    transcript,
    list,
    heading: () => root.querySelector("h1")!.textContent,
    prompt: within(root).getByRole<HTMLTextAreaElement>("textbox", { name: "Prompt" }),
    send: () => root.querySelector<HTMLButtonElement>("[data-part='send-button']")!,
    sent: () => users().map((message) => message.text),
    metas: () => users().map((message) => message.querySelector(".message-meta")!.textContent),
    replies,
    chatTitles: () => [...list.querySelectorAll("[data-part='chat']")].map((chat) => chat.textContent),
    idle: () => waitFor(() => expect(root.querySelector("ai-composer")!.busy).toBe(false)),
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
  expect(thinking.reasoning).toBe("Thinking.");
  const read = reply.querySelector("ai-tool-call")!;
  expect(read.status).toBe("done");
  expect(read.name).toBe("read_file");
  expect(read.input).toEqual({ path: "package.json" });
  expect(read.querySelector("[data-part='label']")!.textContent).toBe("Read package.json");
  expect(reply.querySelector("strong")!.textContent).toBe("Sonnet 5.5");
  expect([...reply.querySelectorAll("td")].map((cell) => cell.textContent)).toContain("@package.json");
  expect(within(reply).getByRole("button", { name: "Copy ts code" })).toBeDefined();
  expect(reply.querySelector("blockquote")!.textContent).toContain("like <b>this</b>.");
  expect(transcript.hasAttribute("aria-busy")).toBe(false);
});

test("code in replies is coloured", async () => {
  const user = userEvent.setup();
  const { prompt, replies, idle } = await renderShell();
  await user.type(prompt, "Show me{Enter}");
  await idle();
  const [ts, bash] = replies()[0].querySelectorAll("pre code");
  const keywords = [...ts.querySelectorAll("[data-token='keyword']")].map((token) => token.textContent);
  expect(keywords).toEqual(expect.arrayContaining(["async", "const", "for", "await", "of"]));
  expect(ts.querySelector("[data-token='string']")!.textContent).toBe('"promptsubmit"');
  expect(bash.querySelector("[data-token='function']")!.textContent).toBe("npm");
  expect(bash.querySelector("[data-token='comment']")!.textContent).toBe("# opens http://localhost:5173");
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
  expect(send().getAttribute("aria-label")).toBe("Send message");
});

test("Retry asks again in place, and Edit puts your prompt back in the box", async () => {
  const user = userEvent.setup();
  const { composer, prompt, replies, idle, root } = await renderShell();
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

  const mine = root.querySelector<AiMessageElement>("ai-message[from='user']")!;
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
  const mine = document.querySelector<AiMessageElement>("ai-message[from='user']")!;
  expect(within(within(mine).getByRole("list", { name: "Attachments" })).getByRole("listitem").textContent).toBe("notes.txt1 B");
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

test("a chat is saved after its first message, gets a link and shows in the list", async () => {
  const user = userEvent.setup();
  const { prompt, idle, list, heading, chatTitles } = await renderShell();
  expect(heading()).toBe("New chat");
  expect(chatTitles()).toEqual([]);
  expect(within(list).getByRole("button", { name: "New chat" })).toBeDefined();

  await user.type(prompt, "Explain   web components\nplease{Enter}");
  await idle();
  const [saved] = new ChatStore().list();
  expect(saved.title).toBe("Explain web components");
  expect(saved.messages.map((message) => message.from)).toEqual(["user", "assistant"]);
  expect(saved.messages[1].thinking!.reasoning).toBe("Thinking.");
  expect(location.hash).toBe(`#chat/${saved.id}`);
  expect(heading()).toBe("Explain web components");
  expect(document.title).toBe("Explain web components · AI chat");
  expect(chatTitles()).toEqual(["Explain web components"]);
  expect(within(list).getByRole("link", { name: "Open Explain web components" }).getAttribute("aria-current")).toBe("page");
});

test("New chat starts empty, and an older chat opens again from the list with its messages", async () => {
  const user = userEvent.setup();
  const { composer, prompt, idle, list, heading, chatTitles, sent, replies, transcript } = await renderShell();
  composer.thinking = "low";
  await settle();
  await user.type(prompt, "First question{Enter}");
  await idle();

  await user.click(within(list).getByRole("button", { name: "New chat" }));
  await settle();
  expect(transcript.querySelectorAll("ai-message")).toHaveLength(0);
  expect(heading()).toBe("New chat");
  expect(location.hash).toBe("");

  // user-event keeps its own copy of text it typed, so set the next prompt through the element.
  composer.value = "Second question";
  await user.click(prompt);
  await user.keyboard("{Enter}");
  await idle();
  expect(chatTitles()).toEqual(["Second question", "First question"]);

  await user.click(within(list).getByRole("link", { name: "Open First question" }));
  await waitFor(() => expect(heading()).toBe("First question"));
  expect(sent()).toEqual(["First question"]);
  const reply = replies()[0];
  expect(reply.text).toContain("pretend reply");
  const thinking = reply.querySelector("ai-thinking")!;
  expect(thinking.status).toBe("done");
  expect(thinking.querySelector("[data-part='label']")!.textContent).toMatch(/^Thought for \d+s$/);

  // Retry still knows what was asked.
  await user.click(within(reply).getByRole("button", { name: "Retry" }));
  await idle();
  expect(replies()).toHaveLength(1);
  expect(replies()[0]).not.toBe(reply);
});

test("a reload brings the chats back, and the link opens its chat", async () => {
  const user = userEvent.setup();
  const first = await renderShell();
  await user.type(first.prompt, "Remember me{Enter}");
  await first.idle();
  const link = location.hash;
  for (const cleanup of cleanups.splice(0)) cleanup();
  first.root.remove();

  const second = await renderShell();
  await waitFor(() => expect(second.heading()).toBe("Remember me"));
  expect(location.hash).toBe(link);
  expect(second.sent()).toEqual(["Remember me"]);
  expect(second.replies()).toHaveLength(1);
  expect(second.chatTitles()).toEqual(["Remember me"]);
});

test("leaving a chat mid-reply stops the reply and saves it as stopped", async () => {
  const user = userEvent.setup();
  const { prompt, list, composer, transcript } = await renderShell(1);
  await user.type(prompt, "Take your time{Enter}");
  expect(composer.busy).toBe(true);

  await user.click(within(list).getByRole("button", { name: "New chat" }));
  await waitFor(() => expect(transcript.querySelectorAll("ai-message")).toHaveLength(0));
  expect(composer.busy).toBe(false);
  const [saved] = new ChatStore().list();
  expect(saved.messages.map((message) => [message.from, message.meta])).toEqual([
    ["user", "Auto · Sonnet 5.5 · Thinking: Medium"],
    ["assistant", "Stopped"],
  ]);
});

test("Export downloads the chat as Markdown, from the header or the list", async () => {
  const user = userEvent.setup();
  const blobs: Blob[] = [];
  const names: string[] = [];
  Object.assign(URL, {
    createObjectURL: (blob: Blob) => (blobs.push(blob), "blob:chat"),
    revokeObjectURL: () => {},
  });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download);
  });
  try {
    const { prompt, idle, root, list, composer } = await renderShell();
    const exportButton = within(root).getByRole("button", { name: "Export as Markdown" });
    expect(exportButton.hasAttribute("disabled")).toBe(true);
    composer.thinking = "off";
    await settle();
    await user.type(prompt, "Write a haiku about web components{Enter}");
    await idle();

    await user.click(exportButton);
    expect(names).toEqual(["write-a-haiku-about-web-components.md"]);
    const markdown = await blobs[0].text();
    expect(markdown).toContain("# Write a haiku about web components");
    expect(markdown).toMatch(/\*\*You\*\* · [^\n]*\d:\d\d[^\n]* · Auto · Sonnet 5\.5 · Thinking: Off\n\nWrite a haiku about web components/);
    expect(markdown).toMatch(/\*\*Assistant\*\* · Sonnet 5\.5 · [^\n]*\d:\d\d[^\n]*\n\nCustom tags bloom —/);

    await user.click(within(list).getByRole("button", { name: "Options for Write a haiku about web components" }));
    await user.click(within(list).getByRole("menuitem", { name: "Export as Markdown" }));
    expect(names).toHaveLength(2);
  } finally {
    click.mockRestore();
    // download() frees the URL a second later, so leave a harmless stand-in for that.
    Object.assign(URL, { createObjectURL: undefined, revokeObjectURL: () => {} });
  }
});

test("renaming in the list renames the chat, and deleting the open chat starts a new one", async () => {
  const user = userEvent.setup();
  const { prompt, idle, list, heading, chatTitles, transcript } = await renderShell();
  await user.type(prompt, "Old name{Enter}");
  await idle();

  await user.click(within(list).getByRole("button", { name: "Options for Old name" }));
  await user.click(within(list).getByRole("menuitem", { name: "Rename" }));
  const input = await waitFor(() => within(list).getByRole<HTMLInputElement>("textbox", { name: "Chat name" }));
  await waitFor(() => expect(document.activeElement).toBe(input));
  await user.clear(input);
  await user.type(input, "New name{Enter}");
  expect(heading()).toBe("New name");
  expect(new ChatStore().list()[0].title).toBe("New name");

  await user.click(within(list).getByRole("button", { name: "Options for New name" }));
  await user.click(within(list).getByRole("menuitem", { name: "Delete" }));
  await user.click(within(await waitFor(() => within(list).getByRole("alertdialog"))).getByRole("button", { name: "Delete forever" }));
  await waitFor(() => expect(heading()).toBe("New chat"));
  expect(chatTitles()).toEqual([]);
  expect(transcript.querySelectorAll("ai-message")).toHaveLength(0);
  expect(new ChatStore().list()).toEqual([]);
});

test("an agent can set the mode, model and thinking level, write a prompt and send it", async () => {
  const { sent, metas, idle } = await renderShell();

  const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more");
  for (const entry of components) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
  const labels = components.map((entry) => entry.label);
  for (const label of ["Mode", "Prompt", "Model", "Thinking", "Attach files", "Send message", "New chat"]) expect(labels).toContain(label);
  expect(labels).not.toContain("Voice input");

  const result = await agent.act({
    steps: [
      { ref: "Mode", action: "setValue", args: ["Plan"] },
      { ref: "Model", action: "setValue", args: ["Haiku 5.5"] },
      { ref: "Thinking", action: "setValue", args: ["High"] },
      { ref: "Prompt", action: "setValue", args: ["/summarize @README.md"] },
      { ref: "Send message", action: "press" },
    ],
  });
  expect(result.ok, result.error?.message).toBe(true);
  expect(sent()).toEqual(["/summarize @README.md"]);
  expect(metas()).toEqual(["Plan · Haiku 5.5 · Thinking: High · Command: /summarize · References: @README.md"]);
  await idle();
});

test("Retry keeps the earlier reply as a version, and the arrows step back to it", async () => {
  const user = userEvent.setup();
  const { composer, prompt, replies, idle } = await renderShell();
  composer.thinking = "off";
  await settle();
  await user.type(prompt, "Write a haiku about web components{Enter}");
  await idle();
  const first = replies()[0];

  await user.click(within(first).getByRole("button", { name: "Retry" }));
  await idle();
  const reply = replies()[0];
  expect(reply).not.toBe(first);
  expect(reply.versions).toBe(2);
  expect(within(reply).getByRole("group", { name: "Version 2 of 2" })).toBeDefined();
  await user.click(within(reply).getByRole("button", { name: "Previous version" }));
  expect(reply.version).toBe(1);
  expect(reply.text).toBe(first.text);
  const [saved] = new ChatStore().list();
  expect(saved.messages[1].versions).toHaveLength(2);
  expect(saved.messages[1].version).toBe(1);
});

test("a reply can be rated, and the rating is saved", async () => {
  const user = userEvent.setup();
  const { composer, prompt, replies, idle } = await renderShell();
  composer.thinking = "off";
  await settle();
  await user.type(prompt, "hello{Enter}");
  await idle();
  await user.click(within(replies()[0]).getByRole("button", { name: "Good response" }));
  expect(new ChatStore().list()[0].messages[1].feedback).toBe("good");
});

test("a reply that fails keeps what arrived, shows an error, and Retry tries again", async () => {
  const user = userEvent.setup();
  const { composer, replies, idle } = await renderShell();
  composer.thinking = "off";
  await settle();
  await user.click(screen.getByRole("button", { name: suggestions[3] }));
  await idle();
  const [reply] = replies();
  expect(reply.error).toBe("The connection dropped. Press Retry to try again.");
  expect(reply.text.length).toBeGreaterThan(0);
  expect(new ChatStore().list()[0].messages[1].error).toBe(reply.error);
});

test("an older version hides the newest one's tool calls, and the newest shows them again", async () => {
  const user = userEvent.setup();
  const { composer, prompt, replies, idle } = await renderShell();
  composer.thinking = "off";
  await settle();
  await user.type(prompt, "/explain @package.json");
  await user.keyboard("{Enter}");
  await idle();
  await user.click(within(replies()[0]).getByRole("button", { name: "Retry" }));
  await idle();
  const reply = replies()[0];
  const calls = () => [...reply.querySelectorAll("ai-tool-call")].map((call) => call.hidden);
  expect(calls()).toEqual([false]);
  await user.click(within(reply).getByRole("button", { name: "Previous version" }));
  expect(calls()).toEqual([true]);
  await user.click(within(reply).getByRole("button", { name: "Next version" }));
  expect(calls()).toEqual([false]);
});

test("a reply that cites sources links its markers to them, and saves and exports them", async () => {
  const user = userEvent.setup();
  const { composer, replies, idle } = await renderShell();
  composer.thinking = "off";
  await settle();
  await user.click(screen.getByRole("button", { name: suggestions[4] }));
  await idle();
  const [reply] = replies();
  expect(within(reply).getByRole("link", { name: "Source 1: Web components" })).toBeDefined();
  expect(within(reply).getByRole("list", { name: "Sources" })).toBeDefined();
  const [saved] = new ChatStore().list();
  expect(saved.messages[1].sources).toHaveLength(3);
});

test("the newest reply offers follow-up questions, and one sends", async () => {
  const user = userEvent.setup();
  const { composer, prompt, sent, replies, idle } = await renderShell();
  composer.thinking = "off";
  await settle();
  await user.type(prompt, "Write a haiku about web components{Enter}");
  await idle();
  const offer = within(replies()[0]).getByRole("list", { name: "Follow-up questions" });
  await user.click(within(offer).getByRole("button", { name: "Write another one" }));
  await idle();
  expect(sent()).toEqual(["Write a haiku about web components", "Write another one"]);
  // Only the newest reply keeps its follow-ups.
  expect(replies()[0].querySelector("ai-suggestions")).toBeNull();
  expect(replies()[1].querySelector("ai-suggestions")).not.toBeNull();
});

test("planning a trip asks questions with choices, each answer sends, and the chat saves and exports them", async () => {
  const user = userEvent.setup();
  const { composer, sent, replies, idle } = await renderShell();
  composer.thinking = "off";
  await settle();
  await user.click(screen.getByRole("button", { name: suggestions[5] }));
  await idle();
  expect(replies()[0].querySelector("ai-suggestions")).toBeNull();
  const first = within(replies()[0]).getByRole("radiogroup", { name: "Which city should the trip start in?" });
  await user.click(within(first).getByRole("radio", { name: "Rome" }));
  await user.click(within(replies()[0]).getByRole("button", { name: "Send answer" }));
  await idle();
  expect(replies()[1].text).toContain("Rome it is.");

  const second = within(replies()[1]).getByRole("group", { name: "What would you like to do there?" });
  await user.click(within(second).getByRole("checkbox", { name: "Food" }));
  await user.type(within(replies()[1]).getByRole("textbox", { name: "Your own answer" }), "Hiking{Enter}");
  await idle();
  expect(sent()).toEqual(["Plan a weekend trip for me", "Rome", "Food, Hiking"]);
  expect(replies()[2].text).toContain("## A weekend in Rome");

  const [saved] = new ChatStore().list();
  expect(saved.messages[1].question?.answer).toEqual({ value: "Rome", labels: ["Rome"], other: null });
  expect(saved.messages[3].question?.answer).toEqual({ value: ["Food", "Hiking"], labels: ["Food", "Hiking"], other: "Hiking" });
  const { chatToMarkdown } = await import("./chat-store.ts");
  const markdown = chatToMarkdown(saved);
  expect(markdown).toContain("**Which city should the trip start in?**\n\n- [ ] Paris\n- [x] Rome\n- [ ] Lisbon\n- [ ] Other\n\n*Answered: Rome*");
  expect(markdown).toContain("- [x] Other: Hiking");
});

test("a saved chat shows its questions answered, and an open one can still be answered", async () => {
  const user = userEvent.setup();
  const first = await renderShell();
  first.composer.thinking = "off";
  await settle();
  await user.click(screen.getByRole("button", { name: suggestions[5] }));
  await first.idle();
  cleanups.splice(0).forEach((cleanup) => cleanup());
  document.body.replaceChildren();

  const again = await renderShell();
  again.composer.thinking = "off";
  const [chat] = new ChatStore().list();
  history.replaceState(null, "", `#chat/${chat.id}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
  await settle();
  const question = again.replies()[0].querySelector("ai-question")!;
  expect(question.hasAttribute("answered")).toBe(false);
  await user.click(within(question).getByRole("button", { name: "Skip" }));
  await again.idle();
  expect(again.sent()).toEqual(["Plan a weekend trip for me", "Surprise me"]);
  expect(again.replies()[1].text).toContain("Lisbon it is.");
  expect(new ChatStore().list()[0].messages[1].question?.answer).toEqual({ skipped: true });
});

test("while a question waits, the box, the list and a background tab say so, and typing answers it", async () => {
  const user = userEvent.setup();
  const { composer, prompt, sent, replies, list, idle } = await renderShell();
  composer.thinking = "off";
  await settle();
  await user.click(screen.getByRole("button", { name: suggestions[5] }));
  await idle();
  expect(prompt.placeholder).toBe("Answer the question above, or type your answer");
  expect(within(list).getByRole("link", { name: "Open Plan a weekend trip for me", description: "Needs your answer" })).toBeDefined();

  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(document.title).toBe("Waiting for you · Plan a weekend trip for me · AI chat");
  hidden.mockReturnValue(false);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(document.title).toBe("Plan a weekend trip for me · AI chat");
  hidden.mockRestore();

  // Typing a choice's name in the box chooses it, rather than starting something new.
  await user.type(prompt, "rome{Enter}");
  await idle();
  expect(sent()).toEqual(["Plan a weekend trip for me", "rome"]);
  const first = replies()[0].querySelector("ai-question")!;
  expect(first.answer).toEqual({ value: "Rome", labels: ["Rome"], other: null });
  expect(replies()[1].text).toContain("Rome it is.");

  // Anything else is an answer of one's own.
  // user-event keeps its own copy of text it typed, so set the next answer through the element.
  composer.value = "Street art";
  await user.click(prompt);
  await user.keyboard("{Enter}");
  await idle();
  expect(replies()[1].querySelector("ai-question")!.answer).toEqual({ value: ["Street art"], labels: ["Street art"], other: "Street art" });
  expect(replies()[2].text).toContain("street art");
  expect(prompt.placeholder).toBe("Ask anything…");
  expect(within(list).getByRole("link", { name: "Open Plan a weekend trip for me" }).hasAttribute("aria-describedby")).toBe(false);
});

test("cleaning up asks for approval first; Allow once runs the command and the chat saves the decision", async () => {
  const user = userEvent.setup();
  const { composer, prompt, sent, replies, list, idle } = await renderShell();
  composer.thinking = "off";
  await settle();
  await user.click(screen.getByRole("button", { name: suggestions[6] }));
  await idle();
  const approval = replies()[0].querySelector("ai-approval")!;
  expect(within(document.body).getByRole("group", { name: "Run a command", description: "Waiting for your approval" })).toBe(approval);
  expect(approval.querySelector("[data-part='input']")!.textContent).toBe("rm -rf dist");
  expect(prompt.placeholder).toBe("Allow or deny above, or tell it what to do instead");
  // What's typed now denies it, so an agent's Send asks the person first.
  const sendButton = composer.querySelector<HTMLElement>("[data-part='send']")!;
  expect(sendButton.dataset.agentConfirm).toBe("Denies run_command, and tells it what's typed instead");
  expect(within(list).getByRole("link", { name: "Open Clean up my project's build folder", description: "Needs your approval" })).toBeDefined();
  // Nothing has run yet.
  expect(replies()[0].querySelector("ai-tool-call")).toBeNull();

  await user.click(within(approval).getByRole("button", { name: "Allow once" }));
  await idle();
  // The agent carries on in a new reply, without a message from you.
  expect(sent()).toEqual(["Clean up my project's build folder"]);
  const call = replies()[1].querySelector("ai-tool-call")!;
  expect(call.status).toBe("done");
  expect(call.summary).toBe("Ran rm -rf dist");
  expect(replies()[1].text).toContain("The build folder is gone");
  expect(prompt.placeholder).toBe("Ask anything…");
  expect(sendButton.hasAttribute("data-agent-confirm")).toBe(false);

  const [saved] = new ChatStore().list();
  expect(saved.messages[1].approval?.decision).toEqual({ decision: "allow", reason: null });
  const { chatToMarkdown } = await import("./chat-store.ts");
  expect(chatToMarkdown(saved)).toContain("**Run a command** · `run_command`\n\n```\nrm -rf dist\n```\n\n*Allowed once.*");
});

test("Always allow skips the approval next time in that chat; Deny and typing in the box stop it", async () => {
  const user = userEvent.setup();
  const { composer, prompt, sent, replies, idle } = await renderShell();
  composer.thinking = "off";
  await settle();
  await user.click(screen.getByRole("button", { name: suggestions[6] }));
  await idle();
  await user.click(within(replies()[0]).getByRole("button", { name: "Always allow" }));
  await idle();
  expect(new ChatStore().list()[0].allowed).toEqual(["run_command"]);

  // Asked again in the same chat, it runs straight away and says why.
  await user.type(prompt, "Clean up again{Enter}");
  await idle();
  const again = replies()[2];
  expect(again.querySelector("ai-approval")).toBeNull();
  expect(again.querySelector("ai-tool-call")!.status).toBe("done");
  expect(again.querySelector(".message-meta")!.textContent).toBe("Allowed without asking: you chose Always allow for run_command");

  // In a new chat it asks again; Deny with a reason, from the card.
  await user.click(screen.getByRole("button", { name: "New chat" }));
  await settle();
  composer.value = "Clean up my project's build folder";
  await user.click(prompt);
  await user.keyboard("{Enter}");
  await idle();
  const approval = replies()[0].querySelector("ai-approval")!;
  await user.type(within(approval).getByRole("textbox", { name: "What should it do instead?" }), "Only clear dist/cache{Enter}");
  await idle();
  expect(approval.querySelector("[data-part='decision']")!.textContent).toBe("Denied. Instead, you suggested: “Only clear dist/cache”");
  expect(replies()[1].querySelector("ai-tool-call")).toBeNull();
  expect(replies()[1].text).toContain("You suggested instead: *Only clear dist/cache*.");
  const { chatToMarkdown } = await import("./chat-store.ts");
  expect(chatToMarkdown(new ChatStore().list()[0])).toContain("*Denied. Instead, you suggested: “Only clear dist/cache”*");

  // Typing in the message box while it asks denies it, with what was typed.
  composer.value = "Clean up my project's build folder";
  await user.click(prompt);
  await user.keyboard("{Enter}");
  await idle();
  composer.value = "Wait, back it up first";
  await user.click(prompt);
  await user.keyboard("{Enter}");
  await idle();
  expect(sent().slice(-2)).toEqual(["Clean up my project's build folder", "Wait, back it up first"]);
  expect(replies()[2].querySelector("ai-approval")!.decision).toEqual({ decision: "deny", reason: "Wait, back it up first" });
  expect(replies()[3].text).toContain("You suggested instead: *Wait, back it up first*.");
});
