import "@ui-sdk/web/button";
import "@ui-sdk/web/drawer";
import "@samyakbhuta/ui-components/ai-chat-list";
import "@samyakbhuta/ui-components/ai-composer";
import "@samyakbhuta/ui-components/ai-message";
import "@samyakbhuta/ui-components/ai-thinking";
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
];

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
            <ul class="suggestions" aria-label="Suggestions">
              ${suggestions.map((text) => `<li><button type="button" class="suggestion">${text}</button></li>`).join("")}
            </ul>
          </div>
        </ai-transcript>
        <ai-composer class="composer" attachments voice history persist="chat-shell" paste-as-file max-length="8000"
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
        return {
          from: message.from,
          text: message.text,
          meta: message.querySelector(".message-meta")?.textContent ?? undefined,
          prompt: prompts.get(message),
          thinking: thinking
            ? { seconds: thinking.duration ?? Math.round(thinking.elapsed / 1000), reasoning: thinking.reasoning }
            : undefined,
        };
      });
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

  function userMessage(text: string, line: string, prompt?: StoredPrompt) {
    const message = document.createElement("ai-message");
    message.from = "user";
    message.text = text;
    message.append(meta(line));
    if (prompt) prompts.set(message, prompt);
    return message;
  }

  function savedReply(stored: StoredMessage) {
    const message = document.createElement("ai-message");
    message.text = stored.text;
    if (stored.thinking) {
      const thinking = document.createElement("ai-thinking");
      thinking.slot = "header";
      thinking.status = "done";
      thinking.timer = true;
      thinking.duration = stored.thinking.seconds;
      thinking.reasoning = stored.thinking.reasoning;
      message.append(thinking);
    }
    if (stored.meta) message.append(meta(stored.meta));
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
  async function reply(detail: PromptSubmitDetail, replacing?: AiMessageElement) {
    const controller = new AbortController();
    const { signal } = controller;
    const message = document.createElement("ai-message");
    message.streaming = true;
    asked.set(message, detail);
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
          detail.references.length > 0 && `Reading ${detail.references.map((reference) => `@${reference.label}`).join(", ")}…`,
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
      // Stream a few characters at a time, the way a model's tokens arrive.
      const text = pretendReply(detail);
      for (let index = 0; index < text.length; index += 6) {
        await wait(12, signal);
        message.appendText(text.slice(index, index + 6));
      }
    } catch {
      thinking?.remove();
      message.append(meta("Stopped"));
    } finally {
      message.done();
      stopReply = undefined;
      composer.busy = false;
      save();
    }
  }

  const startReply = (detail: PromptSubmitDetail, replacing?: AiMessageElement) => {
    replying = reply(detail, replacing);
  };

  composer.addEventListener("promptstop", () => stopReply?.());

  composer.addEventListener("promptsubmit", (event) => {
    const detail = event.detail;
    if (detail.command === "clear") {
      for (const message of messages()) message.remove();
      save();
      return;
    }

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
    transcript.append(userMessage(detail.text, line, prompt));
    save();
    startReply(detail);
  });

  transcript.addEventListener("messageaction", (event) => {
    const message = event.target as AiMessageElement;
    if (event.detail.action === "retry" && !composer.busy) {
      const detail = asked.get(message);
      if (detail) startReply(detail, message);
    } else if (event.detail.action === "edit") {
      composer.value = event.detail.text;
      composer.focus();
    }
  });

  transcript.addEventListener("click", (event) => {
    const suggestion = (event.target as Element).closest(".suggestion");
    if (!suggestion || composer.busy) return;
    composer.value = suggestion.textContent ?? "";
    composer.submit();
    composer.focus();
  });

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
