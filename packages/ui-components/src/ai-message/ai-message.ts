import "@ui-sdk/web/button";
import "@ui-sdk/web/toggle";
import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-message.css?inline";
import { type Highlighter, highlight } from "./highlight.ts";
import { type MarkdownBlock, renderMarkdown, renderPlainText } from "./markdown.ts";

export type { Highlighter } from "./highlight.ts";

export type MessageAction = "copy" | "retry" | "edit";

/** What `actions` can hold: the buttons, and "feedback" for Good response and Bad response. */
export type MessageActionName = MessageAction | "feedback";

/** What `messageaction` carries in `event.detail`. */
export type MessageActionDetail = { action: MessageAction; text: string };

export type MessageFeedback = "good" | "bad";

/** What `messagefeedback` carries in `event.detail`: the new rating, or null when it's cleared. */
export type MessageFeedbackDetail = { feedback: MessageFeedback | null; text: string };

/** What `messageversion` carries in `event.detail`: the version asked for, counting from 1. */
export type MessageVersionDetail = { version: number; versions: number };

/** A file shown with the message. A `File` works as it is, like the ones `<ai-composer>` sends. */
export type MessageAttachment = File | { name: string; type?: string; size?: number; url?: string };

/** Every word `<ai-message>` shows or announces. Override any of them through `strings`. */
export type MessageStrings = {
  copy: string;
  copied: string;
  copyFailed: string;
  retry: string;
  edit: string;
  copyCode: string;
  copyCodeName: (language: string) => string;
  codeCopied: string;
  actions: string;
  good: string;
  bad: string;
  feedback: string;
  error: string;
  previousVersion: string;
  nextVersion: string;
  version: (version: number, versions: number) => string;
  versionName: (version: number, versions: number) => string;
  attachments: string;
  fileSize: (bytes: number) => string;
};

export const defaultMessageStrings: MessageStrings = {
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Couldn't copy",
  retry: "Retry",
  edit: "Edit",
  copyCode: "Copy",
  copyCodeName: (language) => (language ? `Copy ${language} code` : "Copy code"),
  codeCopied: "Copied",
  actions: "Message actions",
  good: "Good response",
  bad: "Bad response",
  feedback: "Feedback",
  error: "Something went wrong.",
  previousVersion: "Previous version",
  nextVersion: "Next version",
  version: (version, versions) => `${version} / ${versions}`,
  versionName: (version, versions) => `Version ${version} of ${versions}`,
  attachments: "Attachments",
  fileSize: (bytes) =>
    bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`,
};

export type MessageIcons = Record<MessageAction | MessageFeedback | "copied" | "error" | "previous" | "next" | "file", string>;

const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const defaultMessageIcons: MessageIcons = {
  copy: icon('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  copied: icon('<path d="m5 12 5 5L20 7"/>'),
  retry: icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  edit: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  good: icon('<path d="M7 10v11"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.4 7a2 2 0 0 1-2 1.7H7V10l4-8a3 3 0 0 1 4 3.9Z"/>'),
  bad: icon('<path d="M17 14V3"/><path d="M9 18.1 10 14H4.2a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 5.6 3H17v11l-4 8a3 3 0 0 1-4-3.9Z"/>'),
  error: icon('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'),
  previous: icon('<path d="m15 18-6-6 6-6"/>'),
  next: icon('<path d="m9 18 6-6-6-6"/>'),
  file: icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>'),
};

/** Only these addresses may be shown as an attachment's image. */
const safeImage = /^(?:https?:|blob:|data:image\/(?:png|jpe?g|gif|webp|avif);)/i;

type Rendered = HTMLElement & { aiSource?: string };

/** Copies text, falling back to a hidden textarea where the Clipboard API is missing or refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = Object.assign(document.createElement("textarea"), { value: text });
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  }
}

/** Turns `[1]` in text, outside code and links, into the citation for that number, when there is one. */
function cite(root: Node, citation: (number: number) => HTMLElement | null) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      /\[\d{1,3}\]/.test(node.nodeValue ?? "") && !node.parentElement?.closest("code, pre, a, [data-part='code-block']")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const text of texts) {
    const value = text.nodeValue!;
    const parts: Node[] = [];
    let last = 0;
    for (const match of value.matchAll(/\[(\d{1,3})\]/g)) {
      const marker = citation(Number(match[1]));
      if (!marker) continue;
      parts.push(document.createTextNode(value.slice(last, match.index)), marker);
      last = match.index! + match[0].length;
    }
    if (!parts.length) continue;
    parts.push(document.createTextNode(value.slice(last)));
    text.replaceWith(...parts);
  }
}

/** Removes the indentation shared by every line, for Markdown written inside indented HTML. */
function dedent(text: string) {
  const lines = text.replace(/^(?:[ \t]*\n)+|\s+$/g, "").split("\n");
  const indents = lines.filter((line) => line.trim()).map((line) => line.match(/^[ \t]*/)![0].length);
  const shared = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(shared)).join("\n");
}

/**
 * `<ai-message>`: one message in a conversation. Renders Markdown safely, streams text in,
 * and offers Copy, Retry and Edit. See README.md beside this file.
 *
 * @customElement ai-message
 */
export class AiMessageElement extends BaseElement {
  static observedAttributes = ["from", "format", "streaming", "actions", "error", "feedback", "version", "versions"];

  #source = "";
  #rendered = false;
  #frame = 0;
  #strings: MessageStrings = defaultMessageStrings;
  #icons: MessageIcons = defaultMessageIcons;
  #highlighter: Highlighter | null = highlight;
  #feedback = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
  #observer = new MutationObserver((records) => this.#adopt(records));
  #attachments: MessageAttachment[] = [];
  #objectUrls: string[] = [];

  /** Who wrote it: "assistant" (the default) or "user". */
  get from(): "assistant" | "user" {
    return this.getAttribute("from") === "user" ? "user" : "assistant";
  }
  set from(value: "assistant" | "user") {
    this.setAttribute("from", value);
  }

  /** "markdown" or "text". Assistant messages default to Markdown, user messages to text. */
  get format(): "markdown" | "text" {
    const format = this.getAttribute("format");
    if (format === "markdown" || format === "text") return format;
    return this.from === "user" ? "text" : "markdown";
  }
  set format(value: "markdown" | "text") {
    this.setAttribute("format", value);
  }

  /** The message's source text. Setting it replaces the message. */
  get text(): string {
    return this.#source;
  }
  set text(value: string) {
    this.#source = value ?? "";
    this.#renderBody();
  }

  /** Whether text is still streaming in. While it is, the actions hide and a caret shows. */
  get streaming(): boolean {
    return this.hasAttribute("streaming");
  }
  set streaming(value: boolean) {
    this.toggleAttribute("streaming", value);
  }

  /** The actions to offer, from "copy", "retry", "edit" and "feedback". */
  get actions(): MessageActionName[] {
    const value = this.getAttribute("actions");
    const list = value === null ? (this.from === "user" ? "copy edit" : "copy retry") : value;
    return list
      .split(/\s+/)
      .filter((action): action is MessageActionName => ["copy", "retry", "edit", "feedback"].includes(action));
  }
  set actions(value: MessageActionName[] | string) {
    this.setAttribute("actions", Array.isArray(value) ? value.join(" ") : String(value));
  }

  /** Why the reply failed. Set it, even to "", to show the error; null clears it. */
  get error(): string | null {
    return this.getAttribute("error");
  }
  set error(value: string | null) {
    if (value === null) this.removeAttribute("error");
    else this.setAttribute("error", value);
  }

  /** The rating given with Good response or Bad response, or null. Shown when `actions` includes "feedback". */
  get feedback(): MessageFeedback | null {
    const value = this.getAttribute("feedback");
    return value === "good" || value === "bad" ? value : null;
  }
  set feedback(value: MessageFeedback | null) {
    if (value === null) this.removeAttribute("feedback");
    else this.setAttribute("feedback", value);
  }

  /** How many versions of this reply there are, after Retry or Edit. From 2, arrows step between them. */
  get versions(): number {
    return Math.max(1, Math.floor(Number(this.getAttribute("versions")) || 1));
  }
  set versions(value: number) {
    this.setAttribute("versions", String(value));
  }

  /** Which version is showing, counting from 1. */
  get version(): number {
    return Math.min(this.versions, Math.max(1, Math.floor(Number(this.getAttribute("version")) || this.versions)));
  }
  set version(value: number) {
    this.setAttribute("version", String(value));
  }

  /** Files shown with the message, like the ones sent with a prompt. Images show as thumbnails. */
  get attachments(): MessageAttachment[] {
    return this.#attachments;
  }
  set attachments(value: MessageAttachment[]) {
    this.#attachments = [...(value ?? [])];
    if (this.#rendered) this.#renderAttachments();
  }

  get strings(): MessageStrings {
    return this.#strings;
  }
  set strings(value: Partial<MessageStrings>) {
    this.#strings = { ...defaultMessageStrings, ...value };
    if (this.#rendered) this.#renderAll();
  }

  /**
   * Colours code blocks. Defaults to the built-in highlighter; set your own `(code, language) => Node[] | null`,
   * or null to show code plain.
   */
  get highlighter(): Highlighter | null {
    return this.#highlighter;
  }
  set highlighter(value: Highlighter | null) {
    this.#highlighter = value;
    if (this.#rendered) this.#renderBody(true);
  }

  get icons(): MessageIcons {
    return this.#icons;
  }
  set icons(value: Partial<MessageIcons>) {
    this.#icons = { ...defaultMessageIcons, ...value };
    if (this.#rendered) this.#renderActions();
  }

  /** Adds streamed text to the end. Renders at most once a frame. */
  appendText(chunk: string) {
    this.#source += chunk;
    if (!this.#rendered) return;
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#renderBody();
    });
  }

  /** Marks the message as finished: renders what's left and fires `messagecomplete`. */
  done() {
    this.streaming = false;
  }

  /** Marks the reply as failed: shows why, keeps what arrived, and ends streaming. */
  fail(error = "") {
    this.error = error;
    this.done();
  }

  connectedCallback() {
    if (this.#rendered) return;
    const slotted = [...this.children].filter((child): child is HTMLElement => child.hasAttribute("slot"));
    // Text written inside the element is its starting source.
    if (!this.#source) {
      const written = [...this.childNodes]
        .filter((node) => !(node instanceof HTMLElement && node.hasAttribute("slot")))
        .map((node) => node.textContent)
        .join("");
      if (written.trim()) this.#source = dedent(written);
    }
    this.replaceChildren();
    const attachments = document.createElement("ul");
    attachments.dataset.part = "attachments";
    const body = document.createElement("div");
    body.dataset.part = "body";
    const error = document.createElement("div");
    error.dataset.part = "error";
    const actions = document.createElement("div");
    actions.dataset.part = "actions";
    actions.setAttribute("role", "group");
    const announcement = document.createElement("span");
    announcement.dataset.part = "announcement";
    announcement.setAttribute("role", "status");
    this.append(
      ...slotted.filter((child) => child.slot === "header"),
      attachments,
      body,
      error,
      ...slotted.filter((child) => child.slot === "footer"),
      actions,
      announcement,
    );
    this.#rendered = true;
    this.addEventListener("click", this.#onCodeCopy);
    this.addEventListener("sourceschange", () => this.#renderBody(true));
    this.#renderAll();
    this.#observer.observe(this, { childList: true });
  }

  disconnectedCallback() {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
  }

  /** Moves header and footer children added later into place. */
  #adopt(records: MutationRecord[]) {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement) || node.parentElement !== this) continue;
        const body = this.querySelector(":scope > [data-part='attachments']");
        const actions = this.querySelector(":scope > [data-part='actions']");
        if (!body || !actions) continue;
        const before = (other: Node) => Boolean(node.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING);
        // Moving a node records another mutation, so only move what is out of place.
        if (node.slot === "header" && !before(body)) body.before(node);
        else if (node.slot === "footer" && (before(body) || !before(actions))) actions.before(node);
      }
    }
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null) {
    if (previous === next || !this.#rendered) return;
    if (name === "streaming") {
      this.#renderBody();
      this.#syncStreaming();
      if (previous !== null && next === null) {
        this.dispatchEvent(new CustomEvent("messagecomplete", { bubbles: true, composed: true }));
      }
    } else if (name === "error") {
      this.#renderError();
      if (next !== null) this.#say(this.#errorText());
    } else if (name === "feedback") {
      const group = this.querySelector<HTMLElement & { value: string[] }>("[data-part='feedback']");
      if (group) group.value = this.feedback ? [this.feedback] : [];
    } else if (name === "version" || name === "versions") {
      this.#renderActions();
      this.#syncStreaming();
    } else {
      this.#renderAll();
    }
  }

  #renderAll() {
    this.#renderAttachments();
    this.#renderBody(true);
    this.#renderError();
    this.#renderActions();
    this.#syncStreaming();
  }

  #errorText() {
    return this.error || this.#strings.error;
  }

  #renderError() {
    const part = this.querySelector<HTMLElement>(":scope > [data-part='error']");
    if (!part) return;
    const failed = this.error !== null;
    this.toggleAttribute("data-error", failed);
    part.hidden = !failed;
    if (!failed) return part.replaceChildren();
    const mark = document.createElement("span");
    mark.dataset.part = "error-icon";
    mark.innerHTML = this.#icons.error;
    const text = document.createElement("span");
    text.textContent = this.#errorText();
    part.replaceChildren(mark, text);
  }

  #renderAttachments() {
    const list = this.querySelector<HTMLElement>(":scope > [data-part='attachments']");
    if (!list) return;
    for (const url of this.#objectUrls) URL.revokeObjectURL(url);
    this.#objectUrls = [];
    list.setAttribute("aria-label", this.#strings.attachments);
    list.replaceChildren();
    list.hidden = this.#attachments.length === 0;
    for (const file of this.#attachments) {
      const item = document.createElement("li");
      item.dataset.part = "attachment";
      const isFile = typeof File !== "undefined" && file instanceof File;
      let url = isFile ? "" : ((file as { url?: string }).url ?? "");
      const image = (file.type ?? "").startsWith("image/");
      if (image && isFile && typeof URL.createObjectURL === "function") {
        url = URL.createObjectURL(file);
        this.#objectUrls.push(url);
      }
      if (image && safeImage.test(url)) {
        item.dataset.kind = "image";
        const img = document.createElement("img");
        img.src = url;
        img.alt = file.name;
        img.title = file.name;
        item.append(img);
      } else {
        item.dataset.kind = "file";
        const mark = document.createElement("span");
        mark.dataset.part = "file-icon";
        mark.innerHTML = this.#icons.file;
        const name = document.createElement("span");
        name.dataset.part = "file-name";
        name.textContent = file.name;
        item.append(mark, name);
        if (typeof file.size === "number") {
          const size = document.createElement("span");
          size.dataset.part = "file-size";
          size.textContent = this.#strings.fileSize(file.size);
          item.append(size);
        }
      }
      list.append(item);
    }
  }

  #say(text: string) {
    const announcement = this.querySelector(":scope > [data-part='announcement']");
    if (announcement) announcement.textContent = text;
  }

  /** Re-renders only the blocks whose source changed, so earlier blocks keep focus and selection. */
  #renderBody(force = false) {
    const body = this.querySelector<HTMLElement>(":scope > [data-part='body']");
    if (!body) return;
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    const blocks: MarkdownBlock[] =
      this.format === "markdown"
        ? renderMarkdown(this.#source, {
            copyLabel: this.#strings.copyCode,
            copyName: this.#strings.copyCodeName,
            highlight: this.#highlighter,
          })
        : renderPlainText(this.#source);
    const current = [...body.children] as Rendered[];
    let keep = 0;
    if (!force) {
      while (keep < blocks.length && keep < current.length && current[keep].aiSource === blocks[keep].source) keep++;
    }
    for (const stale of current.slice(keep)) stale.remove();
    const sources = this.querySelector<HTMLElement & { citation?: (number: number) => HTMLElement | null }>(":scope > ai-sources");
    for (const block of blocks.slice(keep)) {
      (block.node as Rendered).aiSource = block.source;
      if (typeof sources?.citation === "function") cite(block.node, (number) => sources.citation!(number));
      body.append(block.node);
    }
  }

  #renderActions() {
    const bar = this.querySelector<HTMLElement>(":scope > [data-part='actions']");
    if (!bar) return;
    const s = this.#strings;
    bar.setAttribute("aria-label", s.actions);
    bar.replaceChildren();
    const versions = this.versions;
    if (versions > 1) {
      const version = this.version;
      const pager = document.createElement("div");
      pager.dataset.part = "versions";
      pager.setAttribute("role", "group");
      pager.setAttribute("aria-label", s.versionName(version, versions));
      const count = document.createElement("span");
      count.dataset.part = "version";
      count.setAttribute("aria-hidden", "true");
      count.textContent = s.version(version, versions);
      pager.append(
        this.#iconButton("previous", s.previousVersion, version <= 1, () => this.#step(version - 1, "previous")),
        count,
        this.#iconButton("next", s.nextVersion, version >= versions, () => this.#step(version + 1, "next")),
      );
      bar.append(pager);
    }
    for (const action of this.actions) {
      if (action === "feedback") continue;
      const wrapper = document.createElement("ui-button");
      wrapper.dataset.action = action;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.button = "icon";
      button.setAttribute("aria-label", s[action]);
      button.title = s[action];
      button.innerHTML = this.#icons[action];
      wrapper.append(button);
      wrapper.addEventListener("action", () => this.#act(action, button));
      bar.append(wrapper);
    }
    if (this.#offersFeedback()) bar.append(this.#feedbackGroup());
    bar.hidden = !this.#hasActions();
  }

  #offersFeedback() {
    return this.actions.includes("feedback");
  }

  #hasActions() {
    return this.actions.length > 0 || this.versions > 1;
  }

  #iconButton(name: "previous" | "next", label: string, disabled: boolean, press: () => void) {
    const wrapper = document.createElement("ui-button");
    wrapper.dataset.action = name;
    wrapper.toggleAttribute("disabled", disabled);
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.button = "icon";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = this.#icons[name];
    wrapper.append(button);
    wrapper.addEventListener("action", press);
    return wrapper;
  }

  #step(version: number, pressed: "previous" | "next") {
    const detail: MessageVersionDetail = { version, versions: this.versions };
    const proceed = this.dispatchEvent(
      new CustomEvent("messageversion", { detail, bubbles: true, composed: true, cancelable: true }),
    );
    if (!proceed) return;
    this.version = version;
    // The pager is rebuilt, so focus the arrow that was pressed, or the other one once that end is reached.
    const atEnd = pressed === "previous" ? version <= 1 : version >= this.versions;
    const target = atEnd ? (pressed === "previous" ? "next" : "previous") : pressed;
    this.querySelector<HTMLButtonElement>(`[data-action='${target}'] button`)?.focus();
  }

  #feedbackGroup() {
    const s = this.#strings;
    const group = document.createElement("ui-toggle-group") as HTMLElement & { value: string[] };
    group.dataset.part = "feedback";
    group.setAttribute("aria-label", s.feedback);
    for (const value of ["good", "bad"] as const) {
      const toggle = document.createElement("ui-toggle");
      toggle.setAttribute("value", value);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.button = "icon";
      button.setAttribute("aria-label", s[value]);
      button.title = s[value];
      button.innerHTML = this.#icons[value];
      toggle.append(button);
      group.append(toggle);
    }
    if (this.feedback) group.setAttribute("default-value", this.feedback);
    group.addEventListener("valuechange", (event) => {
      const value = (event as CustomEvent<{ value: string[] }>).detail.value;
      const feedback = (value[0] as MessageFeedback | undefined) ?? null;
      const detail: MessageFeedbackDetail = { feedback, text: this.#source };
      const proceed = this.dispatchEvent(
        new CustomEvent("messagefeedback", { detail, bubbles: true, composed: true, cancelable: true }),
      );
      if (!proceed) return event.preventDefault();
      this.feedback = feedback;
    });
    return group;
  }

  #syncStreaming() {
    const streaming = this.streaming;
    if (streaming) this.setAttribute("aria-busy", "true");
    else this.removeAttribute("aria-busy");
    const bar = this.querySelector<HTMLElement>(":scope > [data-part='actions']");
    if (bar) bar.hidden = streaming || !this.#hasActions();
  }

  async #act(action: MessageAction, button: HTMLButtonElement) {
    const detail: MessageActionDetail = { action, text: this.#source };
    const proceed = this.dispatchEvent(
      new CustomEvent("messageaction", { detail, bubbles: true, composed: true, cancelable: true }),
    );
    if (!proceed || action !== "copy") return;
    const copied = await copyText(this.#source);
    this.#flash(button, copied ? this.#strings.copied : this.#strings.copyFailed, copied);
  }

  /** Shows "Copied" on the button for a moment, and tells screen readers. */
  #flash(button: HTMLButtonElement, message: string, copied: boolean) {
    const announcement = this.querySelector(":scope > [data-part='announcement']");
    if (announcement) announcement.textContent = message;
    const label = button.getAttribute("aria-label");
    const content = button.innerHTML;
    if (button.dataset.part === "code-copy") button.textContent = message;
    else if (copied) button.innerHTML = this.#icons.copied;
    button.setAttribute("aria-label", message);
    button.toggleAttribute("data-copied", copied);
    clearTimeout(this.#feedback.get(button));
    this.#feedback.set(button, setTimeout(() => {
      if (announcement) announcement.textContent = "";
      if (!button.isConnected) return;
      button.innerHTML = content;
      if (label) button.setAttribute("aria-label", label);
      else button.removeAttribute("aria-label");
      button.removeAttribute("data-copied");
    }, 2000));
  }

  #onCodeCopy = async (event: MouseEvent) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-part='code-copy']");
    if (!button || !this.contains(button)) return;
    const code = button.closest("[data-part='code-block']")?.querySelector("code")?.textContent ?? "";
    const copied = await copyText(code);
    this.#flash(button, copied ? this.#strings.codeCopied : this.#strings.copyFailed, copied);
  };
}

/** The events this element fires, by name. */
export type MessageEvents = {
  messageaction: CustomEvent<MessageActionDetail>;
  messagecomplete: CustomEvent<null>;
  messagefeedback: CustomEvent<MessageFeedbackDetail>;
  messageversion: CustomEvent<MessageVersionDetail>;
};

adoptStyles(styles);
define("ai-message", AiMessageElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-message": AiMessageElement;
  }
  interface HTMLElementEventMap extends MessageEvents {}
}
