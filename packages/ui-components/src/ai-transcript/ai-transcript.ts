import "@ui-sdk/web/button";
import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-transcript.css?inline";

/** Every word `<ai-transcript>` shows or announces. Override any of them through `strings`. */
export type TranscriptStrings = {
  /** The conversation's accessible name, unless the page sets `aria-label`. */
  label: string;
  jump: string;
  /** The button over selected words in a message, with `quotable`. */
  quote: string;
  /** The same button on a touch screen, at the bottom of the conversation, clear of the phone's own menu. */
  quoteSelection: string;
  /** Where words quoted from a card came from, like "Plan: Surprise party". `name` is the card's heading or name. */
  quoteSource: (kind: QuoteSourceKind, name: string) => string;
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
  /** Read after the reply for each `<ai-notice>` in it that still applies: its heading, message and reset line. */
  notice: (heading: string, text: string, resets: string) => string;
  /** The jump button while something below waits on the person: a question, an approval, a plan or a notice. */
  jumpWaiting: (kind: WaitingKind) => string;
};

/** What the conversation can be waiting on the person for. */
export type WaitingKind = "answer" | "approval" | "review" | "notice";

/** The cards in a message that words can be quoted from. */
export type QuoteSourceKind = "plan" | "tool" | "approval" | "question" | "questions" | "notice" | "sources" | "thinking";

/**
 * What `messagequote` carries in `event.detail`: the words selected, the message they're in, and,
 * for words in a card like a plan, where they came from.
 */
export type MessageQuoteDetail = { text: string; message: HTMLElement; from: "user" | "assistant"; source?: string };

const sourceCards: Record<string, QuoteSourceKind> = {
  "ai-plan": "plan",
  "ai-tool-call": "tool",
  "ai-approval": "approval",
  "ai-questions": "questions",
  "ai-question": "question",
  "ai-notice": "notice",
  "ai-sources": "sources",
  "ai-thinking": "thinking",
};

/** Controls and the message's own chrome: selecting in them offers no Quote. */
const notQuotable =
  "button, input, textarea, select, [contenteditable], ai-message > [data-part='actions'], ai-message > [data-part='meta'], ai-message > [data-part='quotes'], ai-message > [data-part='announcement']";

export type TranscriptEvents = {
  messagequote: CustomEvent<MessageQuoteDetail>;
};

/** Cards that wait on the person, as long as they're open. A set's own questions count as the set. */
const waitingCards =
  "ai-question:not([answered]):not(ai-questions ai-question), ai-questions:not([answered]), ai-approval:not([decided]), ai-plan:not([decided]), ai-notice:not([expired]):not([hidden]):not([tone='info'])";

const kindOf = (card: Element): WaitingKind =>
  card.localName === "ai-approval" ? "approval" : card.localName === "ai-plan" ? "review" : card.localName === "ai-notice" ? "notice" : "answer";

/**
 * What to focus in a card, so it can be answered at once: its first choice, else its first button
 * or link (like Allow once), else a text box. Not a box that's only focusable to scroll, like a command.
 */
function firstControl(card: HTMLElement): HTMLElement | null {
  const usable = (control: HTMLElement) =>
    !(control as HTMLButtonElement).disabled && !control.closest("[inert], [hidden]") && control.getClientRects().length > 0;
  for (const selector of [
    "input[type='radio'], input[type='checkbox'], [role='radio'], [role='checkbox']",
    "button, a[href]",
    "input:not([type='hidden']), textarea, select",
  ]) {
    const controls = [...card.querySelectorAll<HTMLElement>(selector)].filter(usable);
    // In a radio group only the checked choice, or else the first, takes focus.
    const checked = controls.find((control) => (control as HTMLInputElement).checked || control.getAttribute("aria-checked") === "true");
    if (controls.length) return checked && /radio/.test(selector) ? checked : controls[0];
  }
  return null;
}

export const defaultTranscriptStrings: TranscriptStrings = {
  label: "Conversation",
  jump: "Jump to latest",
  quote: "Quote",
  quoteSelection: "Quote selection",
  quoteSource: (kind, name) =>
    kind === "plan"
      ? `Plan: ${name}`
      : kind === "question"
        ? `Question: ${name}`
        : kind === "questions"
          ? "Questions"
          : kind === "sources"
            ? "Sources"
            : kind === "thinking"
              ? "Thinking"
              : name,
  reply: (text) => text,
  waiting: (question) => `${question} Waiting for your answer.`,
  approval: (label) => `${label} Waiting for your approval.`,
  plan: (heading) => `${heading} Waiting for your review.`,
  questions: (first, count) => `${count} questions, starting with: ${first} Waiting for your answers.`,
  jumpWaiting: (kind) =>
    kind === "approval" ? "Waiting for your approval" : kind === "review" ? "Waiting for your review" : kind === "notice" ? "Sending is paused" : "Waiting for your answer",
  notice: (heading, text, resets) => [heading, text, resets].filter(Boolean).map((part) => (/[.!?]$/.test(part) ? part : `${part}.`)).join(" "),
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
  static observedAttributes = ["announce", "quotable", "for"];

  #strings: TranscriptStrings = defaultTranscriptStrings;
  #stuck = true;
  #lastTop = 0;
  #rendered = false;
  #resize = new ResizeObserver(() => this.#follow());
  #jump = document.createElement("button");
  #quote = document.createElement("button");
  #quoteFrame = 0;
  /** How the last selection was made: by touch, the Quote button docks at the bottom. */
  #touch = false;
  /** The selection the Quote button was shown for, kept while it's pressed: a tap can clear the selection first. */
  #lastSelected: { text: string; message: Message; source?: string } | null = null;
  #pressing = false;
  /** The waiting card the jump button names, if it does. */
  #pointsTo: HTMLElement | null = null;
  #jumpBar = document.createElement("div");
  #announcement = document.createElement("div");
  #mutations = new MutationObserver((records) => this.#changed(records));

  get strings(): TranscriptStrings {
    return this.#strings;
  }
  set strings(value: Partial<TranscriptStrings>) {
    this.#strings = { ...defaultTranscriptStrings, ...value };
    this.#label();
    this.#updateJump();
    this.#quote.textContent = this.#quote.hasAttribute("data-docked") ? this.#strings.quoteSelection : this.#strings.quote;
  }

  /** Whether selecting words in a message offers a Quote button. The same as the `quotable` attribute. */
  get quotable(): boolean {
    return this.hasAttribute("quotable");
  }
  set quotable(value: boolean) {
    this.toggleAttribute("quotable", value !== false);
  }

  /** Whether it is following new content: true at the bottom, false once scrolled up. */
  get following(): boolean {
    return this.#stuck;
  }

  /**
   * The newest card waiting on the person, like a question not yet answered, or null. While it's
   * below what's in view, the jump button says so, and takes you to it.
   */
  get waiting(): HTMLElement | null {
    const cards = [...this.querySelectorAll<HTMLElement>(waitingCards)];
    return cards.at(-1) ?? null;
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
      jump.hidden = true;
      const jumpButton = document.createElement("ui-button");
      jumpButton.append(jump);
      jumpButton.addEventListener("action", () => {
        // The card the button named, even if focusing the button scrolled a little since.
        const card = this.#pointsTo;
        if (card?.isConnected && card.matches(waitingCards)) return this.#goTo(card);
        this.scrollToLatest({ smooth: true });
        // Keep keyboard focus in the conversation rather than on a button that's about to hide.
        this.focus({ preventScroll: true });
      });
      const dot = document.createElement("span");
      dot.dataset.part = "jump-dot";
      dot.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.dataset.part = "jump-label";
      jump.append(dot, label);
      const quote = this.#quote;
      quote.type = "button";
      quote.dataset.part = "quote-button";
      quote.hidden = true;
      // Pressing it mustn't clear the selection it quotes.
      quote.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.#pressing = true;
      });
      // A press that ends without a click, like a drag away, lets go after a moment.
      for (const type of ["pointercancel", "pointerup"]) {
        quote.addEventListener(type, () =>
          setTimeout(() => {
            if (!this.#pressing) return;
            this.#pressing = false;
            this.#onSelection();
          }, 400),
        );
      }
      quote.addEventListener("mousedown", (event) => event.preventDefault());
      // ui-sdk Buttons, so agents see them too.
      const quoteButton = document.createElement("ui-button");
      quoteButton.append(quote);
      quoteButton.addEventListener("action", () => this.#quoteSelection());
      this.#jumpBar.append(jumpButton, quoteButton);
      this.#updateJump();
      this.#announcement.dataset.part = "announcement";
      this.#announcement.setAttribute("role", "status");
      this.append(this.#jumpBar, this.#announcement);
      this.addEventListener("scroll", () => {
        this.#scrolled();
        if (!this.#quote.hidden) this.#placeQuote();
      }, { passive: true });

      this.addEventListener("messagecomplete", (event) => this.#announce(event.target as Message));
    }
    for (const child of this.#messages()) this.#resize.observe(child);
    this.#mutations.observe(this, {
      childList: true,
      attributes: true,
      subtree: true,
      // Streaming, for aria-busy; the rest, for when a waiting card is answered or goes.
      attributeFilter: ["streaming", "answered", "decided", "expired", "hidden"],
    });
    this.#syncBusy();
    this.#quote.textContent = this.#strings.quote;
    document.addEventListener("selectionchange", this.#onSelection);
    document.addEventListener("keydown", this.#onKey);
    document.addEventListener("pointerdown", this.#onPointer, true);
    requestAnimationFrame(() => this.scrollToLatest());
  }

  disconnectedCallback() {
    this.#resize.disconnect();
    this.#mutations.disconnect();
    document.removeEventListener("selectionchange", this.#onSelection);
    document.removeEventListener("keydown", this.#onKey);
    document.removeEventListener("pointerdown", this.#onPointer, true);
    cancelAnimationFrame(this.#quoteFrame);
  }

  /** The selected words, and the message they're in, when they're all in one message's text here. */
  #selected(): { text: string; message: Message; range: Range; source?: string } | null {
    const selection = document.getSelection();
    if (!this.quotable || !selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const element = (node: Node) => (node instanceof Element ? node : node.parentElement);
    // The message here that holds a node: a child of the transcript.
    const messageOf = (node: Node) => {
      let message = element(node)?.closest("ai-message") ?? null;
      while (message && message.parentElement !== this) message = message.parentElement?.closest("ai-message") ?? null;
      return message;
    };
    const start = element(range.startContainer);
    const end = element(range.endContainer);
    const message = messageOf(range.startContainer);
    if (!start || !end || !message || message !== messageOf(range.endContainer)) return null;
    if (start.closest(notQuotable) || end.closest(notQuotable)) return null;
    const text = selection.toString().trim();
    if (!text) return null;
    // Words in a card, like a plan, say which card.
    const card = element(range.commonAncestorContainer)?.closest(Object.keys(sourceCards).join(","));
    let source: string | undefined;
    if (card && message.contains(card)) {
      const kind = sourceCards[card.localName];
      const set = kind === "question" ? card.parentElement?.closest("ai-questions") : null;
      const from = set ?? card;
      const fromKind = set ? "questions" : kind;
      const name =
        from.getAttribute("heading") ||
        from.querySelector(":scope [data-part='heading']")?.textContent?.trim() ||
        from.getAttribute("question") ||
        from.getAttribute("label") ||
        from.getAttribute("name") ||
        "";
      source = this.#strings.quoteSource(fromKind, name.length > 60 ? `${name.slice(0, 60)}…` : name) || undefined;
    }
    return { text, message: message as Message, range, source };
  }

  /** Escape hides Quote, wherever focus is: after selecting with a mouse, it's usually on the page. */
  #onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && !this.#quote.hidden) {
      this.#quote.hidden = true;
      this.#updateJump();
    }
  };

  #onPointer = (event: PointerEvent) => {
    if (event.target !== this.#quote) this.#touch = event.pointerType === "touch" || event.pointerType === "pen";
  };

  #onSelection = () => {
    cancelAnimationFrame(this.#quoteFrame);
    this.#quoteFrame = requestAnimationFrame(() => {
      const selected = this.#selected();
      // Pressing the button can clear the selection before the click: keep it up until then.
      if (!selected && this.#pressing) return;
      this.#lastSelected = selected ? { text: selected.text, message: selected.message, source: selected.source } : null;
      // On a touch screen the phone draws its own menu over the selection, so the button docks
      // at the bottom of the conversation instead, where Jump to latest goes.
      const docked = Boolean(selected) && (this.#touch || window.matchMedia?.("(hover: none)").matches === true);
      this.#quote.toggleAttribute("data-docked", docked);
      this.#quote.textContent = docked ? this.#strings.quoteSelection : this.#strings.quote;
      this.#quote.hidden = !selected;
      if (selected) this.#placeQuote();
      this.#updateJump();
    });
  };

  /** Floats the Quote button just above the selection, or below it when there's no room above. */
  #placeQuote() {
    const selected = this.#selected();
    if (!selected) return void (this.#quote.hidden = true);
    if (this.#quote.hasAttribute("data-docked")) {
      // Centred at the bottom edge of the conversation, however long it is.
      const view = this.getBoundingClientRect();
      const button = this.#quote.getBoundingClientRect();
      this.#quote.style.visibility = "";
      this.#quote.style.top = `${Math.round(view.bottom - button.height - 12)}px`;
      this.#quote.style.left = `${Math.round(view.left + (view.width - button.width) / 2)}px`;
      return;
    }
    const range = selected.range;
    // Some environments, like jsdom, can't measure a range; leave it where it is there.
    if (typeof range.getClientRects !== "function") return;
    const rects = [...range.getClientRects()];
    const first = rects[0] ?? range.getBoundingClientRect();
    const view = this.getBoundingClientRect();
    const button = this.#quote.getBoundingClientRect();
    const gap = 6;
    let top = first.top - button.height - gap;
    if (top < view.top) top = (rects.at(-1) ?? first).bottom + gap;
    // Out of view altogether: hide it until the words come back.
    if (top < view.top - button.height || top > view.bottom) return void (this.#quote.style.visibility = "hidden");
    this.#quote.style.visibility = "";
    const left = Math.min(Math.max(first.left, view.left + gap), view.right - button.width - gap);
    this.#quote.style.top = `${Math.round(top)}px`;
    this.#quote.style.left = `${Math.round(left)}px`;
  }

  /** Fires `messagequote` with the selected words; unless cancelled, quotes them into the composer named by `for`. */
  #quoteSelection() {
    this.#pressing = false;
    const current = this.#selected();
    const kept = this.#lastSelected?.message.isConnected ? this.#lastSelected : null;
    const selected = current ?? kept;
    this.#lastSelected = null;
    this.#quote.hidden = true;
    this.#updateJump();
    if (!selected) return;
    const detail: MessageQuoteDetail = {
      text: selected.text,
      message: selected.message,
      from: selected.message.getAttribute("from") === "user" ? "user" : "assistant",
      ...(selected.source ? { source: selected.source } : {}),
    };
    const go = this.dispatchEvent(new CustomEvent("messagequote", { detail, bubbles: true, composed: true, cancelable: true }));
    document.getSelection()?.removeAllRanges();
    const id = this.getAttribute("for");
    const composer = id ? (this.getRootNode() as Document | ShadowRoot).getElementById?.(id) : null;
    if (go && composer && typeof (composer as HTMLElement & { addQuote?: unknown }).addQuote === "function") {
      (composer as HTMLElement & { addQuote(quote: { text: string; from: string; source?: string }): boolean }).addQuote({
        text: detail.text,
        from: detail.from,
        ...(detail.source ? { source: detail.source } : {}),
      });
    }
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

  /** The waiting card, when all of it is below what's in view. Any of it showing already says it waits. */
  #waitingBelow(): HTMLElement | null {
    const card = this.waiting;
    if (!card || card.getClientRects().length === 0) return null;
    return card.getBoundingClientRect().top >= this.getBoundingClientRect().bottom ? card : null;
  }

  #updateJump() {
    const card = this.#waitingBelow();
    // Keep pointing at the card while the button has focus, so pressing it still goes there.
    if (card || !this.#jump.matches(":focus") || !this.#pointsTo?.matches(waitingCards)) this.#pointsTo = card;
    if (!card && this.#pointsTo) return;
    const jump = this.#jump;
    // A docked Quote button takes Jump to latest's place while it shows.
    const quoting = !this.#quote.hidden && this.#quote.hasAttribute("data-docked");
    const hidden = quoting || (!card && (this.#stuck || this.#distance() <= nearBottom));
    // Only touch what changed: the observer watches `hidden`.
    if (jump.hidden !== hidden) jump.hidden = hidden;
    if (jump.hasAttribute("data-waiting") !== Boolean(card)) jump.toggleAttribute("data-waiting", Boolean(card));
    const label = jump.querySelector("[data-part='jump-label']");
    const words = card ? this.#strings.jumpWaiting(kindOf(card)) : this.#strings.jump;
    if (label && label.textContent !== words) label.textContent = words;
  }

  /**
   * Scrolls the whole message holding the waiting card into view, down to its time and buttons,
   * and focuses the card's first control so it can be answered at once.
   */
  #goTo(card: HTMLElement) {
    const message = this.#messages().find((child) => child.contains(card)) ?? card;
    if (message === this.#messages().at(-1)) {
      // The newest message: go to the bottom, and follow new content again.
      this.scrollToLatest({ smooth: true });
    } else {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      message.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
    }
    const control = firstControl(card);
    if (control) control.focus({ preventScroll: true });
    else this.focus({ preventScroll: true });
  }

  #changed(records: MutationRecord[]) {
    // The jump button's own changes need nothing more.
    records = records.filter((record) => !this.#jumpBar.contains(record.target));
    if (!records.length) return;
    let busyChanged = false;
    for (const record of records) {
      if (record.type === "attributes") {
        if (record.attributeName === "streaming") busyChanged = true;
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
    // agent is waiting on them; so is a notice, like a usage limit.
    const waiting = [...message.querySelectorAll("ai-question:not([answered]), ai-approval:not([decided]), ai-plan:not([decided]), ai-questions:not([answered]), ai-notice:not([expired]):not([hidden])")]
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
        if (element.localName === "ai-notice") {
          const read = (part: string) => element.querySelector<HTMLElement>(`[data-part='${part}']:not([hidden])`)?.textContent?.trim() ?? "";
          return this.#strings.notice(heading, read("text"), read("resets"));
        }
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
  interface HTMLElementEventMap extends TranscriptEvents {}
}
