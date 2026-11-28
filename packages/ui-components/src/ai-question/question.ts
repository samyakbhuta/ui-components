import { announce, createChange, createFocusRecovery, definePrimitive, type ChangeDetails, type ChangeSource } from "@ui-sdk/core";

/** One choice. `value` is what's sent, if it differs from the label shown. */
export type QuestionOption = string | { value: string; label?: string; description?: string; disabled?: boolean };

/** An answer sent: what `answerchange` carries in `event.detail.value`, and what `answer` holds. */
export type QuestionAnswerDetail = {
  /** The chosen value, or the chosen values with `multiple`. A typed answer stands in for Other. */
  value: string | string[];
  /** The labels of the choices, in order, with the typed answer for Other. For showing or sending as text. */
  labels: string[];
  /** What was typed for Other, or null when Other wasn't chosen. */
  other: string | null;
};

/** A saved answer: what was sent, or `{ skipped: true }`. */
export type QuestionAnswer = QuestionAnswerDetail | { skipped: true };

/** Every word `<ai-question>` shows or announces. Override any of them through `strings`. */
export type QuestionStrings = {
  /** The line at the top while the question waits for an answer. It also describes the choices. */
  waiting: string;
  other: string;
  otherPlaceholder: string;
  /** The text box's accessible name. */
  otherLabel: string;
  send: string;
  skip: string;
  /** The line under the question with `multiple`. `max` is null without a limit. */
  multipleHint: (max: number | null) => string;
  answered: (labels: string[]) => string;
  skipped: string;
};

export const defaultQuestionStrings: QuestionStrings = {
  waiting: "Waiting for your answer",
  other: "Other",
  otherPlaceholder: "Type your own answer",
  otherLabel: "Your own answer",
  send: "Send answer",
  skip: "Skip",
  multipleHint: (max) => (max ? `Choose up to ${max}.` : "Choose all that apply."),
  answered: (labels) => `Answered: ${labels.join(", ")}`,
  skipped: "Skipped",
};

/** What asked for an answer: Send, Enter in the Other box, Skip, or code calling `submit` or `skip`. */
export type QuestionAnswerReason = "press" | "enter-key" | "skip-press" | "imperative";

/** The value of the Other choice inside the groups; never sent. */
export const OTHER = "\u0000other";

/** A choice with every field filled in. */
export const normalize = (option: QuestionOption) =>
  typeof option === "string"
    ? { value: option, label: option, description: "", disabled: false }
    : { value: option.value, label: option.label ?? option.value, description: option.description ?? "", disabled: option.disabled ?? false };

export type QuestionOptions = {
  /** The question, shown above the choices. */
  question?: string;
  options?: QuestionOption[];
  /** Checkboxes, for choosing several, instead of radio buttons. */
  multiple?: boolean;
  /** Adds a last "Other" choice with a text box for an answer of one's own. */
  other?: boolean;
  /** With `multiple`, the most choices allowed. */
  max?: number | null;
  /** Adds a Skip button. */
  skippable?: boolean;
  disabled?: boolean;
  strings?: Partial<QuestionStrings>;
  answer?: QuestionAnswer | null;
  defaultAnswer?: QuestionAnswer | null;
  onAnswerChange?: (value: QuestionAnswer | null, details: ChangeDetails<QuestionAnswerReason>) => void;
};

/** The words in use: the defaults with any from `strings` on top. */
export const questionStrings = (options: Pick<QuestionOptions, "strings">): QuestionStrings => ({ ...defaultQuestionStrings, ...options.strings });

/** The options the question shows, copied into state so a change to any of them renders again. */
const shown = (options: QuestionOptions) => ({
  question: options.question ?? "",
  options: options.options ?? [],
  multiple: options.multiple ?? false,
  other: options.other ?? false,
  max: options.max && Number.isFinite(Number(options.max)) && Number(options.max) > 0 ? Math.floor(Number(options.max)) : null,
  skippable: options.skippable ?? false,
  disabled: options.disabled ?? false,
  strings: questionStrings(options),
});

type State = ReturnType<typeof shown> & { selected: string[]; otherText: string; answer: QuestionAnswer | null };

/** The chosen values in the order the choices appear, with the typed answer for Other. */
export const valuesOf = (state: Pick<State, "options" | "selected" | "otherText">) => {
  const values = state.options.map(normalize).map((choice) => choice.value).filter((value) => state.selected.includes(value));
  const typed = state.otherText.trim();
  if (state.selected.includes(OTHER) && typed) values.push(typed);
  return values;
};

/** Whether what's chosen can be sent. */
export const canSend = (state: State) => {
  if (state.answer || state.disabled) return false;
  if (state.selected.includes(OTHER) && !state.otherText.trim()) return false;
  return state.selected.length > 0;
};

/** The selection a value stands for: known choices, and anything else as Other's typed text. */
const selectionFor = (state: Pick<State, "options" | "multiple" | "other">, value: string | string[] | null) => {
  const list = value === null ? [] : Array.isArray(value) ? value : [value];
  const known = new Set(state.options.map(normalize).map((choice) => choice.value));
  const selected: string[] = [];
  let otherText: string | undefined;
  for (const item of state.multiple ? list : list.slice(0, 1)) {
    if (known.has(item)) selected.push(item);
    else if (state.other) {
      otherText = item;
      selected.push(OTHER);
    }
  }
  return { selected, ...(otherText === undefined ? {} : { otherText }) };
};

export const question = definePrimitive({
  name: "question",
  options: {
    question: "string",
    options: "value",
    multiple: "boolean",
    other: "boolean",
    max: "number",
    skippable: "boolean",
    disabled: "boolean",
    strings: "value",
    answer: "value",
    defaultAnswer: "value",
    onAnswerChange: "callback",
  },
  controlled: ["answer"],
  state: (options: QuestionOptions): State => {
    const answer = options.answer ?? options.defaultAnswer ?? null;
    const base = shown(options);
    const restored = answer && !("skipped" in answer) ? selectionFor(base, answer.value) : { selected: [] };
    return { ...base, selected: restored.selected, otherText: "otherText" in restored ? (restored.otherText ?? "") : "", answer };
  },
  sync: (options) => ({ ...shown(options), ...(options.answer === undefined ? {} : { answer: options.answer }) }),
  api: (context) => {
    const change = createChange(context);
    const recovery = createFocusRecovery({ fallback: () => context.element("answer") });

    // Turning `multiple` or `other` off keeps only what still fits; new options drop choices that went.
    context.onOptions((options) => {
      const { selected } = context.store.get();
      const known = new Set((options.options ?? []).map(normalize).map((choice) => choice.value));
      let next = selected.filter((value) => value === OTHER || known.has(value));
      if (!options.multiple) next = next.slice(0, 1);
      if (!options.other) next = next.filter((value) => value !== OTHER);
      if (next.length !== selected.length) context.store.set({ selected: next });
    });

    const finish = (value: QuestionAnswer, options: { event?: Event; source?: ChangeSource; why?: QuestionAnswerReason }) => {
      const accepted = change("answer", value, { reason: options.why ?? "imperative", event: options.event, source: options.source });
      if (!accepted) return false;
      const { strings } = context.store.get();
      announce("skipped" in value ? strings.skipped : strings.answered(value.labels));
      return true;
    };

    return {
      recovery,
      /** Sends the answer, as pressing Send does. Returns false when nothing was sent. */
      submit(options: { event?: Event; source?: ChangeSource; why?: QuestionAnswerReason } = {}) {
        const state = context.store.get();
        if (!canSend(state)) return false;
        const values = valuesOf(state);
        const chosen = state.options.map(normalize).filter((choice) => state.selected.includes(choice.value));
        const otherChosen = state.selected.includes(OTHER);
        const detail: QuestionAnswerDetail = {
          value: state.multiple ? values : values[0],
          labels: [...chosen.map((choice) => choice.label), ...(otherChosen ? [state.otherText.trim()] : [])],
          other: otherChosen ? state.otherText.trim() : null,
        };
        return finish(detail, options);
      },
      /** Skips the question, as pressing Skip does. Returns false when it was cancelled. */
      skip(options: { event?: Event; source?: ChangeSource; why?: QuestionAnswerReason } = {}) {
        const state = context.store.get();
        if (state.answer || state.disabled) return false;
        return finish({ skipped: true }, options);
      },
      /** Makes the question answerable again, keeping the choices, without reporting a change. */
      reset: () => context.store.set({ answer: null }),
      /** Shows a saved answer, or reopens with null, without reporting a change. */
      restore(answer: QuestionAnswer | null) {
        const state = context.store.get();
        context.store.set({ answer: answer ?? null, ...(answer && !("skipped" in answer) ? selectionFor(state, answer.value) : {}) });
      },
      /** Chooses, as the controls do: the values ticked, with Other's marker for Other. */
      setSelected: (selected: string[]) => context.store.set({ selected: [...selected] }),
      /** Chooses by value: known choices, and anything else as Other's typed text. */
      setValue: (value: string | string[] | null) => context.store.set(selectionFor(context.store.get(), value)),
      /** Types in the Other box. Typing an answer of one's own chooses Other. */
      setOtherText(text: string) {
        const { selected, multiple } = context.store.get();
        const chooses = text.trim() && !selected.includes(OTHER);
        context.store.set({ otherText: text ?? "", ...(chooses ? { selected: multiple ? [...selected, OTHER] : [OTHER] } : {}) });
      },
      getValue(): string | string[] | null {
        const state = context.store.get();
        const values = valuesOf(state);
        return state.multiple ? values : (values[0] ?? null);
      },
      getOtherText: () => context.store.get().otherText,
      getAnswer: () => context.store.get().answer,
      /** Moves focus to the line saying what was answered. */
      focusAnswer: () => context.element("answer")?.focus(),
    };
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({ answered: state.answer ? "" : undefined }),
    }),
    status: slot({
      present: (state) => !state.answer,
    }),
    hint: slot({
      present: (state) => state.multiple,
    }),
    // The Other box. Once answered, an empty one has nothing to show.
    other: slot({
      present: (state) => state.other && !(state.answer && !state.selected.includes(OTHER)),
      on: {
        keydown: (event, { api }) => {
          const key = event as KeyboardEvent;
          if (key.key !== "Enter" || key.isComposing) return;
          event.preventDefault();
          // The box stays, read only, so focus moves to the answer line itself.
          if (api.submit({ event, why: "enter-key" })) queueMicrotask(() => api.focusAnswer());
        },
        input: (event, { api }) => api.setOtherText((event.target as HTMLInputElement).value),
      },
    }),
    // Send and Skip go once answered, so focus moves to the answer line.
    actions: slot({
      present: (state) => !state.answer,
      bind: (el, part) => part.api.recovery.bind(el, part),
    }),
    answer: slot({
      present: (state) => state.answer !== null,
      attrs: () => ({ tabindex: "-1" }),
    }),
  }),
  // Its radio or checkbox group is named by the question, and Send and Skip are buttons, so an
  // agent uses those. A second component named the same would make the question ambiguous.
  agent: { actions: [], shown: () => false },
});
