import "@ui-sdk/web/button";
import "@ui-sdk/web/checkbox";
import "@ui-sdk/web/input";
import "@ui-sdk/web/radio";
import type { ChangeSource } from "@ui-sdk/core";
import { createParts, type UiActionDetail } from "@ui-sdk/web";
import { adoptStyles } from "../styles.ts";
import { canSend, normalize, OTHER, question, type QuestionAnswer, type QuestionAnswerReason, type QuestionOption, type QuestionStrings } from "./question.ts";
import styles from "./ai-question.css?inline";

export { defaultQuestionStrings, question } from "./question.ts";
export type { QuestionAnswer, QuestionAnswerDetail, QuestionAnswerReason, QuestionOption, QuestionOptions, QuestionStrings } from "./question.ts";

/** What `answerchange` carries in `event.detail`. */
export type QuestionAnswerChangeDetail = {
  /** The answer: `{ value, labels, other }`, or `{ skipped: true }`. */
  value: QuestionAnswer | null;
  reason: QuestionAnswerReason;
  source: ChangeSource;
  event?: Event;
};

/** The events this element fires, by name. */
export type QuestionEvents = {
  answerchange: CustomEvent<QuestionAnswerChangeDetail>;
};

/** Every event `<ai-question>` takes listeners for: its own and the usual HTML ones. */
export interface QuestionElementEventMap extends HTMLElementEventMap, QuestionEvents {}

/**
 * `<ai-question>`: a question the model asks, with choices to pick from: one with radio buttons,
 * or several with `multiple`, plus an optional "Other" with a text box. It's ui-sdk's `question`
 * primitive (`question.ts`) rendered as custom elements. See README.md beside this file.
 */
export interface AiQuestionElement extends HTMLElement {
  question: string;
  options: QuestionOption[];
  multiple: boolean;
  other: boolean;
  max: number | null;
  skippable: boolean;
  disabled: boolean;
  strings: Partial<QuestionStrings> | undefined;
  /** What's chosen so far: a value, or a list with `multiple`. A typed answer stands in for Other. */
  value: string | string[] | null;
  /** What's typed in the Other box. */
  otherText: string;
  /** The answer once sent or skipped, or null. Setting it shows a saved answer, or reopens with null, without firing `answerchange`. */
  answer: QuestionAnswer | null;
  api: {
    /** Sends the answer, as pressing Send does. Returns false when nothing was sent. */
    submit(): boolean;
    /** Skips the question, as pressing Skip does. Returns false when it was cancelled. */
    skip(): boolean;
    /** Makes the question answerable again, keeping the choices. */
    reset(): void;
  };
  // Its events are typed here, not in the global map: ui-sdk-style names are shared between
  // elements, with different details.
  addEventListener<K extends keyof QuestionElementEventMap>(
    type: K,
    listener: (this: AiQuestionElement, event: QuestionElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof QuestionElementEventMap>(
    type: K,
    listener: (this: AiQuestionElement, event: QuestionElementEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

const check =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

type Instance = ReturnType<typeof question>;

let count = 0;
type Group = HTMLElement & { value: unknown };

const tag = (name: string, part: string) => {
  const element = document.createElement(name);
  element.dataset.part = part;
  return element;
};

/** One choice: a radio or checkbox in a label, with its description beside it. */
function option(multiple: boolean, value: string, label: string, description: string, describedBy: string) {
  const item = tag("div", "option");
  const choice = tag("label", "choice");
  const control = document.createElement(multiple ? "ui-checkbox" : "ui-radio");
  control.setAttribute("value", value);
  const indicator = document.createElement(multiple ? "ui-checkbox-indicator" : "ui-radio-indicator");
  if (multiple) indicator.innerHTML = check;
  control.append(indicator);
  const text = tag("span", "label");
  text.textContent = label;
  choice.append(control, text);
  item.append(choice);
  if (description) {
    const more = tag("span", "description");
    more.id = describedBy;
    more.textContent = description;
    control.setAttribute("aria-describedby", more.id);
    item.append(more);
  }
  return item;
}

/** Builds the question once, rebuilds the choices when they change, and keeps the rest in line with the state. */
function render(el: HTMLElement, instance: Instance) {
  const press = (part: string, run: (source: ChangeSource) => void) => {
    const wrapper = tag("ui-button", part);
    const button = document.createElement("button");
    button.type = "button";
    wrapper.append(button);
    // The press's own source, since the change comes from the button's event, not a key or pointer of ours.
    wrapper.addEventListener("action", (event) => run((event as CustomEvent<UiActionDetail>).detail.source));
    return wrapper;
  };

  if (!el.querySelector(":scope > [data-part='body']")) {
    // A list written inside the element, one choice per item, is the starting list.
    const written = [...el.querySelectorAll("li")].map((item) => item.textContent!.trim()).filter(Boolean);
    const body = tag("div", "body");
    const status = tag("ai-question-status", "status");
    const dot = tag("span", "status-dot");
    dot.setAttribute("aria-hidden", "true");
    status.append(dot, tag("span", "status-text"));
    // The question names the group, and the hint describes it; a fieldset around it would name
    // it a second time.
    // The group's name and description point at these, so they get ids of their own at once.
    const id = `ai-question-${++count}`;
    const legend = tag("p", "legend");
    const hint = tag("ai-question-hint", "hint");
    status.id = `${id}-status`;
    legend.id = `${id}-legend`;
    hint.id = `${id}-hint`;
    body.append(status, legend, hint);
    const actions = tag("ai-question-actions", "actions");
    actions.append(
      press("send", (source) => instance.api.submit({ source, why: "press" })),
      press("skip", (source) => instance.api.skip({ source, why: "skip-press" })),
    );
    el.replaceChildren(body, actions, tag("ai-question-answer", "answer"));
    if (written.length && !instance.get().options.length) (el as AiQuestionElement).options = written;
  }

  const part = <T extends HTMLElement = HTMLElement>(name: string) => el.querySelector<T>(`:scope [data-part='${name}']`)!;
  let shape = "";
  const describedBy = `ai-question-${++count}-description`;

  /** The choices as radios or checkboxes, with Other last. Rebuilt only when they change. */
  const build = () => {
    const { options, multiple, other, strings: s } = instance.get();
    const group = document.createElement(multiple ? "ui-checkbox-group" : "ui-radio-group") as Group;
    group.dataset.part = "options";
    const choices = options.map(normalize);
    choices.forEach((choice, index) => group.append(option(multiple, choice.value, choice.label, choice.description, `${describedBy}-${index}`)));
    if (other) {
      const row = tag("div", "other");
      row.append(option(multiple, OTHER, s.other, "", ""));
      const box = tag("ai-question-other", "other-input");
      const field = document.createElement("ui-input");
      const input = document.createElement("input");
      input.type = "text";
      input.autocomplete = "off";
      field.append(input);
      box.append(field);
      row.append(box);
      group.append(row);
    }
    group.addEventListener("valuechange", (event) => {
      const value = (event as CustomEvent<{ value: string | string[] | null }>).detail.value;
      instance.api.setSelected(value === null ? [] : Array.isArray(value) ? value : [value]);
    });
    el.querySelector(":scope [data-part='options']")?.remove();
    part("body").append(group);
  };

  const sync = () => {
    const state = instance.get();
    const { question: asked, options, multiple, other, max, skippable, disabled, selected, otherText, answer, strings: s } = state;
    const next = JSON.stringify([options, multiple, other, s.other]);
    if (next !== shape) {
      shape = next;
      build();
    }
    const answered = answer !== null;
    part("status-text").textContent = s.waiting;
    part("legend").textContent = asked;
    part("hint").textContent = s.multipleHint(multiple ? max : null);

    const group = part<Group>("options");
    const current = Array.isArray(group.value) ? group.value : group.value == null ? [] : [group.value];
    const wanted = multiple ? selected : selected.slice(0, 1);
    if (JSON.stringify(current) !== JSON.stringify(wanted)) group.value = multiple ? [...wanted] : (wanted[0] ?? null);
    group.toggleAttribute("read-only", answered);
    group.toggleAttribute("disabled", disabled);
    group.setAttribute("aria-labelledby", part("legend").id);
    // While it waits, the status line describes the choices too; once answered, it's gone.
    const described = [!answered && part("status").id, multiple && part("hint").id].filter(Boolean).join(" ");
    if (described) group.setAttribute("aria-describedby", described);
    else group.removeAttribute("aria-describedby");

    // With max, the choices not taken are disabled once the limit is reached.
    const full = multiple && max !== null && selected.length >= max;
    const choices = new Map(options.map(normalize).map((choice) => [choice.value, choice]));
    for (const control of group.querySelectorAll<HTMLElement>("ui-checkbox, ui-radio")) {
      const value = control.getAttribute("value")!;
      const own = value === OTHER ? false : (choices.get(value)?.disabled ?? false);
      control.toggleAttribute("disabled", own || (full && !selected.includes(value)));
    }

    const input = el.querySelector<HTMLInputElement>(":scope [data-part='other-input'] input");
    if (input) {
      if (input.value !== otherText) input.value = otherText;
      input.placeholder = s.otherPlaceholder;
      input.setAttribute("aria-label", s.otherLabel);
      input.readOnly = answered;
      input.disabled = disabled || (full && !selected.includes(OTHER));
    }

    const send = part("send");
    send.toggleAttribute("disabled", !canSend(state));
    send.querySelector("button")!.textContent = s.send;
    const skip = part("skip");
    skip.hidden = !skippable;
    skip.toggleAttribute("disabled", disabled);
    skip.querySelector("button")!.textContent = s.skip;

    part("answer").textContent = !answer ? "" : "skipped" in answer ? s.skipped : s.answered(answer.labels);
  };
  sync();
  return instance.subscribe(sync);
}

const parts = createParts(question, {
  root: {
    tag: "ai-question",
    display: "block",
    state: {
      value: { get: (api) => api.getValue(), set: (api, value) => api.setValue(value) },
      otherText: { get: (api) => api.getOtherText(), set: (api, value) => api.setOtherText(value ?? "") },
      answer: { get: (api) => api.getAnswer(), set: (api, value) => api.restore(value) },
    },
    api: ["submit", "skip", "reset"],
    render: (el, instance) => render(el, instance),
  },
  status: { tag: "ai-question-status", display: "block" },
  hint: { tag: "ai-question-hint", display: "block" },
  other: { tag: "ai-question-other", display: "block" },
  actions: { tag: "ai-question-actions", display: "block" },
  answer: { tag: "ai-question-answer", display: "block" },
});

/** The element's class, for `instanceof` checks. Undefined on a server, where nothing is defined. */
export const AiQuestionElement = parts.Root as unknown as { new (): AiQuestionElement; prototype: AiQuestionElement } | undefined;

adoptStyles(styles);

declare global {
  interface HTMLElementTagNameMap {
    "ai-question": AiQuestionElement;
  }
}
