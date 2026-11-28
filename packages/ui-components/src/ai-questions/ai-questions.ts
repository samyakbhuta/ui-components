import "@ui-sdk/web/button";
import "../ai-question/ai-question.ts";
import type { AiQuestionElement, QuestionAnswer, QuestionEvents, QuestionOption } from "../ai-question/ai-question.ts";
import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-questions.css?inline";

/** One question of a set, as `questions` takes it: the same as an `<ai-question>`'s attributes. */
export type QuestionsItem = {
  question: string;
  options: QuestionOption[];
  multiple?: boolean;
  other?: boolean;
  max?: number;
  skippable?: boolean;
};

/** What `questionsanswer` carries in `event.detail`, and what `answers` holds once sent. */
export type QuestionsAnswerDetail = {
  /** One answer per question, in order: `{ value, labels, other }`, or `{ skipped: true }`. */
  answers: QuestionAnswer[];
};

/** Every word `<ai-questions>` shows or announces. Override any of them through `strings`. */
export type QuestionsStrings = {
  /** The line at the top while it waits. It also describes the set. */
  waiting: string;
  /** The set's accessible name, unless the `label` attribute gives one. */
  label: string;
  /** Where people are: "1 of 3". */
  position: (index: number, count: number) => string;
  previous: string;
  next: string;
  /** Each question's own Send, before the last one. */
  nextQuestion: string;
  /** The last question's Send, which sends every answer. */
  send: string;
  /** Said when Send is pressed with a question still unanswered, as focus moves to it. */
  unanswered: (index: number) => string;
  /** The heading of the summary once sent. */
  summary: string;
  skipped: string;
  /** Announced once sent. */
  sent: (count: number) => string;
};

export const defaultQuestionsStrings: QuestionsStrings = {
  waiting: "Waiting for your answers",
  label: "Questions",
  position: (index, count) => `${index} of ${count}`,
  previous: "Previous question",
  next: "Next question",
  nextQuestion: "Continue",
  send: "Send answers",
  unanswered: (index) => `Question ${index} still needs an answer.`,
  summary: "Your answers",
  skipped: "Skipped",
  sent: (count) => `Sent ${count} answers`,
};

/** The events this element fires, by name. */
export type QuestionsEvents = {
  questionsanswer: CustomEvent<QuestionsAnswerDetail>;
};

/** How long a single choice shows as chosen before moving on, in milliseconds. */
const advanceDelay = 450;

let count = 0;

/**
 * `<ai-questions>`: several questions the model asks at once, shown one at a time with "1 of 3"
 * and arrows. Each is an `<ai-question>`. People move between them freely, and Send on the last
 * sends every answer together. See README.md beside this file.
 *
 * @customElement ai-questions
 * @fires questionsanswer - Every question was answered or skipped, and Send was pressed. Cancelable.
 */
export class AiQuestionsElement extends BaseElement {
  static observedAttributes = ["label", "disabled"];

  #strings: QuestionsStrings = defaultQuestionsStrings;
  #items: QuestionsItem[] | null = null;
  /** The answers given so far, by question, before they're sent. */
  #drafts: (QuestionAnswer | null)[] = [];
  #answers: QuestionAnswer[] | null = null;
  #index = 0;
  #rendered = false;
  #advance: ReturnType<typeof setTimeout> | undefined;
  #pointer = 0;
  /** While Send re-reads each question's current choice: record it, without moving on. */
  #silent = false;
  #id = `ai-questions-${++count}`;

  /** The set's accessible name. Defaults to "Questions". */
  get label(): string {
    return this.getAttribute("label") ?? "";
  }
  set label(value: string) {
    this.setAttribute("label", value);
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }
  set disabled(value: boolean) {
    this.toggleAttribute("disabled", value !== false);
  }

  /** The questions, as data. Setting it replaces any `<ai-question>` written inside. */
  get questions(): QuestionsItem[] {
    return this.#questions().map((question) => ({
      question: question.question,
      options: question.options,
      multiple: question.multiple || undefined,
      other: question.other || undefined,
      max: question.max ?? undefined,
      skippable: question.skippable || undefined,
    }));
  }
  set questions(value: QuestionsItem[]) {
    this.#items = [...(value ?? [])];
    if (this.#rendered) this.#build();
  }

  /** Which question shows, from 0. */
  get index(): number {
    return this.#index;
  }
  set index(value: number) {
    this.#show(value);
  }

  /** The answers once sent, one per question, or null. Set it to show saved answers; null asks again. */
  get answers(): QuestionAnswer[] | null {
    return this.#answers;
  }
  set answers(value: QuestionAnswer[] | null) {
    this.#answers = value ? [...value] : null;
    this.#drafts = value ? [...value] : this.#questions().map(() => null);
    this.toggleAttribute("answered", this.#answers !== null);
    const questions = this.#questions();
    questions.forEach((question, index) => (question.answer = value?.[index] ?? null));
    if (!value) this.#index = 0;
    this.#sync();
  }

  get strings(): QuestionsStrings {
    return this.#strings;
  }
  set strings(value: Partial<QuestionsStrings>) {
    this.#strings = { ...defaultQuestionsStrings, ...value };
    this.#sync();
  }

  connectedCallback() {
    if (this.#rendered) return;
    this.#rendered = true;
    this.#render();
  }

  disconnectedCallback() {
    clearTimeout(this.#advance);
  }

  attributeChangedCallback(_name: string, previous: string | null, next: string | null) {
    if (previous !== next) this.#sync();
  }

  /**
   * Sends every answer, as Send on the last question does. Returns false when nothing was sent:
   * it's already sent, disabled, a question is still unanswered (focus moves to it), or a
   * listener cancelled the event.
   */
  submit(): boolean {
    if (this.#answers || this.disabled) return false;
    // Pick up answers changed since Continue, like a choice changed with the arrow keys.
    this.#silent = true;
    try {
      for (const question of this.#questions()) question.api.submit();
    } finally {
      this.#silent = false;
    }
    const missing = this.#drafts.findIndex((answer) => answer === null);
    if (missing >= 0) {
      this.#show(missing);
      this.#announce(this.#strings.unanswered(missing + 1));
      this.#focusQuestion();
      return false;
    }
    const answers = this.#drafts as QuestionAnswer[];
    const proceed = this.dispatchEvent(
      new CustomEvent("questionsanswer", { detail: { answers: [...answers] }, bubbles: true, composed: true, cancelable: true }),
    );
    if (!proceed) return false;
    this.answers = answers;
    this.#announce(this.#strings.sent(answers.length));
    this.querySelector<HTMLElement>("[data-part='summary']")?.focus();
    return true;
  }

  // ---- Questions -------------------------------------------------------------------------------

  #questions() {
    return [...this.querySelectorAll<AiQuestionElement>(":scope > [data-part='questions'] > ai-question")];
  }

  /** Builds the questions from `questions`, replacing those there. */
  #build() {
    const holder = this.querySelector<HTMLElement>(":scope > [data-part='questions']")!;
    holder.replaceChildren(
      ...(this.#items ?? []).map((item) => {
        const question = document.createElement("ai-question");
        question.question = item.question;
        question.options = item.options;
        question.multiple = item.multiple ?? false;
        question.other = item.other ?? false;
        question.max = item.max ?? null;
        question.skippable = item.skippable ?? false;
        return question;
      }),
    );
    this.#index = 0;
    // Answers set before the questions were built, like a saved set, show once they are.
    if (this.#answers && this.#answers.length === this.#questions().length) this.answers = this.#answers;
    else this.answers = null;
  }

  /** Records a question's answer instead of letting it send, then moves on. */
  #record(event: QuestionEvents["answerchange"]) {
    const question = event.target as AiQuestionElement;
    const index = this.#questions().indexOf(question);
    if (index < 0 || !event.detail.value) return;
    // The set sends them all together, so the question stays unanswered: cancelling keeps it open.
    event.preventDefault();
    if (this.#answers || this.disabled) return;
    this.#drafts[index] = event.detail.value;
    if (this.#silent) return;
    clearTimeout(this.#advance);
    if (index === this.#questions().length - 1) this.submit();
    else {
      this.#show(index + 1);
      this.#focusQuestion();
    }
  }

  /** A single choice, picked with a pointer, moves on by itself after a moment. Keys don't. */
  #maybeAdvance(event: Event) {
    const question = (event.target as Element).closest("ai-question") as AiQuestionElement | null;
    if (!question || question.multiple || this.#answers) return;
    const index = this.#questions().indexOf(question);
    // The last question waits for Send, and keyboard arrows choose without moving on.
    if (index < 0 || index === this.#questions().length - 1 || Date.now() - this.#pointer > 1000 || question.answer) return;
    clearTimeout(this.#advance);
    this.#advance = setTimeout(() => {
      const value = question.value;
      // Other needs typing, so it doesn't move on.
      if (typeof value !== "string" || !question.options.some((option) => (typeof option === "string" ? option : option.value) === value)) return;
      question.api.submit();
    }, advanceDelay);
  }

  #show(index: number) {
    const total = this.#questions().length;
    this.#index = Math.max(0, Math.min(index, total - 1));
    this.#sync();
  }

  #focusQuestion() {
    const question = this.#questions()[this.#index];
    const target =
      question?.querySelector<HTMLElement>("[aria-checked='true'], [data-checked] button, [role='radio'][tabindex='0'], [role='checkbox']") ??
      question?.querySelector<HTMLElement>("[role='radio'], [role='checkbox'], input");
    target?.focus();
  }

  #announce(text: string) {
    const region = this.querySelector<HTMLElement>("[data-part='announcement']");
    if (!region) return;
    region.textContent = "";
    requestAnimationFrame(() => (region.textContent = text));
  }

  // ---- Rendering -------------------------------------------------------------------------------

  #render() {
    // Questions written inside come first; `questions` builds its own.
    const written = [...this.querySelectorAll<AiQuestionElement>(":scope > ai-question")];

    const status = document.createElement("p");
    status.dataset.part = "status";
    status.id = `${this.#id}-status`;
    const dot = document.createElement("span");
    dot.dataset.part = "status-dot";
    dot.setAttribute("aria-hidden", "true");
    const words = document.createElement("span");
    words.dataset.part = "status-text";
    status.append(dot, words);

    const nav = document.createElement("div");
    nav.dataset.part = "nav";
    const position = document.createElement("span");
    position.dataset.part = "position";
    position.id = `${this.#id}-position`;
    nav.append(
      this.#arrow("previous", "M15 18l-6-6 6-6", () => {
        this.#show(this.#index - 1);
        this.#focusQuestion();
      }),
      position,
      this.#arrow("next", "M9 6l6 6-6 6", () => {
        this.#show(this.#index + 1);
        this.#focusQuestion();
      }),
    );

    const header = document.createElement("div");
    header.dataset.part = "header";
    header.append(status, nav);

    const holder = document.createElement("div");
    holder.dataset.part = "questions";
    holder.append(...written);
    // A question's answerchange doesn't bubble, so the holder hears it on the way down.
    holder.addEventListener("answerchange", (event) => this.#record(event as QuestionEvents["answerchange"]), true);
    // A single choice picked with a pointer moves on: compare the answer before and after the click.
    let before: unknown = null;
    holder.addEventListener("pointerdown", (event) => {
      this.#pointer = Date.now();
      before = ((event.target as Element).closest("ai-question") as AiQuestionElement | null)?.value ?? null;
    });
    holder.addEventListener("click", (event) => {
      setTimeout(() => {
        const question = (event.target as Element).closest("ai-question") as AiQuestionElement | null;
        if (question && question.value !== before) this.#maybeAdvance(event);
      });
    });

    const summary = document.createElement("div");
    summary.dataset.part = "summary";
    summary.tabIndex = -1;

    const announcement = document.createElement("span");
    announcement.dataset.part = "announcement";
    announcement.setAttribute("role", "status");

    this.replaceChildren(header, holder, summary, announcement);
    if (!this.hasAttribute("role")) this.setAttribute("role", "group");
    if (this.#items) this.#build();
    else this.#drafts = this.#questions().map((question) => question.answer);
    this.#sync();
  }

  #arrow(part: "previous" | "next", path: string, press: () => void) {
    const wrapper = document.createElement("ui-button");
    wrapper.dataset.part = part;
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
    wrapper.append(button);
    wrapper.addEventListener("action", press);
    return wrapper;
  }

  /** Brings the parts in line with the state, without rebuilding them. */
  #sync() {
    if (!this.#rendered) return;
    const s = this.#strings;
    const questions = this.#questions();
    const total = questions.length;
    const sent = this.#answers !== null;
    const part = (name: string) => this.querySelector<HTMLElement>(`:scope > [data-part='${name}'], :scope > [data-part='header'] [data-part='${name}']`)!;

    this.setAttribute("aria-label", this.label || s.label);
    const status = part("status");
    status.hidden = sent;
    status.querySelector("[data-part='status-text']")!.textContent = s.waiting;
    if (sent) this.removeAttribute("aria-describedby");
    else this.setAttribute("aria-describedby", status.id);

    // Once sent, the summary needs no header.
    this.querySelector<HTMLElement>(":scope > [data-part='header']")!.hidden = sent;
    const nav = part("nav");
    nav.hidden = sent || total < 2;
    part("position").textContent = total ? s.position(this.#index + 1, total) : "";
    const previous = part("previous");
    const next = part("next");
    previous.querySelector("button")!.setAttribute("aria-label", s.previous);
    next.querySelector("button")!.setAttribute("aria-label", s.next);
    previous.toggleAttribute("disabled", this.#index === 0);
    next.toggleAttribute("disabled", this.#index >= total - 1);

    part("questions").hidden = sent;
    questions.forEach((question, index) => {
      question.hidden = index !== this.#index;
      // The ones not showing are out of reach for keyboards, screen readers and agents alike.
      question.inert = index !== this.#index;
      question.toggleAttribute("disabled", this.disabled);
      // Each question's Send moves on; the last one's sends them all.
      question.strings = { ...question.strings, send: index === total - 1 ? s.send : s.nextQuestion };
      question.setAttribute("aria-roledescription", "question");
    });

    const summary = part("summary");
    summary.hidden = !sent;
    if (sent) {
      const heading = document.createElement("p");
      heading.dataset.part = "summary-heading";
      heading.textContent = s.summary;
      const list = document.createElement("dl");
      questions.forEach((question, index) => {
        const answer = this.#answers![index];
        const term = document.createElement("dt");
        term.textContent = question.question;
        const value = document.createElement("dd");
        value.textContent = !answer || "skipped" in answer ? s.skipped : answer.labels.join(", ");
        if (answer && "skipped" in answer) value.dataset.skipped = "";
        list.append(term, value);
      });
      summary.replaceChildren(heading, list);
    } else summary.replaceChildren();
  }
}

adoptStyles(styles);
define("ai-questions", AiQuestionsElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-questions": AiQuestionsElement;
  }
  interface HTMLElementEventMap extends QuestionsEvents {}
}
