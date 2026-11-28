import { announce, createChange, createFocusRecovery, definePrimitive, type ChangeDetails, type ChangeSource } from "@ui-sdk/core";
import type { QuestionAnswer, QuestionOption } from "../ai-question/question.ts";

/** One question of a set, as `questions` takes it: the same as an `<ai-question>`'s attributes. */
export type QuestionsItem = {
  question: string;
  options: QuestionOption[];
  multiple?: boolean;
  other?: boolean;
  max?: number;
  skippable?: boolean;
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

/** What sent the answers: Send on the last question, or code calling `submit`. */
export type QuestionsAnswersReason = "press" | "imperative";

export type QuestionsOptions = {
  /** The set's accessible name. Defaults to "Questions". */
  label?: string;
  disabled?: boolean;
  /** The questions, as data. Setting it replaces any `<ai-question>` written inside. */
  questions?: QuestionsItem[] | null;
  strings?: Partial<QuestionsStrings>;
  answers?: QuestionAnswer[] | null;
  defaultAnswers?: QuestionAnswer[] | null;
  onAnswersChange?: (value: QuestionAnswer[] | null, details: ChangeDetails<QuestionsAnswersReason>) => void;
};

/** The words in use: the defaults with any from `strings` on top. */
export const questionsStrings = (options: Pick<QuestionsOptions, "strings">): QuestionsStrings => ({ ...defaultQuestionsStrings, ...options.strings });

/** The options the set shows, copied into state so a change to any of them renders again. */
const shown = (options: QuestionsOptions) => ({
  label: options.label ?? "",
  disabled: options.disabled ?? false,
  questions: options.questions ?? null,
  strings: questionsStrings(options),
});

type State = ReturnType<typeof shown> & { count: number; index: number; drafts: (QuestionAnswer | null)[]; answers: QuestionAnswer[] | null };

export const questions = definePrimitive({
  name: "questions",
  options: {
    label: "string",
    disabled: "boolean",
    questions: "value",
    strings: "value",
    answers: "value",
    defaultAnswers: "value",
    onAnswersChange: "callback",
  },
  controlled: ["answers"],
  state: (options: QuestionsOptions): State => {
    const answers = options.answers ?? options.defaultAnswers ?? null;
    return { ...shown(options), count: 0, index: 0, drafts: answers ? [...answers] : [], answers };
  },
  sync: (options) => ({ ...shown(options), ...(options.answers === undefined ? {} : { answers: options.answers }) }),
  api: (context) => {
    const change = createChange(context);
    // The questions go once sent, so focus moves to the summary of the answers.
    const recovery = createFocusRecovery({ fallback: () => context.element("summary") });

    const goTo = (index: number) => {
      const { count } = context.store.get();
      context.store.set({ index: Math.max(0, Math.min(index, count - 1)) });
    };

    return {
      recovery,
      goTo,
      getIndex: () => context.store.get().index,
      getAnswers: () => context.store.get().answers,
      /** How many questions there are, as rendered: from `questions`, or written inside. */
      setCount(count: number) {
        const { drafts, answers, index } = context.store.get();
        const kept = answers && answers.length === count ? [...answers] : Array.from({ length: count }, (_, at) => drafts[at] ?? null);
        context.store.set({ count, drafts: kept, index: Math.min(index, Math.max(0, count - 1)) });
      },
      /** Keeps a question's answer until Send. Says what comes next: the next question, sending, or nothing. */
      record(index: number, answer: QuestionAnswer): "next" | "submit" | null {
        const { answers, disabled, drafts, count } = context.store.get();
        if (answers || disabled || index < 0 || index >= count) return null;
        const next = [...drafts];
        next[index] = answer;
        context.store.set({ drafts: next });
        return index === count - 1 ? "submit" : "next";
      },
      /**
       * Sends every answer, as Send on the last question does. Returns false when nothing was sent:
       * it's already sent, disabled, or a question is still unanswered, which it goes to and says so.
       */
      submit(options: { source?: ChangeSource; why?: QuestionsAnswersReason } = {}) {
        const { answers, disabled, drafts, count, strings } = context.store.get();
        if (answers || disabled) return false;
        const missing = drafts.slice(0, count).findIndex((answer) => answer === null || answer === undefined);
        if (missing >= 0 || drafts.length < count) {
          const at = missing >= 0 ? missing : drafts.length;
          goTo(at);
          announce(strings.unanswered(at + 1));
          return false;
        }
        const sent = drafts.slice(0, count) as QuestionAnswer[];
        if (!change("answers", sent, { reason: options.why ?? "imperative", source: options.source })) return false;
        context.store.set({ drafts: [...sent] });
        announce(strings.sent(sent.length));
        return true;
      },
      /** Shows saved answers, or asks again with null, without reporting a change. */
      restore(answers: QuestionAnswer[] | null) {
        const { count } = context.store.get();
        context.store.set({ answers: answers ? [...answers] : null, drafts: answers ? [...answers] : Array.from({ length: count }, () => null), ...(answers ? {} : { index: 0 }) });
      },
    };
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({ answered: state.answers ? "" : undefined }),
    }),
    // The questions and their carousel, while they wait.
    set: slot({
      present: (state) => !state.answers,
      bind: (el, part) => part.api.recovery.bind(el, part),
    }),
    summary: slot({
      present: (state) => state.answers !== null,
      attrs: () => ({ tabindex: "-1" }),
    }),
  }),
  // The carousel is named for the set, and its questions, their buttons and Previous and Next are
  // what an agent uses. A second component named the same would be ambiguous.
  agent: { actions: [], shown: () => false },
});
