import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-transcript.css?inline";

/** Every word `<ai-transcript>` shows or announces. Override any of them through `strings`. */
export type TranscriptStrings = {
  /** The conversation's accessible name, unless the page sets `aria-label`. */
  label: string;
  jump: string;
  /** What screen readers hear when a reply finishes. Return "" to say nothing. */
  reply: (text: string) => string;
  /** Read after the reply for each `<ai-question>` in it still waiting for an answer. */
  waiting: (question: string) => string;
  /** Read after the reply for each `<ai-approval>` in it still waiting for a decision. */
  approval: (label: string) => string;
  /** Read after the reply for each `<ai-plan>` in it still waiting for a decision. */
  plan: (heading: string) => string;
  /** Read after the reply for each `<ai-questions>` set in it still waiting: its first question, and how many. */
  questions: (first: string, count: number) => string;
};

export const defaultTranscriptStrings: TranscriptStrings = {
  label: "Conversation",
  jump: "Jump to latest",
  reply: (text) => text,
  waiting: (question) => `${question} Waiting for your answer.`,
  approval: (label) => `${label} Waiting for your approval.`,
  plan: (heading) => `${heading} Waiting for your review.`,
  questions: (first, count) => `${count} questions, starting with: ${first} Waiting for your answers.`,
};

/** How close to the bottom, in pixels, still counts as "at the bottom". */
const nearBottom = 24;

type Message = HTMLElement & { from?: string; streaming?: boolean };

/**
 * `<ai-transcript>`: the scrolling conversation. It follows new text while you're at the bottom,
 * stays put when you scroll up, offers "Jump to latest", and tells screen readers about each
 * finished reply once. See README.md beside this file.
 *
 * @customElement ai-transcript
 */
export class AiTranscriptElement extends BaseElement {
  /** Read when a reply finishes, so there's nothing to do when it changes. Listed for editors and frameworks. */
  static observedAttributes = ["announce"];

  #strings: TranscriptStrings = defaultTranscriptStrings;
  #stuck = true;
  #lastTop = 0;
  #rendered = false;
  #resize = new ResizeObserver(() => this.#follow());
  #jump = document.createElement("button");
  #jumpBar = document.createElement("div");
  #announcement = document.createElement("div");
  #mutations = new MutationObserver((records) => this.#changed(records));

  get strings(): TranscriptStrings {
    return this.#strings;
  }
  set strings(value: Partial<TranscriptStrings>) {
    this.#strings = { ...defaultTranscriptStrings, ...value };
    this.#label();
    this.#jump.textContent = this.#strings.jump;
  }

  /** Whether it is following new content: true at the bottom, false once scrolled up. */
  get following(): boolean {
    return this.#stuck;
  }

  /** Scrolls to the newest message and follows new content again. */
  scrollToLatest({ smooth = false } = {}) {
    this.#stuck = true;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (smooth && !reduce) this.scrollTo({ top: this.scrollHeight, behavior: "smooth" });
    else this.scrollTop = this.scrollHeight;
    this.#lastTop = this.scrollTop;
    this.#updateJump();
  }

  connectedCallback() {
    if (!this.#rendered) {
      this.#rendered = true;
      this.#label();
      if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
      const jump = this.#jump;
      this.#jumpBar.dataset.part = "jump-bar";
      jump.type = "button";
      jump.dataset.part = "jump";
      jump.textContent = this.#strings.jump;
      jump.hidden = true;
      jump.addEventListener("click", () => {
        this.scrollToLatest({ smooth: true });
        // Keep keyboard focus in the conversation rather than on a button that's about to hide.
        this.focus({ preventScroll: true });
      });
      this.#jumpBar.append(jump);
      this.#announcement.dataset.part = "announcement";
      this.#announcement.setAttribute("role", "status");
      this.append(this.#jumpBar, this.#announcement);
      this.addEventListener("scroll", () => this.#scrolled(), { passive: true });
      this.addEventListener("messagecomplete", (event) => this.#announce(event.target as Message));
    }
    for (const child of this.#messages()) this.#resize.observe(child);
    this.#mutations.observe(this, { childList: true, attributes: true, subtree: true, attributeFilter: ["streaming"] });
    this.#syncBusy();
    requestAnimationFrame(() => this.scrollToLatest());
  }

  disconnectedCallback() {
    this.#resize.disconnect();
    this.#mutations.disconnect();
  }

  #label() {
    if (!this.hasAttribute("role")) this.setAttribute("role", "region");
    if (!this.hasAttribute("aria-label") || this.dataset.labelled === "auto") {
      this.setAttribute("aria-label", this.#strings.label);
      this.dataset.labelled = "auto";
    }
  }

  #messages() {
    return [...this.children].filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child !== this.#jumpBar && child !== this.#announcement && child.slot !== "empty",
    );
  }

  #distance() {
    return this.scrollHeight - this.scrollTop - this.clientHeight;
  }

  #scrolled() {
    const top = this.scrollTop;
    if (this.#distance() <= nearBottom) this.#stuck = true;
    else if (top < this.#lastTop - 1) this.#stuck = false;
    this.#lastTop = top;
    this.#updateJump();
  }

  /** Keeps the newest content in view while following. */
  #follow() {
    if (this.#stuck && this.#distance() > 0) {
      this.scrollTop = this.scrollHeight;
      this.#lastTop = this.scrollTop;
    }
    this.#updateJump();
  }

  #updateJump() {
    this.#jump.hidden = this.#stuck || this.#distance() <= nearBottom;
  }

  #changed(records: MutationRecord[]) {
    let busyChanged = false;
    for (const record of records) {
      if (record.type === "attributes") {
        busyChanged = true;
        continue;
      }
      if (record.target !== this) continue;
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement) || node === this.#jumpBar || node === this.#announcement || node.slot === "empty") continue;
        this.#resize.observe(node);
        busyChanged = true;
        // Your own new message always brings the conversation to the bottom.
        if ((node as Message).from === "user" || node.getAttribute("from") === "user") this.#stuck = true;
      }
      for (const node of record.removedNodes) if (node instanceof HTMLElement) this.#resize.unobserve(node);
    }
    // Keep the jump bar and the live region last, after anything appended.
    if (this.lastElementChild !== this.#announcement || this.#announcement.previousElementSibling !== this.#jumpBar) {
      this.append(this.#jumpBar, this.#announcement);
    }
    if (busyChanged) this.#syncBusy();
    this.#follow();
  }

  #syncBusy() {
    const busy = this.#messages().some((message) => message.hasAttribute("streaming"));
    if (busy) this.setAttribute("aria-busy", "true");
    else this.removeAttribute("aria-busy");
  }

  #announce(message: Message) {
    if (message.getAttribute("from") === "user" || this.getAttribute("announce") === "none") return;
    this.#syncBusy();
    const body = message.querySelector("[data-part='body']");
    const text = (body ?? message).textContent?.trim() ?? "";
    // A question, an approval or a plan the reply asks for is read after it, so people know the
    // agent is waiting on them.
    const waiting = [...message.querySelectorAll("ai-question:not([answered]), ai-approval:not([decided]), ai-plan:not([decided]), ai-questions:not([answered])")]
      .map((element) => {
        // A set's questions are read as the set.
        if (element.localName === "ai-question" && element.parentElement?.closest("ai-questions")) return "";
        if (element.localName === "ai-questions") {
          const questions = element.querySelectorAll("ai-question");
          const first = questions[0]?.getAttribute("question")?.trim();
          return first ? this.#strings.questions(first, questions.length) : "";
        }
        if (element.localName === "ai-question") {
          const question = element.getAttribute("question")?.trim();
          return question ? this.#strings.waiting(question) : "";
        }
        const heading = element.querySelector("[data-part='heading']")?.textContent?.trim();
        if (!heading) return "";
        return element.localName === "ai-plan" ? this.#strings.plan(heading) : this.#strings.approval(heading);
      })
      .filter(Boolean);
    const words = [text && this.#strings.reply(text), ...waiting].filter(Boolean).join(" ");
    const announcement = this.#announcement;
    if (!words) return;
    // Clear first, so the same words twice in a row are still read out.
    announcement.textContent = "";
    requestAnimationFrame(() => (announcement.textContent = words));
  }
}

adoptStyles(styles);
define("ai-transcript", AiTranscriptElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-transcript": AiTranscriptElement;
  }
}
