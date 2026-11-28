import "@ui-sdk/web/carousel";
import "../ai-question/ai-question.ts";
import type { ChangeSource } from "@ui-sdk/core";
import { createParts } from "@ui-sdk/web";
import type { AiQuestionElement, QuestionAnswer, QuestionEvents } from "../ai-question/ai-question.ts";
import { adoptStyles } from "../styles.ts";
import { questions, type QuestionsAnswersReason, type QuestionsItem, type QuestionsStrings } from "./questions.ts";
import styles from "./ai-questions.css?inline";

export { defaultQuestionsStrings, questions } from "./questions.ts";
export type { QuestionsAnswersReason, QuestionsItem, QuestionsOptions, QuestionsStrings } from "./questions.ts";

/** A set's answers as `<ai-chat>` hands them to a model: `{ answers }`, one per question. */
export type QuestionsAnswerDetail = { answers: QuestionAnswer[] };

/** What `answerschange` carries in `event.detail`. */
export type QuestionsAnswersChangeDetail = {
  /** One answer per question, in order: `{ value, labels, other }`, or `{ skipped: true }`. */
  value: QuestionAnswer[] | null;
  reason: QuestionsAnswersReason;
  source: ChangeSource;
};

/** The events this element fires, by name. */
export type QuestionsEvents = {
  answerschange: CustomEvent<QuestionsAnswersChangeDetail>;
};

/** Every event `<ai-questions>` takes listeners for: its own and the usual HTML ones. */
export interface QuestionsElementEventMap extends HTMLElementEventMap, QuestionsEvents {}

/**
 * `<ai-questions>`: several questions the model asks at once, shown one at a time in ui-sdk's
 * Carousel, with "1 of 3" and arrows. Each is an `<ai-question>`. People move between them freely,
 * and Send on the last sends every answer together. It's ui-sdk's `questions` primitive
 * (`questions.ts`) rendered as custom elements. See README.md beside this file.
 */
export interface AiQuestionsElement extends HTMLElement {
  label: string;
  disabled: boolean;
  /** The questions, as data. Setting it replaces any `<ai-question>` written inside. */
  questions: QuestionsItem[] | null;
  strings: Partial<QuestionsStrings> | undefined;
  /** Which question shows, from 0. */
  index: number;
  /** The answers once sent, one per question, or null. Setting it shows saved answers, or asks again with null, without firing `answerschange`. */
  answers: QuestionAnswer[] | null;
  api: {
    /** Sends every answer, as Send on the last question does. Returns false when nothing was sent. */
    submit(): boolean;
    /** Shows a question, from 0. */
    goTo(index: number): void;
  };
  // Its events are typed here, not in the global map: ui-sdk-style names are shared between
  // elements, with different details.
  addEventListener<K extends keyof QuestionsElementEventMap>(
    type: K,
    listener: (this: AiQuestionsElement, event: QuestionsElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof QuestionsElementEventMap>(
    type: K,
    listener: (this: AiQuestionsElement, event: QuestionsElementEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

/** How long a single choice shows as chosen before moving on, in milliseconds. */
const advanceDelay = 450;

type Instance = ReturnType<typeof questions>;
type Carousel = HTMLElement & { page: number; api?: { setPage(page: number): boolean } };

let count = 0;

const tag = (name: string, part: string) => {
  const element = document.createElement(name);
  element.dataset.part = part;
  return element;
};

const arrow = (name: string, part: string, path: string) => {
  const wrapper = tag(name, part);
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
  wrapper.append(button);
  return wrapper;
};

/** Builds the set once, rebuilds its questions when they change, and keeps the rest in line with the state. */
function render(el: HTMLElement, instance: Instance) {
  const part = <T extends HTMLElement = HTMLElement>(name: string) => el.querySelector<T>(`:scope [data-part='${name}']`)!;
  const all = () => [...el.querySelectorAll<AiQuestionElement>(":scope [data-part='questions'] > ui-carousel-item > ai-question")];
  // While Send re-reads each question's current choice: record it, without moving on.
  let silent = false;
  let advance: ReturnType<typeof setTimeout> | undefined;
  let pointer = 0;

  /** Focuses the question showing, once its slide is in view: the carousel keeps the others inert. */
  const focusQuestion = () => {
    const question = all()[instance.get().index];
    const slide = question?.closest<HTMLElement>("ui-carousel-item");
    if (!question || !slide) return;
    const focus = () => {
      const target =
        question.querySelector<HTMLElement>("[aria-checked='true'], [role='radio'][tabindex='0'], [role='checkbox']") ??
        question.querySelector<HTMLElement>("[role='radio'], [role='checkbox'], input");
      target?.focus();
    };
    if (!slide.inert) return focus();
    const watch = new MutationObserver(() => {
      if (slide.inert) return;
      watch.disconnect();
      focus();
    });
    watch.observe(slide, { attributes: true, attributeFilter: ["inert"] });
    setTimeout(() => watch.disconnect(), 1500);
  };

  /** Sends them all: first each question's current choice, like one changed with the arrow keys. */
  const send = (source?: ChangeSource) => {
    silent = true;
    try {
      for (const question of all()) question.api.submit();
    } finally {
      silent = false;
    }
    if (!instance.api.submit({ source, why: "press" })) focusQuestion();
  };

  if (!el.querySelector(":scope > [data-part='set']")) {
    // Questions written inside come first; `questions` builds its own.
    const written = [...el.querySelectorAll<AiQuestionElement>(":scope > ai-question")];
    const id = `ai-questions-${++count}`;
    const status = tag("p", "status");
    status.id = `${id}-status`;
    const dot = tag("span", "status-dot");
    dot.setAttribute("aria-hidden", "true");
    status.append(dot, tag("span", "status-text"));
    const nav = tag("div", "nav");
    nav.append(arrow("ui-carousel-previous", "previous", "M15 18l-6-6 6-6"), tag("span", "position"), arrow("ui-carousel-next", "next", "M9 6l6 6-6 6"));
    const header = tag("div", "header");
    header.append(status, nav);
    const content = tag("ui-carousel-content", "questions");
    for (const question of written) {
      const slide = document.createElement("ui-carousel-item");
      slide.append(question);
      content.append(slide);
    }
    const viewport = tag("ui-carousel-viewport", "viewport");
    viewport.append(content);
    const carousel = tag("ui-carousel", "carousel");
    carousel.append(header, viewport);
    // People swiping or pressing the arrows move the set to that question.
    carousel.addEventListener("pagechange", (event) => instance.api.goTo((event as CustomEvent<{ value: number }>).detail.value - 1));

    // A question's answer stays with the set until Send. It doesn't bubble, so the set hears it on the way down.
    content.addEventListener(
      "answerchange",
      (event) => {
        const changed = event as QuestionEvents["answerchange"];
        const index = all().indexOf(changed.target as AiQuestionElement);
        if (index < 0 || !changed.detail.value) return;
        changed.preventDefault();
        const next = instance.api.record(index, changed.detail.value);
        if (silent || !next) return;
        clearTimeout(advance);
        if (next === "submit") send(changed.detail.source);
        else {
          instance.api.goTo(index + 1);
          focusQuestion();
        }
      },
      true,
    );
    // A single choice picked with a pointer moves on by itself after a moment. Keys don't.
    let before: unknown = null;
    content.addEventListener("pointerdown", (event) => {
      pointer = Date.now();
      before = ((event.target as Element).closest("ai-question") as AiQuestionElement | null)?.value ?? null;
    });
    content.addEventListener("click", (event) => {
      setTimeout(() => {
        const question = (event.target as Element).closest("ai-question") as AiQuestionElement | null;
        if (!question || question.value === before || question.multiple || instance.get().answers) return;
        const index = all().indexOf(question);
        // The last question waits for Send, and keyboard arrows choose without moving on.
        if (index < 0 || index === all().length - 1 || Date.now() - pointer > 1000 || question.answer) return;
        clearTimeout(advance);
        advance = setTimeout(() => {
          const value = question.value;
          // Other needs typing, so it doesn't move on.
          if (typeof value !== "string" || !question.options.some((option) => (typeof option === "string" ? option : option.value) === value)) return;
          question.api.submit();
        }, advanceDelay);
      });
    });

    const set = tag("ai-questions-set", "set");
    set.append(carousel);
    el.replaceChildren(set, tag("ai-questions-summary", "summary"));
    instance.api.setCount(written.length);
  }

  let shownItems: unknown = undefined;

  /** Builds the questions from `questions`, replacing those there. */
  const build = (items: QuestionsItem[]) => {
    part("questions").replaceChildren(
      ...items.map((item) => {
        const question = document.createElement("ai-question");
        question.question = item.question;
        question.options = item.options;
        question.multiple = item.multiple ?? false;
        question.other = item.other ?? false;
        question.max = item.max ?? null;
        question.skippable = item.skippable ?? false;
        const slide = document.createElement("ui-carousel-item");
        slide.append(question);
        return slide;
      }),
    );
    const { answers } = instance.get();
    instance.api.setCount(items.length);
    // Answers set before the questions were built, like a saved set, show once they are.
    instance.api.restore(answers && answers.length === items.length ? answers : null);
  };

  const sync = () => {
    const { questions: items } = instance.get();
    // Building changes the count and answers; the rest reads the state after it. The first sync
    // runs before the subscription, so it can't wait for the next one.
    if (items && items !== shownItems) {
      shownItems = items;
      build(items);
    }
    const { label, disabled, strings: s, count: total, index, answers } = instance.get();
    const sent = answers !== null;
    const carousel = part<Carousel>("carousel");
    carousel.setAttribute("aria-label", label || s.label);
    if (sent) carousel.removeAttribute("aria-describedby");
    else carousel.setAttribute("aria-describedby", part("status").id);
    part("status-text").textContent = s.waiting;
    part("nav").hidden = total < 2;
    part("position").textContent = total ? s.position(index + 1, total) : "";
    part("previous").querySelector("button")!.setAttribute("aria-label", s.previous);
    part("next").querySelector("button")!.setAttribute("aria-label", s.next);
    // The carousel follows the set: Continue, Send with one unanswered, or code moving it.
    if (typeof carousel.page === "number" && carousel.page !== index + 1) carousel.api?.setPage(index + 1);

    const list = all();
    list.forEach((question, at) => {
      const answer = answers?.[at] ?? null;
      if (question.answer !== answer) question.answer = answer;
      question.toggleAttribute("disabled", disabled);
      // Each question's Send moves on; the last one's sends them all.
      const send = at === list.length - 1 ? s.send : s.nextQuestion;
      if (question.strings?.send !== send) question.strings = { ...question.strings, send };
    });

    const summary = part("summary");
    if (!sent) return void summary.replaceChildren();
    const heading = tag("p", "summary-heading");
    heading.textContent = s.summary;
    const terms = document.createElement("dl");
    list.forEach((question, at) => {
      const answer = answers![at];
      const term = document.createElement("dt");
      term.textContent = question.question;
      const value = document.createElement("dd");
      value.textContent = !answer || "skipped" in answer ? s.skipped : answer.labels.join(", ");
      if (answer && "skipped" in answer) value.dataset.skipped = "";
      terms.append(term, value);
    });
    summary.replaceChildren(heading, terms);
  };
  sync();
  const unsubscribe = instance.subscribe(sync);
  return () => {
    clearTimeout(advance);
    unsubscribe();
  };
}

const parts = createParts(questions, {
  root: {
    tag: "ai-questions",
    display: "block",
    state: {
      index: { get: (api) => api.getIndex(), set: (api, value) => api.goTo(Number(value) || 0) },
      answers: { get: (api) => api.getAnswers(), set: (api, value) => api.restore(value) },
    },
    api: ["submit", "goTo"],
    render: (el, instance) => render(el, instance),
  },
  set: { tag: "ai-questions-set", display: "block" },
  summary: { tag: "ai-questions-summary", display: "block" },
});

/** The element's class, for `instanceof` checks. Undefined on a server, where nothing is defined. */
export const AiQuestionsElement = parts.Root as unknown as { new (): AiQuestionsElement; prototype: AiQuestionsElement } | undefined;

adoptStyles(styles);

declare global {
  interface HTMLElementTagNameMap {
    "ai-questions": AiQuestionsElement;
  }
}
