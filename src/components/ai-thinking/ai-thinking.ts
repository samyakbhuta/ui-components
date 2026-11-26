import "./ai-thinking.css";

/** Every word `<ai-thinking>` shows or announces. Override any of them through `strings`. */
export type ThinkingStrings = {
  /** Shown while thinking, unless the `label` attribute says otherwise. */
  thinking: string;
  /** Shown once done, without `timer`. */
  done: string;
  /** Shown once done, with `timer`. */
  thoughtFor: (duration: string) => string;
  /** Formats the elapsed time. */
  duration: (seconds: number) => string;
  /** What screen readers hear when thinking starts. */
  startAnnouncement: string;
};

export const defaultThinkingStrings: ThinkingStrings = {
  thinking: "Thinking…",
  done: "Thought",
  thoughtFor: (duration) => `Thought for ${duration}`,
  duration: (seconds) => (seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`),
  startAnnouncement: "Thinking",
};

export type ThinkingStatus = "thinking" | "done";

/** How long after connecting the start is announced, so the live region exists first. */
const announceDelay = 100;

/**
 * `<ai-thinking>`: shows that an AI is working, with shimmering text, an optional timer and
 * optional reasoning that opens from the summary. See README.md beside this file.
 */
export class AiThinkingElement extends HTMLElement {
  static observedAttributes = ["status", "label", "timer", "duration"];

  #strings: ThinkingStrings = defaultThinkingStrings;
  #reasoning: Node[] = [];
  #rendered = false;
  #startedAt = 0;
  #finishedAt = 0;
  #tick?: ReturnType<typeof setInterval>;
  #announce?: ReturnType<typeof setTimeout>;

  /** "thinking" (the default) or "done". */
  get status(): ThinkingStatus {
    return this.getAttribute("status") === "done" ? "done" : "thinking";
  }
  set status(value: ThinkingStatus) {
    this.setAttribute("status", value);
  }

  /** The text shown while thinking, like "Searching files…". */
  get label(): string {
    return this.getAttribute("label") ?? "";
  }
  set label(value: string) {
    this.setAttribute("label", value);
  }

  /** Shows the elapsed time, and "Thought for 12s" once done. */
  /**
   * How many seconds the thinking took, for a summary shown again later, like a saved chat.
   * When set, a done summary shows it instead of the time this element measured.
   */
  get duration(): number | null {
    const value = this.getAttribute("duration");
    return value === null || Number.isNaN(Number(value)) ? null : Number(value);
  }
  set duration(value: number | null) {
    if (value === null) this.removeAttribute("duration");
    else this.setAttribute("duration", String(Math.max(0, Math.round(value))));
  }

  get timer(): boolean {
    return this.hasAttribute("timer");
  }
  set timer(value: boolean) {
    this.toggleAttribute("timer", value);
  }

  /** Milliseconds spent thinking so far, or in all once done. */
  get elapsed(): number {
    if (!this.#startedAt) return 0;
    return (this.#finishedAt || Date.now()) - this.#startedAt;
  }

  /** The model's reasoning, opened from the summary. Set it again as more streams in. */
  get reasoning(): string {
    return this.querySelector("[data-part='reasoning']")?.textContent ?? this.#reasoning.map((node) => node.textContent).join("");
  }
  set reasoning(text: string) {
    this.#reasoning = text ? [document.createTextNode(text)] : [];
    if (!this.#rendered) return;
    const panel = this.querySelector("[data-part='reasoning']");
    if (panel && text) panel.textContent = text;
    else this.#render();
  }

  get strings(): ThinkingStrings {
    return this.#strings;
  }
  set strings(value: Partial<ThinkingStrings>) {
    this.#strings = { ...defaultThinkingStrings, ...value };
    if (this.#rendered) this.#render();
  }

  /** Marks thinking as finished: the shimmer stops and the summary stays. */
  done() {
    this.status = "done";
  }

  /** Starts thinking again, from zero. */
  restart() {
    this.#startedAt = Date.now();
    this.#finishedAt = 0;
    if (this.status === "thinking") this.#begin();
    else this.status = "thinking";
  }

  connectedCallback() {
    if (!this.#rendered) {
      // Children written inside the element are the reasoning.
      if (this.childNodes.length && !this.#reasoning.length && this.textContent!.trim()) this.#reasoning = [...this.childNodes];
      this.#render();
    }
    if (this.status === "thinking") this.#begin();
  }

  disconnectedCallback() {
    clearInterval(this.#tick);
    clearTimeout(this.#announce);
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null) {
    if (previous === next || !this.#rendered) return;
    if (name === "status") {
      if (this.status === "done") this.#finish();
      else this.#begin(true);
    } else {
      this.#update();
    }
  }

  #begin(restart = false) {
    if (!this.#startedAt || restart) this.#startedAt = Date.now();
    this.#finishedAt = 0;
    clearInterval(this.#tick);
    this.#tick = setInterval(() => this.#update(), 1000);
    this.#update();
    this.#say("");
    clearTimeout(this.#announce);
    this.#announce = setTimeout(() => this.#say(this.label || this.#strings.startAnnouncement), announceDelay);
  }

  #finish() {
    if (!this.#startedAt) this.#startedAt = Date.now();
    if (!this.#finishedAt) this.#finishedAt = Date.now();
    clearInterval(this.#tick);
    clearTimeout(this.#announce);
    this.#update();
    this.#say(this.#summaryText());
  }

  #seconds() {
    return Math.round(this.elapsed / 1000);
  }

  #summaryText() {
    const s = this.#strings;
    if (this.status === "thinking") return this.label || s.thinking;
    const seconds = this.duration ?? this.#seconds();
    return this.timer ? s.thoughtFor(s.duration(seconds)) : s.done;
  }

  #render() {
    const open = this.querySelector("details")?.open ?? false;
    const summary = `
      <span data-part="label"></span>
      <span data-part="time" aria-hidden="true"></span>`;
    this.innerHTML = this.#reasoning.length
      ? `<details data-part="details"><summary data-part="summary">${summary}</summary><div data-part="reasoning"></div></details>`
      : `<div data-part="summary">${summary}</div>`;
    this.insertAdjacentHTML("beforeend", `<span data-part="announcement" role="status"></span>`);
    this.querySelector("[data-part='reasoning']")?.append(...this.#reasoning);
    const details = this.querySelector("details");
    if (details) details.open = open;
    this.#rendered = true;
    this.#update();
  }

  #update() {
    const label = this.querySelector("[data-part='label']");
    const time = this.querySelector("[data-part='time']");
    if (!label || !time) return;
    const thinking = this.status === "thinking";
    label.textContent = this.#summaryText();
    label.toggleAttribute("data-shimmer", thinking);
    time.textContent = thinking && this.timer ? this.#strings.duration(this.#seconds()) : "";
    this.toggleAttribute("data-thinking", thinking);
    this.toggleAttribute("data-done", !thinking);
  }

  #say(text: string) {
    const announcement = this.querySelector("[data-part='announcement']");
    if (announcement) announcement.textContent = text;
  }
}

customElements.get("ai-thinking") ?? customElements.define("ai-thinking", AiThinkingElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-thinking": AiThinkingElement;
  }
}
