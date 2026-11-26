import "@ui-sdk/web/button";
import "./ai-message.css";
import { type Highlighter, highlight } from "./highlight.ts";
import { type MarkdownBlock, renderMarkdown, renderPlainText } from "./markdown.ts";

export type { Highlighter } from "./highlight.ts";

export type MessageAction = "copy" | "retry" | "edit";

/** What `messageaction` carries in `event.detail`. */
export type MessageActionDetail = { action: MessageAction; text: string };

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
};

export type MessageIcons = Record<MessageAction | "copied", string>;

const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const defaultMessageIcons: MessageIcons = {
  copy: icon('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  copied: icon('<path d="m5 12 5 5L20 7"/>'),
  retry: icon('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  edit: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
};

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
 */
export class AiMessageElement extends HTMLElement {
  static observedAttributes = ["from", "format", "streaming", "actions"];

  #source = "";
  #rendered = false;
  #frame = 0;
  #strings: MessageStrings = defaultMessageStrings;
  #icons: MessageIcons = defaultMessageIcons;
  #highlighter: Highlighter | null = highlight;
  #feedback = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
  #observer = new MutationObserver((records) => this.#adopt(records));

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

  /** The actions to offer, from "copy", "retry" and "edit". */
  get actions(): MessageAction[] {
    const value = this.getAttribute("actions");
    const list = value === null ? (this.from === "user" ? "copy edit" : "copy retry") : value;
    return list.split(/\s+/).filter((action): action is MessageAction => ["copy", "retry", "edit"].includes(action));
  }
  set actions(value: MessageAction[]) {
    this.setAttribute("actions", value.join(" "));
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
    const body = document.createElement("div");
    body.dataset.part = "body";
    const actions = document.createElement("div");
    actions.dataset.part = "actions";
    actions.setAttribute("role", "group");
    const announcement = document.createElement("span");
    announcement.dataset.part = "announcement";
    announcement.setAttribute("role", "status");
    this.append(
      ...slotted.filter((child) => child.slot === "header"),
      body,
      ...slotted.filter((child) => child.slot === "footer"),
      actions,
      announcement,
    );
    this.#rendered = true;
    this.addEventListener("click", this.#onCodeCopy);
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
        const body = this.querySelector(":scope > [data-part='body']");
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
    } else {
      this.#renderAll();
    }
  }

  #renderAll() {
    this.#renderBody(true);
    this.#renderActions();
    this.#syncStreaming();
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
    for (const block of blocks.slice(keep)) {
      (block.node as Rendered).aiSource = block.source;
      body.append(block.node);
    }
  }

  #renderActions() {
    const bar = this.querySelector<HTMLElement>(":scope > [data-part='actions']");
    if (!bar) return;
    const s = this.#strings;
    bar.setAttribute("aria-label", s.actions);
    bar.replaceChildren();
    for (const action of this.actions) {
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
    bar.hidden = this.actions.length === 0;
  }

  #syncStreaming() {
    const streaming = this.streaming;
    if (streaming) this.setAttribute("aria-busy", "true");
    else this.removeAttribute("aria-busy");
    const bar = this.querySelector<HTMLElement>(":scope > [data-part='actions']");
    if (bar) bar.hidden = streaming || this.actions.length === 0;
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

customElements.get("ai-message") ?? customElements.define("ai-message", AiMessageElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-message": AiMessageElement;
  }
  interface HTMLElementEventMap {
    messageaction: CustomEvent<MessageActionDetail>;
    messagecomplete: CustomEvent<null>;
  }
}
