/**
 * Saved chats for the chat shell: kept in this browser's localStorage, and exported as Markdown.
 */

/** The settings a prompt was sent with, so Retry can ask again after a reload. */
export type StoredPrompt = {
  mode?: string;
  model?: string;
  thinking?: string;
  command?: string;
  references: { value: string; label: string }[];
  files: string[];
};

export type StoredMessage = {
  from: "user" | "assistant";
  text: string;
  /** The line under the message, like "Auto · Sonnet 5.5 · Thinking: Medium" or "Stopped". */
  meta?: string;
  prompt?: StoredPrompt;
  thinking?: { seconds: number; reasoning: string };
  /** What the reply cited. */
  sources?: { title: string; url: string; description?: string; site?: string }[];
  /** Tools the reply used, like reading a referenced file. */
  tools?: StoredToolCall[];
  /** Why the reply failed. */
  error?: string;
  feedback?: "good" | "bad";
  /** Every version of the reply after Retry, oldest first. `text` is the one showing. */
  versions?: string[];
  version?: number;
  /** A question the reply asked, with its answer once given. */
  question?: StoredQuestion;
};

/** An `<ai-question>`: its question, its choices, and the answer, or `{ skipped: true }`. */
export type StoredQuestion = {
  question: string;
  options: (string | { value: string; label?: string; description?: string })[];
  multiple?: boolean;
  other?: boolean;
  max?: number;
  skippable?: boolean;
  /** Which step of a conversation it belongs to, so the app knows what to ask next. */
  step?: number;
  answer?: { value: string | string[]; labels: string[]; other: string | null } | { skipped: true };
};

export type StoredToolCall = { name: string; summary: string; input?: unknown; output?: unknown; error?: string };

export type StoredChat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
};

const storageKey = "chat-shell:chats";

export function newChatId() {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A title from the first prompt: its first line, shortened to about 60 characters. */
export function titleFrom(text: string) {
  const line = text.trim().split("\n")[0].replace(/\s+/g, " ");
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line;
}

const isChat = (value: unknown): value is StoredChat => {
  const chat = value as StoredChat;
  return (
    typeof chat?.id === "string" &&
    typeof chat.title === "string" &&
    typeof chat.updatedAt === "number" &&
    Array.isArray(chat.messages) &&
    chat.messages.every((message) => (message?.from === "user" || message?.from === "assistant") && typeof message.text === "string")
  );
};

/** Saved chats in this browser, newest first. */
export class ChatStore {
  #chats: StoredChat[];

  constructor() {
    this.#chats = ChatStore.#load();
  }

  static #load(): StoredChat[] {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      return Array.isArray(saved) ? saved.filter(isChat) : [];
    } catch {
      return [];
    }
  }

  list(): StoredChat[] {
    return [...this.#chats].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): StoredChat | undefined {
    return this.#chats.find((chat) => chat.id === id);
  }

  /** Adds or replaces a chat and saves. */
  put(chat: StoredChat) {
    this.#chats = [chat, ...this.#chats.filter((other) => other.id !== chat.id)];
    this.#save();
  }

  rename(id: string, title: string) {
    const chat = this.get(id);
    if (!chat) return;
    this.put({ ...chat, title, updatedAt: Date.now() });
  }

  remove(id: string) {
    this.#chats = this.#chats.filter((chat) => chat.id !== id);
    this.#save();
  }

  /** Saves, dropping the oldest chats if the browser's storage is full. */
  #save() {
    const chats = this.list();
    while (chats.length) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(chats));
        return;
      } catch {
        chats.pop();
      }
    }
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Storage is blocked; chats last until the page closes.
    }
  }
}

/** A chat as a Markdown document: the title, then each message with what it was sent with. */
export function chatToMarkdown(chat: StoredChat, { exportedAt = new Date(), locale }: { exportedAt?: Date; locale?: string } = {}) {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(exportedAt);
  const parts = [`# ${chat.title.replace(/\n/g, " ")}`, "", `*Exported from AI chat on ${date}.*`];
  for (const message of chat.messages) {
    const label = message.from === "user" ? "**You**" : "**Assistant**";
    const versions = message.versions && message.versions.length > 1 ? message.versions : undefined;
    const version = versions ? (message.version ?? versions.length) : 1;
    const details = [
      message.from === "user" ? message.meta : undefined,
      message.thinking ? `Thought for ${message.thinking.seconds}s` : undefined,
      versions ? `Version ${version} of ${versions.length}` : undefined,
      message.feedback ? `Rated ${message.feedback === "good" ? "good" : "bad"}` : undefined,
      message.from === "assistant" ? message.meta : undefined,
    ].filter(Boolean);
    parts.push("", "---", "", [label, ...details].join(" · "));
    if (message.tools?.length) {
      parts.push("", ...message.tools.map((tool) => (tool.error !== undefined ? `- \`${tool.name}\` failed: ${tool.error || "no reason given"}` : `- ${tool.summary || `Ran \`${tool.name}\``}`)));
    }
    parts.push("", message.text.trim() || "*(no text)*");
    if (message.error !== undefined) parts.push("", `> **Error:** ${message.error || "Something went wrong."}`);
    if (message.question) parts.push("", ...questionToMarkdown(message.question));
    if (message.sources?.length) parts.push("", ...message.sources.map((source, index) => `[${index + 1}]: ${source.url} "${source.title.replace(/"/g, "'")}"`));
    versions?.forEach((text, index) => {
      if (index + 1 !== version) parts.push("", `*Version ${index + 1} of ${versions.length}:*`, "", text.trim() || "*(no text)*");
    });
  }
  return `${parts.join("\n")}\n`;
}

/** A question as a task list: the chosen answers checked, then the answer in words. */
function questionToMarkdown(question: StoredQuestion) {
  const answer = question.answer;
  const chosen = answer && !("skipped" in answer) ? (Array.isArray(answer.value) ? answer.value : [answer.value]) : [];
  const lines = [`**${question.question.replace(/\n/g, " ")}**${question.multiple ? " *(choose any)*" : ""}`, ""];
  for (const option of question.options) {
    const { value, label } = typeof option === "string" ? { value: option, label: option } : { value: option.value, label: option.label ?? option.value };
    lines.push(`- [${chosen.includes(value) ? "x" : " "}] ${label}`);
  }
  if (answer && !("skipped" in answer) && answer.other !== null) lines.push(`- [x] Other: ${answer.other}`);
  else if (question.other) lines.push("- [ ] Other");
  lines.push("", !answer ? "*Not answered.*" : "skipped" in answer ? "*Skipped.*" : `*Answered: ${answer.labels.join(", ")}*`);
  return lines;
}

/** A file name from a title, like "web-components-explained.md". */
export function markdownFileName(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `${slug || "chat"}.md`;
}

/** Hands the browser a file to save. */
export function download(fileName: string, text: string, type = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
