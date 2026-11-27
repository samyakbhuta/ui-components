import "@ui-sdk/web/button";
import "@ui-sdk/web/drawer";
import "@samyakbhuta/ui-components/ai-chat-list";
import "@samyakbhuta/ui-components/ai-composer";
import "@samyakbhuta/ui-components/ai-message";
import "@samyakbhuta/ui-components/ai-thinking";
import "@samyakbhuta/ui-components/ai-tool-call";
import "@samyakbhuta/ui-components/ai-sources";
import "@samyakbhuta/ui-components/ai-suggestions";
import "@samyakbhuta/ui-components/ai-question";
import type { Source } from "@samyakbhuta/ui-components/ai-sources";
import "@samyakbhuta/ui-components/ai-transcript";
import {
  type ComposerCommands,
  type ComposerOption,
  type ComposerReferences,
  defaultModels,
  defaultModes,
  defaultThinkingLevels,
  type PromptSubmitDetail,
} from "@samyakbhuta/ui-components/ai-composer";
import type { AiMessageElement } from "@samyakbhuta/ui-components/ai-message";
import {
  ChatStore,
  chatToMarkdown,
  download,
  markdownFileName,
  newChatId,
  type StoredChat,
  type StoredMessage,
  type StoredPrompt,
  type StoredQuestion,
  type StoredToolCall,
  titleFrom,
} from "./chat-store.ts";

const commands: ComposerCommands = [
  { value: "summarize", label: "summarize" },
  { value: "explain", label: "explain" },
  {
    value: "translate",
    label: "translate",
    arguments: [
      {
        name: "language",
        hint: "<language>",
        required: true,
        items: ["English", "French", "German", "Hindi", "Japanese", "Spanish"],
      },
    ],
  },
  { value: "clear", label: "clear", after: "submit" },
];

const references: ComposerReferences = [
  {
    type: "group",
    label: "Files",
    items: ["README.md", "package.json", "src/main.ts", "src/components/app-root.ts"],
  },
  {
    type: "group",
    label: "Docs",
    items: ["llms.txt", "trigger-menu.md", "button.md"],
  },
];

export const suggestions = [
  "Show me what a reply can look like",
  "/explain @src/main.ts",
  "Write a haiku about web components",
  "Show me a reply that fails",
  "What are web components? Cite your sources",
  "Plan a weekend trip for me",
];

/** Asking to plan a trip makes the pretend model ask questions first, with <ai-question>. */
const planning = (text: string) => /\btrip\b/i.test(text);

/** The questions of the pretend trip planner, by step. */
export const tripQuestions: Record<number, StoredQuestion> = {
  1: {
    step: 1,
    question: "Which city should the trip start in?",
    options: ["Paris", "Rome", { value: "Lisbon", description: "The cheapest flights this month" }],
    other: true,
    skippable: true,
  },
  2: {
    step: 2,
    question: "What would you like to do there?",
    options: ["Museums", "Food", "Beaches", "Nightlife"],
    multiple: true,
    max: 3,
    other: true,
  },
};

/** What the pretend trip planner says at each step: ask, ask again, then plan. */
export function tripReply(step: number, answer: string, city: string) {
  if (step === 1) return "Happy to help plan a weekend away! First, a couple of questions.";
  if (step === 2) return `${city} it is. One more question.`;
  const plans = answer.split(/,\s*/).filter(Boolean);
  return [
    `## A weekend in ${city}`,
    "",
    `**Saturday:** start with ${plans[0]?.toLowerCase() ?? "a walk"} in the morning, then a long lunch.`,
    `**Sunday:** ${plans[1] ? `${plans[1].toLowerCase()} in the afternoon` : "a slow morning"}${plans[2] ? `, and ${plans[2].toLowerCase()} to finish` : ""}.`,
    "",
    "— pretend trip planner",
  ].join("\n");
}

/** Asking for sources makes the pretend model cite these. */
const citing = (text: string) => /\b(?:cite|sources?)\b/i.test(text);

export const pretendSources: Source[] = [
  {
    title: "Web components",
    url: "https://developer.mozilla.org/docs/Web/API/Web_components",
    description: "A suite of technologies for creating reusable custom elements, with their functionality kept away from the rest of your code.",
  },
  {
    title: "Using custom elements",
    url: "https://developer.mozilla.org/docs/Web/API/Web_components/Using_custom_elements",
    description: "How to define a custom element, and the lifecycle callbacks it gets.",
  },
  {
    title: "Custom elements",
    url: "https://html.spec.whatwg.org/multipage/custom-elements.html",
    site: "HTML Standard",
    description: "The specification for defining and upgrading custom elements.",
  },
];

/** Follow-up questions offered under the newest reply. */
const followUps = (detail: PromptSubmitDetail) =>
  /haiku/i.test(detail.text)
    ? ["Write another one", "Make it about shadow DOM"]
    : ["Show me a smaller example", "How do I test this?"];

/** Asking for a failure makes the pretend model stop half way, to show an error. */
const failing = (text: string) => /\bfails?\b/i.test(text);

/** Pretend contents for files people reference with @. */
const pretendFile = (path: string) =>
  path.endsWith(".json")
    ? '{\n  "name": "web-components-app",\n  "type": "module"\n}'
    : path.endsWith(".md")
      ? "# Web components\n\nA showcase of AI chat components built on ui-sdk."
      : 'import "./styles/base.css";\nimport { mountChatShell } from "./experiments/chat-shell/chat-shell.ts";';

/** How long the pretend model thinks at each level, in milliseconds. */
const thinkingTime: Record<string, number> = { off: 0, low: 1500, medium: 3000, high: 5000 };

const labelOf = (options: ComposerOption[], value: unknown) => options.find((option) => option.value === value)?.label ?? "";

const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const icons = {
  chats: icon('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  close: icon('<path d="M18 6 6 18M6 6l12 12"/>'),
  download: icon('<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>'),
  newChat: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
};

/** A pretend reply in Markdown, to show what replies can hold. */
export function pretendReply(detail: PromptSubmitDetail) {
  const model = labelOf(defaultModels, detail.model);
  const mode = labelOf(defaultModes, detail.mode);
  if (citing(detail.text)) {
    return [
      "Web components are a set of browser features for making your own reusable HTML elements [1].",
      "",
      "- **Custom elements** let you define a tag, like `<ai-message>`, and react when it joins or leaves the page [2].",
      "- **Shadow DOM** keeps an element's markup and styles apart from the page's.",
      "- The rules for defining and upgrading elements are in the HTML Standard [3].",
      "",
      `— pretend **${model}**`,
    ].join("\n");
  }
  if (/haiku/i.test(detail.text)) {
    return `Custom tags bloom —\n*shadow roots hold quiet light,*\nslots wait to be filled.\n\n— pretend **${model}**`;
  }
  const rows = [
    ["Mode", mode],
    ["Model", model],
    ["Thinking", labelOf(defaultThinkingLevels, detail.thinking)],
    ...(detail.command ? [["Command", `\`/${detail.command}\``]] : []),
    ...(detail.references.length ? [["References", detail.references.map((reference) => `\`@${reference.label}\``).join(", ")]] : []),
    ...(detail.files.length ? [["Attachments", detail.files.map((file) => file.name).join(", ")]] : []),
  ];
  return [
    `This is a pretend reply from **${model}** in *${mode}* mode. A real app would send your prompt to the model and stream its answer here.`,
    "",
    "### What you sent",
    "",
    "| Setting | Value |",
    "|---|---|",
    ...rows.map(([name, value]) => `| ${name} | ${value} |`),
    "",
    "### Hooking up a real model",
    "",
    "1. Listen for `promptsubmit` on the composer.",
    "2. Stream the answer into an `<ai-message>` with `appendText()`.",
    "3. Call `done()` when it ends.",
    "",
    "```ts",
    'composer.addEventListener("promptsubmit", async (event) => {',
    '  const reply = document.createElement("ai-message");',
    "  reply.streaming = true;",
    "  transcript.append(reply);",
    "  for await (const chunk of streamFromYourServer(event.detail)) reply.appendText(chunk);",
    "  reply.done();",
    "});",
    "```",
    "",
    "Then start the page:",
    "",
    "```bash",
    "npm run dev # opens http://localhost:5173",
    "```",
    "",
    "> Replies are rendered safely: HTML in the text shows as text, like <b>this</b>.",
  ].join("\n");
}

type Options = {
  /** Scales every pretend delay; tests pass 0. */
  speed?: number;
  store?: ChatStore;
};

/** Mounts the chat page. Returns a function that removes its page-wide listeners. */
export function mountChatShell(root: HTMLElement, { speed = 1, store = new ChatStore() }: Options = {}) {
  root.innerHTML = `
    <div class="chat-app">
      <div class="chat-sidebar"></div>
      <div class="chat-shell">
        <header class="chat-header">
          <ui-drawer class="chats-drawer" side="start">
            <ui-drawer-trigger>
              <button type="button" class="header-button" aria-label="Chats" title="Chats">${icons.chats}</button>
            </ui-drawer-trigger>
            <ui-drawer-backdrop class="drawer-backdrop" hidden></ui-drawer-backdrop>
            <ui-drawer-content class="drawer-sheet" hidden>
              <div class="drawer-header">
                <ui-drawer-title class="drawer-title">Chats</ui-drawer-title>
                <ui-drawer-close>
                  <button type="button" class="header-button" aria-label="Close" title="Close">${icons.close}</button>
                </ui-drawer-close>
              </div>
              <div class="drawer-list"></div>
              <a class="drawer-back" href="/showcase.html">← Showcase</a>
            </ui-drawer-content>
          </ui-drawer>
          <a class="back" href="/showcase.html">← Showcase</a>
          <h1 class="chat-title">New chat</h1>
          <div class="header-actions">
            <ui-button class="export-chat" disabled>
              <button type="button" class="header-button" aria-label="Export as Markdown" title="Export as Markdown">${icons.download}</button>
            </ui-button>
            <ui-button class="header-new-chat">
              <button type="button" class="header-button" aria-label="Start a new chat" title="New chat">${icons.newChat}</button>
            </ui-button>
          </div>
        </header>
        <ai-transcript class="transcript">
          <div slot="empty" class="transcript-empty">
            <h2>What can I help with?</h2>
            <p>Type <kbd>/</kbd> for commands or <kbd>@</kbd> to reference a file. Drop or paste files to attach them, and press <kbd>↑</kbd> for earlier prompts.</p>
            <ai-suggestions class="starters" for="chat-composer"></ai-suggestions>
          </div>
        </ai-transcript>
        <ai-composer id="chat-composer" class="composer" attachments voice history persist="chat-shell" paste-as-file max-length="8000"
          default-mode="auto" default-model="sonnet-5.5" default-thinking="medium"></ai-composer>
      </div>
    </div>
  `;

  const page = new AbortController();
  const list = document.createElement("ai-chat-list");
  list.setAttribute("actions", "rename export delete");
  list.href = (chat) => `#chat/${encodeURIComponent(chat.id)}`;
  const sidebar = root.querySelector<HTMLElement>(".chat-sidebar")!;
  const drawer = root.querySelector("ui-drawer")!;
  const drawerList = root.querySelector<HTMLElement>(".drawer-list")!;
  const heading = root.querySelector<HTMLElement>(".chat-title")!;
  const exportButton = root.querySelector<HTMLElementTagNameMap["ui-button"]>(".export-chat")!;
  const transcript = root.querySelector("ai-transcript")!;
  const composer = root.querySelector("ai-composer")!;
  composer.modes = defaultModes;
  composer.models = defaultModels;
  composer.thinkingLevels = defaultThinkingLevels;
  composer.commands = commands;
  composer.references = references;
  root.querySelector("ai-suggestions")!.suggestions = suggestions;

  // On narrow screens the chat list lives in a drawer; on wide ones, in the sidebar.
  const narrow = window.matchMedia?.("(max-width: 52rem)");
  const placeList = () => {
    const target = narrow?.matches ? drawerList : sidebar;
    if (list.parentElement !== target) target.append(list);
  };
  placeList();
  narrow?.addEventListener("change", placeList, { signal: page.signal });

  const blankChat = (id = newChatId()): StoredChat => ({ id, title: "", createdAt: Date.now(), updatedAt: Date.now(), messages: [] });
  let current = blankChat();
  /** What each reply answered, so Retry can ask again. */
  const asked = new WeakMap<AiMessageElement, PromptSubmitDetail>();
  /** The settings each prompt went with, for saving. */
  const prompts = new WeakMap<AiMessageElement, StoredPrompt>();
  /** Every version of a reply after Retry, oldest first. */
  const versionTexts = new WeakMap<AiMessageElement, string[]>();
  /** Why the newest version of a reply failed, to show again when people step back to it. */
  const latestError = new WeakMap<AiMessageElement, string | null>();
  /** Which step of the pretend trip planner a reply was, so Retry asks the same thing. */
  const tripSteps = new WeakMap<AiMessageElement, number>();
  let stopReply: (() => void) | undefined;
  let replying: Promise<void> | undefined;

  const wait = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms * speed);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });

  const meta = (text: string) => {
    const line = document.createElement("p");
    line.slot = "footer";
    line.className = "message-meta";
    line.textContent = text;
    return line;
  };

  const messages = () => [...transcript.querySelectorAll<AiMessageElement>("ai-message")];

  // ---- Saving and opening chats ---------------------------------------------------------------

  function showTitle() {
    const title = current.title || "New chat";
    heading.textContent = title;
    document.title = `${title} · AI chat`;
    exportButton.disabled = current.messages.length === 0;
  }

  function refreshList() {
    list.chats = store.list().map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
    list.selected = store.get(current.id) ? current.id : null;
  }

  /** Reads the conversation back out of the page. */
  function serialize(): StoredMessage[] {
    return messages()
      .filter((message) => !message.streaming)
      .map((message) => {
        const thinking = message.querySelector("ai-thinking");
        const tools = [...message.querySelectorAll("ai-tool-call")]
          .filter((call) => call.status !== "running")
          .map((call): StoredToolCall => ({
            name: call.name,
            summary: call.summary,
            input: call.input,
            output: call.status === "done" ? call.output : undefined,
            error: call.status === "error" ? call.error : undefined,
          }));
        const texts = versionTexts.get(message);
        return {
          from: message.from,
          text: message.text,
          meta: message.querySelector(".message-meta")?.textContent ?? undefined,
          prompt: prompts.get(message),
          thinking: thinking
            ? { seconds: thinking.duration ?? Math.round(thinking.elapsed / 1000), reasoning: thinking.reasoning }
            : undefined,
          tools: tools.length ? tools : undefined,
          sources: message.querySelector("ai-sources")?.sources,
          error: message.error ?? undefined,
          feedback: message.feedback ?? undefined,
          versions: texts && texts.length > 1 ? [...texts] : undefined,
          version: texts && texts.length > 1 ? message.version : undefined,
          question: questionOf(message),
        };
      });
  }

  function questionOf(message: AiMessageElement): StoredQuestion | undefined {
    const asking = message.querySelector("ai-question");
    if (!asking) return undefined;
    return {
      question: asking.question,
      options: asking.options,
      multiple: asking.multiple || undefined,
      other: asking.other || undefined,
      max: asking.max ?? undefined,
      skippable: asking.skippable || undefined,
      step: Number(asking.dataset.step) || undefined,
      answer: asking.answer ?? undefined,
    };
  }

  function questionFor(stored: StoredQuestion) {
    const asking = document.createElement("ai-question");
    asking.slot = "footer";
    asking.question = stored.question;
    asking.options = stored.options;
    asking.multiple = stored.multiple ?? false;
    asking.other = stored.other ?? false;
    asking.max = stored.max ?? null;
    asking.skippable = stored.skippable ?? false;
    if (stored.step) asking.dataset.step = String(stored.step);
    if (stored.answer) asking.answer = stored.answer;
    return asking;
  }

  /** Saves the open chat once it has a message, and gives it a link. */
  function save() {
    current.messages = serialize();
    if (current.messages.length === 0 && !store.get(current.id)) return showTitle();
    if (!current.title) current.title = titleFrom(current.messages.find((message) => message.from === "user")?.text ?? "") || "New chat";
    current.updatedAt = Date.now();
    store.put({ ...current, messages: [...current.messages] });
    const link = `#chat/${encodeURIComponent(current.id)}`;
    if (location.hash !== link) history.replaceState(null, "", link);
    refreshList();
    showTitle();
  }

  const detailFrom = (text: string, prompt: StoredPrompt): PromptSubmitDetail => ({
    text,
    mode: prompt.mode,
    model: prompt.model,
    thinking: prompt.thinking,
    command: prompt.command,
    references: prompt.references,
    files: prompt.files.map((name) => new File([], name)),
  });

  function userMessage(text: string, line: string, prompt?: StoredPrompt, files?: File[]) {
    const message = document.createElement("ai-message");
    message.from = "user";
    message.text = text;
    message.attachments = files ?? prompt?.files.map((name) => ({ name })) ?? [];
    message.append(meta(line));
    if (prompt) prompts.set(message, prompt);
    return message;
  }

  /** A reply's message, with Good response and Bad response. */
  function replyMessage() {
    const message = document.createElement("ai-message");
    message.setAttribute("actions", "copy retry feedback");
    return message;
  }

  function sourcesFor(list: Source[]) {
    const sources = document.createElement("ai-sources");
    sources.slot = "footer";
    sources.max = 2;
    sources.sources = list;
    return sources;
  }

  /** Follow-up questions go under the newest reply only. */
  function offerFollowUps(message: AiMessageElement, questions: string[]) {
    for (const old of transcript.querySelectorAll("ai-suggestions.follow-ups")) old.remove();
    const offer = document.createElement("ai-suggestions");
    offer.className = "follow-ups";
    offer.slot = "footer";
    offer.layout = "list";
    offer.setAttribute("label", "Follow-up questions");
    offer.for = "chat-composer";
    offer.suggestions = questions;
    message.append(offer);
  }

  function toolCall(name: string, label: string, input: unknown) {
    const call = document.createElement("ai-tool-call");
    call.slot = "header";
    call.name = name;
    call.label = label;
    call.input = input;
    return call;
  }

  /** The thinking and tool calls belong to the newest version, so hide them while an older one shows. */
  function showWork(message: AiMessageElement, newest: boolean) {
    for (const part of message.querySelectorAll<HTMLElement>(":scope > ai-thinking, :scope > ai-tool-call")) part.hidden = !newest;
  }

  function savedReply(stored: StoredMessage) {
    const message = replyMessage();
    message.text = stored.text;
    if (stored.versions && stored.versions.length > 1) {
      versionTexts.set(message, [...stored.versions]);
      message.versions = stored.versions.length;
      message.version = stored.version ?? stored.versions.length;
    }
    if (stored.feedback) message.feedback = stored.feedback;
    if (stored.error !== undefined) message.error = stored.error;
    latestError.set(message, stored.versions && stored.version !== stored.versions.length ? null : (stored.error ?? null));
    if (stored.thinking) {
      const thinking = document.createElement("ai-thinking");
      thinking.slot = "header";
      thinking.status = "done";
      thinking.timer = true;
      thinking.duration = stored.thinking.seconds;
      thinking.reasoning = stored.thinking.reasoning;
      message.append(thinking);
    }
    for (const tool of stored.tools ?? []) {
      const call = toolCall(tool.name, "", tool.input);
      call.summary = tool.summary;
      if (tool.error !== undefined) {
        call.error = tool.error;
        call.status = "error";
      } else {
        call.output = tool.output;
        call.status = "done";
      }
      message.append(call);
    }
    if (stored.sources?.length) message.append(sourcesFor(stored.sources));
    if (stored.question) {
      message.append(questionFor(stored.question));
      if (stored.question.step) tripSteps.set(message, stored.question.step);
    }
    if (stored.meta) message.append(meta(stored.meta));
    showWork(message, message.version === message.versions);
    return message;
  }

  /** Stops a reply that's streaming, and waits until it has been saved as stopped. */
  async function settleReply() {
    if (!stopReply) return;
    stopReply();
    await replying;
  }

  function show(chat: StoredChat) {
    current = { ...chat, messages: [...chat.messages] };
    for (const message of messages()) message.remove();
    let lastPrompt: PromptSubmitDetail | undefined;
    for (const stored of chat.messages) {
      if (stored.from === "user") {
        const message = userMessage(stored.text, stored.meta ?? "", stored.prompt);
        lastPrompt = stored.prompt ? detailFrom(stored.text, stored.prompt) : undefined;
        transcript.append(message);
      } else {
        const message = savedReply(stored);
        if (lastPrompt) asked.set(message, lastPrompt);
        transcript.append(message);
      }
    }
    transcript.scrollToLatest();
    refreshList();
    showTitle();
  }

  async function openChat(id: string) {
    await settleReply();
    const chat = store.get(id);
    show(chat ?? blankChat(id));
  }

  async function newChat() {
    await settleReply();
    if (store.get(current.id) || location.hash) history.pushState(null, "", location.pathname + location.search);
    if (store.get(current.id) || current.messages.length) show(blankChat());
    composer.focus();
  }

  /** Opens the chat named in the address, like #chat/1234. */
  function route() {
    const id = location.hash.match(/^#chat\/(.+)$/)?.[1];
    if (id) {
      const decoded = decodeURIComponent(id);
      if (decoded !== current.id) void openChat(decoded);
    } else if (store.get(current.id)) {
      void settleReply().then(() => show(blankChat()));
    }
  }
  window.addEventListener("hashchange", route, { signal: page.signal });

  // ---- Replies --------------------------------------------------------------------------------

  /** A pretend reply: think for as long as the level asks, then stream Markdown in. */
  async function reply(detail: PromptSubmitDetail, replacing?: AiMessageElement, trip?: number) {
    const controller = new AbortController();
    const { signal } = controller;
    const message = replyMessage();
    message.streaming = true;
    asked.set(message, detail);
    if (trip) tripSteps.set(message, trip);
    const earlier = replacing ? (versionTexts.get(replacing) ?? [replacing.text]) : [];
    if (earlier.length) {
      message.versions = earlier.length + 1;
      message.version = earlier.length + 1;
    }
    const thinking = thinkingTime[detail.thinking ?? "off"] ? document.createElement("ai-thinking") : undefined;
    if (thinking) {
      thinking.slot = "header";
      thinking.timer = true;
      message.append(thinking);
    }
    if (replacing) replacing.replaceWith(message);
    else transcript.append(message);
    stopReply = () => controller.abort();
    composer.busy = true;

    try {
      if (thinking) {
        const steps = [
          detail.files.length > 0 && `Looking at ${detail.files.length === 1 ? detail.files[0].name : `${detail.files.length} files`}…`,
          "Thinking…",
        ].filter((step): step is string => Boolean(step));
        const reasoning: string[] = [];
        for (const step of steps) {
          thinking.label = step;
          reasoning.push(step.replace(/…$/, "."));
          thinking.reasoning = reasoning.join("\n");
          await wait(thinkingTime[detail.thinking!] / steps.length, signal);
        }
        thinking.done();
      }
      // Each @reference is read with a tool, the way an agent would.
      for (const reference of detail.references) {
        const call = toolCall("read_file", `Reading ${reference.label}…`, { path: reference.label });
        message.append(call);
        await wait(600, signal);
        call.summary = `Read ${reference.label}`;
        call.done(pretendFile(reference.label));
      }
      // Stream a few characters at a time, the way a model's tokens arrive.
      const city = trip === 2 && detail.text !== "Surprise me" ? detail.text : (firstAnswer() ?? "Lisbon");
      const text = trip ? tripReply(trip, detail.text, city) : pretendReply(detail);
      const end = failing(detail.text) ? Math.floor(text.length / 3) : text.length;
      for (let index = 0; index < end; index += 6) {
        await wait(12, signal);
        message.appendText(text.slice(index, Math.min(index + 6, end)));
      }
      if (end < text.length) message.error = "The connection dropped. Press Retry to try again.";
      else {
        if (citing(detail.text)) message.append(sourcesFor(pretendSources));
        if (trip && tripQuestions[trip]) {
          // A question takes the place of follow-ups until it's answered.
          for (const old of transcript.querySelectorAll("ai-suggestions.follow-ups")) old.remove();
          message.append(questionFor(tripQuestions[trip]));
        } else offerFollowUps(message, followUps(detail));
      }
    } catch {
      thinking?.remove();
      for (const call of message.querySelectorAll("ai-tool-call")) if (call.status === "running") call.fail("Stopped");
      message.append(meta("Stopped"));
    } finally {
      versionTexts.set(message, [...earlier, message.text]);
      latestError.set(message, message.error);
      message.done();
      stopReply = undefined;
      composer.busy = false;
      save();
    }
  }

  const startReply = (detail: PromptSubmitDetail, replacing?: AiMessageElement, trip?: number) => {
    replying = reply(detail, replacing, trip);
  };

  /** The city chosen in the trip planner's first question, if it was answered. */
  function firstAnswer() {
    const answer = transcript.querySelector<HTMLElementTagNameMap["ai-question"]>("ai-question[data-step='1']")?.answer;
    return answer && !("skipped" in answer) ? answer.labels[0] : undefined;
  }

  composer.addEventListener("promptstop", () => stopReply?.());

  composer.addEventListener("promptsubmit", (event) => {
    const detail = event.detail;
    if (detail.command === "clear") {
      for (const message of messages()) message.remove();
      save();
      return;
    }
    send(detail, planning(detail.text) ? 1 : undefined);
  });

  /** Shows what was sent as your message, and starts the reply. */
  function send(detail: PromptSubmitDetail, trip?: number) {

    const line = [
      `${labelOf(defaultModes, detail.mode)} · ${labelOf(defaultModels, detail.model)} · Thinking: ${labelOf(defaultThinkingLevels, detail.thinking)}`,
      detail.command && `Command: /${detail.command}`,
      detail.references.length > 0 && `References: ${detail.references.map((reference) => `@${reference.label}`).join(", ")}`,
      detail.files.length > 0 && `Attached: ${detail.files.map((file) => file.name).join(", ")}`,
    ]
      .filter(Boolean)
      .join(" · ");
    const prompt: StoredPrompt = {
      mode: detail.mode,
      model: detail.model,
      thinking: detail.thinking,
      command: detail.command,
      references: detail.references,
      files: detail.files.map((file) => file.name),
    };
    transcript.append(userMessage(detail.text, line, prompt, detail.files));
    save();
    startReply(detail, undefined, trip);
  }

  /** An answer to the trip planner's question goes in as your next message, with the composer's settings. */
  const answerWith = (text: string, step: number) =>
    send({ text, mode: composer.mode, model: composer.model, thinking: composer.thinking, references: [], files: [] }, step + 1);

  transcript.addEventListener("questionanswer", (event) => {
    if (composer.busy) return event.preventDefault();
    const step = Number((event.target as HTMLElement).dataset.step);
    // The event comes before the question shows as answered; send once it has.
    queueMicrotask(() => (step ? answerWith(event.detail.labels.join(", "), step) : save()));
  });

  transcript.addEventListener("questionskip", (event) => {
    if (composer.busy) return event.preventDefault();
    const step = Number((event.target as HTMLElement).dataset.step);
    queueMicrotask(() => (step ? answerWith("Surprise me", step) : save()));
  });

  transcript.addEventListener("messageaction", (event) => {
    const message = event.target as AiMessageElement;
    if (event.detail.action === "retry" && !composer.busy) {
      const detail = asked.get(message);
      if (detail) startReply(detail, message, tripSteps.get(message));
    } else if (event.detail.action === "edit") {
      composer.value = event.detail.text;
      composer.focus();
    }
  });

  transcript.addEventListener("messageversion", (event) => {
    const message = event.target as AiMessageElement;
    const text = versionTexts.get(message)?.[event.detail.version - 1];
    if (text === undefined || composer.busy) return event.preventDefault();
    message.text = text;
    // Only the newest version can have failed, thought or used tools.
    const newest = event.detail.version === event.detail.versions;
    message.error = newest ? (latestError.get(message) ?? null) : null;
    showWork(message, newest);
    queueMicrotask(save);
  });

  // The event comes before the rating changes, so it can be cancelled; save once it has.
  transcript.addEventListener("messagefeedback", () => queueMicrotask(save));


  // ---- The chat list, the header and export ---------------------------------------------------

  const closeDrawer = () => {
    if (drawer.api.isOpen()) drawer.api.close();
  };

  const exportChat = (chat: StoredChat | undefined) => {
    if (chat && chat.messages.length) download(markdownFileName(chat.title), chatToMarkdown(chat));
  };

  list.addEventListener("chatselect", closeDrawer);
  list.addEventListener("chatnew", () => {
    closeDrawer();
    void newChat();
  });
  list.addEventListener("chatrename", (event) => {
    store.rename(event.detail.id, event.detail.title);
    if (event.detail.id === current.id) current.title = event.detail.title;
    refreshList();
    showTitle();
  });
  list.addEventListener("chatexport", (event) => exportChat(event.detail.id === current.id ? current : store.get(event.detail.id)));
  list.addEventListener("chatdelete", (event) => {
    const { id } = event.detail;
    store.remove(id);
    if (id === current.id) {
      void settleReply().then(() => {
        history.pushState(null, "", location.pathname + location.search);
        show(blankChat());
      });
    } else {
      refreshList();
    }
  });
  root.querySelector(".header-new-chat")!.addEventListener("action", () => void newChat());
  exportButton.addEventListener("action", () => exportChat(current));

  refreshList();
  route();
  showTitle();

  return () => page.abort();
}
