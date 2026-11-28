import "@ui-sdk/web/button";
import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-notice.css?inline";

/** How serious the notice is. It sets the colour and the icon. */
export type NoticeTone = "warning" | "error" | "info";

/** A button or link on the notice. With `href` it's a link; otherwise a button that fires `noticeaction`. */
export type NoticeAction = {
  value: string;
  label: string;
  /** Makes it a link to this address. Only `http:`, `https:`, `mailto:`, relative addresses and `#…` are kept. */
  href?: string;
  /** Opens the link in a new tab. */
  newTab?: boolean;
  /** The main action, shown solid. Only the first one counts. */
  primary?: boolean;
  disabled?: boolean;
};

/** What `noticeaction` carries in `event.detail`. */
export type NoticeActionDetail = { value: string };

/** Every word `<ai-notice>` shows or announces. Override any of them through `strings`. */
export type NoticeStrings = {
  /** The line saying when it resets. `lang` is the element's language, for formatting the time. */
  resets: (at: Date, now: Date, lang: string) => string;
  /** Shown, and announced, once the reset time has passed. */
  expired: string;
  /** The dismiss button's name, with `dismissible`. */
  dismiss: string;
  /** Added to a link's name when it opens in a new tab. */
  newTab: string;
  /** The tone, said before the heading: "Warning", "Error" or "Note". */
  tone: (tone: NoticeTone) => string;
};

/** "Resets at 3:00 PM · in 2 hours", or with the day when it isn't today. */
function resetsLine(at: Date, now: Date, lang: string) {
  const time = new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit" }).format(at);
  const sameDay = at.toDateString() === now.toDateString();
  const when = sameDay ? `at ${time}` : `on ${new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short" }).format(at)} at ${time}`;
  const minutes = Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 60_000));
  const relative = new Intl.RelativeTimeFormat(lang, { numeric: "always" });
  const inWords =
    minutes < 60
      ? relative.format(minutes, "minute")
      : minutes < 48 * 60
        ? relative.format(Math.round(minutes / 60), "hour")
        : relative.format(Math.round(minutes / 1440), "day");
  return `Resets ${when} · ${inWords}`;
}

export const defaultNoticeStrings: NoticeStrings = {
  resets: resetsLine,
  expired: "You can carry on now.",
  dismiss: "Dismiss",
  newTab: "(opens in a new tab)",
  tone: (tone) => (tone === "error" ? "Error" : tone === "info" ? "Note" : "Warning"),
};

/** The events this element fires, by name. */
export type NoticeEvents = {
  noticeaction: CustomEvent<NoticeActionDetail>;
  noticeexpire: CustomEvent<null>;
  noticedismiss: CustomEvent<null>;
};

const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const icons: Record<NoticeTone | "dismiss", string> = {
  warning: icon('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  error: icon('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
  info: icon('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  dismiss: icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
};

/** Addresses a link may go to. */
const safeHref = /^(?:https?:|mailto:|#|\/|\.{0,2}\/|[^:]*$)/i;

const tones: NoticeTone[] = ["warning", "error", "info"];

let count = 0;

/**
 * `<ai-notice>`: something that stops the conversation and needs action, like a usage limit,
 * a lapsed sign-in or a lost connection. It has a heading, a message, an optional reset time
 * that counts down, and your buttons and links. See README.md beside this file.
 *
 * @customElement ai-notice
 * @fires noticeaction - A button or link was pressed. Cancelable.
 * @fires noticeexpire - The reset time passed.
 * @fires noticedismiss - Dismiss was pressed. Cancelable.
 */
export class AiNoticeElement extends BaseElement {
  static observedAttributes = ["heading", "tone", "resets-at", "dismissible"];

  #strings: NoticeStrings = defaultNoticeStrings;
  #text = "";
  #actions: NoticeAction[] = [];
  #rendered = false;
  #timer?: ReturnType<typeof setTimeout>;
  #id = `ai-notice-${++count}`;

  /** What it's about, like "You've reached your usage limit". */
  get heading(): string {
    return this.getAttribute("heading") ?? "";
  }
  set heading(value: string) {
    this.setAttribute("heading", value);
  }

  /** `warning` (the default), `error` or `info`. */
  get tone(): NoticeTone {
    const tone = this.getAttribute("tone") as NoticeTone;
    return tones.includes(tone) ? tone : "warning";
  }
  set tone(value: NoticeTone) {
    this.setAttribute("tone", value);
  }

  /** The message under the heading. Shown as text, never parsed as HTML. */
  get text(): string {
    return this.#text;
  }
  set text(value: string) {
    this.#text = value ?? "";
    this.#sync();
  }

  /** The buttons and links, in order. */
  get actions(): NoticeAction[] {
    return this.#actions;
  }
  set actions(value: NoticeAction[]) {
    this.#actions = [...(value ?? [])];
    this.#renderActions();
  }

  /** When it stops applying, like when a limit resets. Shown as a time that counts down. */
  get resetsAt(): Date | null {
    const value = this.getAttribute("resets-at");
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }
  set resetsAt(value: Date | string | null) {
    const date = value === null || value === undefined || value === "" ? null : value instanceof Date ? value : new Date(value);
    if (date && !Number.isNaN(date.getTime())) this.setAttribute("resets-at", date.toISOString());
    else this.removeAttribute("resets-at");
  }

  /** Adds a button to close it. */
  get dismissible(): boolean {
    return this.hasAttribute("dismissible");
  }
  set dismissible(value: boolean) {
    this.toggleAttribute("dismissible", value !== false);
  }

  /** True once the reset time has passed. */
  get expired(): boolean {
    return this.hasAttribute("expired");
  }

  get strings(): NoticeStrings {
    return this.#strings;
  }
  set strings(value: Partial<NoticeStrings>) {
    this.#strings = { ...defaultNoticeStrings, ...value };
    this.#sync();
    this.#renderActions();
  }

  connectedCallback() {
    if (!this.#rendered) {
      // Text written inside is the message.
      if (!this.#text) this.#text = (this.textContent ?? "").replace(/\s+/g, " ").trim();
      this.#rendered = true;
      this.#render();
      this.#announce();
    } else {
      this.#sync();
    }
  }

  disconnectedCallback() {
    clearTimeout(this.#timer);
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null) {
    if (previous === next) return;
    // A new reset time starts over.
    if (name === "resets-at") this.removeAttribute("expired");
    this.#sync();
  }

  /** Presses the action with this value, as a click does. Returns false when nothing happened. */
  act(value: string): boolean {
    const action = this.#actions.find((item) => item.value === value);
    if (!action || action.disabled) return false;
    const detail: NoticeActionDetail = { value };
    return this.dispatchEvent(new CustomEvent("noticeaction", { detail, bubbles: true, composed: true, cancelable: true }));
  }

  /** Closes it, as Dismiss does. Returns false when a listener cancelled it. */
  dismiss(): boolean {
    const proceed = this.dispatchEvent(new CustomEvent("noticedismiss", { detail: null, bubbles: true, composed: true, cancelable: true }));
    if (proceed) this.hidden = true;
    return proceed;
  }

  // ---- Rendering -------------------------------------------------------------------------------

  #render() {
    const mark = document.createElement("span");
    mark.dataset.part = "icon";

    const body = document.createElement("div");
    body.dataset.part = "body";
    const heading = document.createElement("p");
    heading.dataset.part = "heading";
    heading.id = `${this.#id}-heading`;
    const text = document.createElement("p");
    text.dataset.part = "text";
    text.id = `${this.#id}-text`;
    const resets = document.createElement("p");
    resets.dataset.part = "resets";
    resets.id = `${this.#id}-resets`;
    const actions = document.createElement("div");
    actions.dataset.part = "actions";
    body.append(heading, text, resets, actions);

    const dismiss = document.createElement("ui-button");
    dismiss.dataset.part = "dismiss";
    const close = document.createElement("button");
    close.type = "button";
    close.innerHTML = icons.dismiss;
    dismiss.append(close);
    dismiss.addEventListener("action", () => this.dismiss());

    const announcement = document.createElement("span");
    announcement.dataset.part = "announcement";
    announcement.setAttribute("role", "status");

    this.replaceChildren(mark, body, dismiss, announcement);
    if (!this.hasAttribute("role")) this.setAttribute("role", "group");
    this.setAttribute("aria-describedby", `${text.id} ${resets.id}`);
    this.#renderActions();
    this.#sync();
  }

  #renderActions() {
    const bar = this.querySelector<HTMLElement>(":scope > [data-part='body'] > [data-part='actions']");
    if (!bar) return;
    const s = this.#strings;
    let primary = false;
    bar.replaceChildren(
      ...this.#actions.map((action) => {
        const main = Boolean(action.primary) && !primary;
        primary ||= main;
        const href = action.href && safeHref.test(action.href.trim()) ? action.href.trim() : "";
        if (href) {
          const link = document.createElement("a");
          link.dataset.part = "action";
          link.dataset.value = action.value;
          link.toggleAttribute("data-primary", main);
          link.href = href;
          link.textContent = action.label;
          if (action.newTab) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.setAttribute("aria-label", `${action.label} ${s.newTab}`);
          }
          link.addEventListener("click", (event) => {
            if (!this.act(action.value)) event.preventDefault();
          });
          return link;
        }
        const wrapper = document.createElement("ui-button");
        wrapper.dataset.part = "action";
        wrapper.dataset.value = action.value;
        wrapper.toggleAttribute("data-primary", main);
        wrapper.toggleAttribute("disabled", Boolean(action.disabled));
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = action.label;
        wrapper.append(button);
        wrapper.addEventListener("action", () => this.act(action.value));
        return wrapper;
      }),
    );
    this.#sync();
  }

  /** Says the notice out loud when it appears, unless a transcript reads it with the reply. */
  #announce() {
    if (this.closest("ai-transcript")) return;
    const announcement = this.querySelector<HTMLElement>(":scope > [data-part='announcement']");
    if (!announcement) return;
    const words = [this.heading, this.#text].filter(Boolean).join(". ");
    requestAnimationFrame(() => (announcement.textContent = words));
  }

  /** Brings the parts in line with the state, without rebuilding them, and keeps the reset time current. */
  #sync() {
    if (!this.#rendered) return;
    clearTimeout(this.#timer);
    const s = this.#strings;
    const part = <T extends HTMLElement = HTMLElement>(selector: string) => this.querySelector<T>(selector)!;
    const tone = this.tone;
    part(":scope > [data-part='icon']").innerHTML = icons[tone];
    part("[data-part='heading']").textContent = this.heading;
    // The icon shows the tone; the name says it.
    this.setAttribute("aria-label", this.heading ? `${s.tone(tone)}: ${this.heading}` : s.tone(tone));
    const text = part("[data-part='text']");
    text.textContent = this.#text;
    text.hidden = !this.#text;

    const close = part(":scope > [data-part='dismiss']");
    close.hidden = !this.dismissible;
    close.querySelector("button")!.setAttribute("aria-label", s.dismiss);
    close.querySelector("button")!.title = s.dismiss;

    const resets = part("[data-part='resets']");
    const at = this.resetsAt;
    const now = new Date();
    const actions = part("[data-part='body'] > [data-part='actions']");
    if (!at) {
      resets.hidden = true;
      resets.textContent = "";
      actions.hidden = this.#actions.length === 0;
      return;
    }
    const passed = at.getTime() <= now.getTime();
    resets.hidden = false;
    resets.textContent = passed ? s.expired : s.resets(at, now, this.closest("[lang]")?.getAttribute("lang") || navigator.language);
    // Once it's over, the way round it isn't needed.
    actions.hidden = passed || this.#actions.length === 0;
    if (passed) {
      if (!this.expired) {
        this.toggleAttribute("expired", true);
        if (this.isConnected) {
          const announcement = part(":scope > [data-part='announcement']");
          announcement.textContent = s.expired;
          this.dispatchEvent(new CustomEvent("noticeexpire", { detail: null, bubbles: true, composed: true }));
        }
      }
      return;
    }
    if (!this.isConnected) return;
    // Check again at the next minute, or at the reset time if that's sooner.
    const untilMinute = 60_000 - (now.getTime() % 60_000);
    this.#timer = setTimeout(() => this.#sync(), Math.min(untilMinute, at.getTime() - now.getTime()) + 20);
  }
}

adoptStyles(styles);
define("ai-notice", AiNoticeElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-notice": AiNoticeElement;
  }
  interface HTMLElementEventMap extends NoticeEvents {}
}
