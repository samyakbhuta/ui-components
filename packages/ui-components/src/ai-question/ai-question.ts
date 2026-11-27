import "@ui-sdk/web/button";
import "@ui-sdk/web/checkbox";
import "@ui-sdk/web/input";
import "@ui-sdk/web/radio";
import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-question.css?inline";

/** One choice. `value` is what's sent, if it differs from the label shown. */
export type QuestionOption = string | { value: string; label?: string; description?: string; disabled?: boolean };

/** What `questionanswer` carries in `event.detail`, and what `answer` holds once answered. */
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
  send: "Send",
  skip: "Skip",
  multipleHint: (max) => (max ? `Choose up to ${max}.` : "Choose all that apply."),
  answered: (labels) => `Answered: ${labels.join(", ")}`,
  skipped: "Skipped",
};

/** The events this element fires, by name. */
export type QuestionEvents = {
  questionanswer: CustomEvent<QuestionAnswerDetail>;
  questionskip: CustomEvent<null>;
};

/** The value of the Other choice inside the groups; never sent. */
const OTHER = "\u0000other";

const check =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

const normalize = (option: QuestionOption) =>
  typeof option === "string"
    ? { value: option, label: option, description: "", disabled: false }
    : {
        value: option.value,
        label: option.label ?? option.value,
        description: option.description ?? "",
        disabled: option.disabled ?? false,
      };

type Group = HTMLElement & { value: unknown };

let count = 0;

/**
 * `<ai-question>`: a question the model asks, with choices to pick from: one with radio buttons,
 * or several with `multiple`, plus an optional "Other" with a text box. See README.md beside
 * this file.
 *
 * @customElement ai-question
 * @fires questionanswer - Send was pressed with a valid answer. Cancelable.
 * @fires questionskip - Skip was pressed. Cancelable.
 */
export class AiQuestionElement extends BaseElement {
  static observedAttributes = ["question", "multiple", "other", "max", "skippable", "disabled"];

  #options: QuestionOption[] = [];
  #strings: QuestionStrings = defaultQuestionStrings;
  #selected: string[] = [];
  #otherText = "";
  #answer: QuestionAnswer | null = null;
  #rendered = false;
  #id = `ai-question-${++count}`;

  get options(): QuestionOption[] {
    return this.#options;
  }
  set options(value: QuestionOption[]) {
    this.#options = [...(value ?? [])];
    const known = new Set(this.#choices().map((choice) => choice.value));
    this.#selected = this.#selected.filter((value) => value === OTHER || known.has(value));
    this.#update();
  }

  /** The question, shown above the choices. */
  get question(): string {
    return this.getAttribute("question") ?? "";
  }
  set question(value: string) {
    this.setAttribute("question", value);
  }

  /** Checkboxes, for choosing several, instead of radio buttons. */
  get multiple(): boolean {
    return this.hasAttribute("multiple");
  }
  set multiple(value: boolean) {
    this.toggleAttribute("multiple", value !== false);
  }

  /** Adds a last "Other" choice with a text box for an answer of one's own. */
  get other(): boolean {
    return this.hasAttribute("other");
  }
  set other(value: boolean) {
    this.toggleAttribute("other", value !== false);
  }

  /** With `multiple`, the most choices allowed. Unset allows any number. */
  get max(): number | null {
    const value = Number(this.getAttribute("max"));
    return this.hasAttribute("max") && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  }
  set max(value: number | null) {
    if (value === null) this.removeAttribute("max");
    else this.setAttribute("max", String(value));
  }

  /** Adds a Skip button. */
  get skippable(): boolean {
    return this.hasAttribute("skippable");
  }
  set skippable(value: boolean) {
    this.toggleAttribute("skippable", value !== false);
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }
  set disabled(value: boolean) {
    this.toggleAttribute("disabled", value !== false);
  }

  get strings(): QuestionStrings {
    return this.#strings;
  }
  set strings(value: Partial<QuestionStrings>) {
    this.#strings = { ...defaultQuestionStrings, ...value };
    this.#update();
  }

  /** What's chosen so far: a value, or a list with `multiple`. A typed answer stands in for Other. */
  get value(): string | string[] | null {
    const values = this.#values();
    return this.multiple ? values : (values[0] ?? null);
  }
  set value(value: string | string[] | null) {
    const list = value === null ? [] : Array.isArray(value) ? value : [value];
    const known = new Set(this.#choices().map((choice) => choice.value));
    this.#selected = [];
    for (const item of this.multiple ? list : list.slice(0, 1)) {
      if (known.has(item)) this.#selected.push(item);
      else if (this.other) {
        this.#otherText = item;
        this.#selected.push(OTHER);
      }
    }
    this.#update();
  }

  /** What's typed in the Other box. */
  get otherText(): string {
    return this.#otherText;
  }
  set otherText(value: string) {
    this.#otherText = value ?? "";
    this.#update();
  }

  /**
   * The answer once sent or skipped, or null. Set it to show a saved answer, like when a chat is
   * opened again; null makes the question answerable again.
   */
  get answer(): QuestionAnswer | null {
    return this.#answer;
  }
  set answer(value: QuestionAnswer | null) {
    if (value && !("skipped" in value)) this.value = value.value;
    this.#answer = value ?? null;
    this.toggleAttribute("answered", this.#answer !== null);
    this.#update();
  }

  connectedCallback() {
    if (this.#rendered) return;
    // A list written inside the element, one choice per item, is the starting list.
    if (!this.#options.length) {
      const written = [...this.querySelectorAll("li")].map((item) => item.textContent!.trim()).filter(Boolean);
      if (written.length) this.#options = written;
    }
    this.#rendered = true;
    this.#render();
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null) {
    if (previous === next) return;
    if (name === "multiple" && next === null) this.#selected = this.#selected.slice(0, 1);
    if (name === "other" && next === null) this.#selected = this.#selected.filter((value) => value !== OTHER);
    this.#update();
  }

  /** Sends the answer, as pressing Send does. Returns false when nothing was sent. */
  submit(): boolean {
    if (!this.#valid()) return false;
    const values = this.#values();
    const chosen = this.#choices().filter((choice) => this.#selected.includes(choice.value));
    const otherChosen = this.#selected.includes(OTHER);
    const labels = [...chosen.map((choice) => choice.label), ...(otherChosen ? [this.#otherText.trim()] : [])];
    const detail: QuestionAnswerDetail = {
      value: this.multiple ? values : values[0],
      labels,
      other: otherChosen ? this.#otherText.trim() : null,
    };
    if (!this.#emit("questionanswer", detail)) return false;
    this.#finish(detail);
    return true;
  }

  /** Skips the question, as pressing Skip does. Returns false when a listener cancelled it. */
  skip(): boolean {
    if (this.#answer || this.disabled) return false;
    if (!this.#emit("questionskip", null)) return false;
    this.#finish({ skipped: true });
    return true;
  }

  /** Makes the question answerable again, keeping the choices. */
  reset() {
    this.answer = null;
  }

  // ---- State -----------------------------------------------------------------------------------

  #choices() {
    return this.#options.map(normalize);
  }

  /** The chosen values in the order the choices appear, with the typed answer for Other. */
  #values() {
    const values = this.#choices()
      .map((choice) => choice.value)
      .filter((value) => this.#selected.includes(value));
    const typed = this.#otherText.trim();
    if (this.#selected.includes(OTHER) && typed) values.push(typed);
    return values;
  }

  #valid() {
    if (this.#answer || this.disabled) return false;
    if (this.#selected.includes(OTHER) && !this.#otherText.trim()) return false;
    return this.#selected.length > 0;
  }

  #emit<K extends keyof QuestionEvents>(type: K, detail: QuestionEvents[K]["detail"]) {
    return this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable: true }));
  }

  #finish(answer: QuestionAnswer) {
    this.#answer = answer;
    this.setAttribute("answered", "");
    this.#update();
    const line = this.querySelector<HTMLElement>("[data-part='answer']");
    const announcement = this.querySelector<HTMLElement>("[data-part='announcement']");
    if (announcement) announcement.textContent = line?.textContent ?? "";
    // Send and Skip just disappeared, so give focus somewhere that stays.
    line?.focus();
  }

  // ---- Rendering -------------------------------------------------------------------------------

  /** Re-renders when the choices or their kind changed, and otherwise syncs the state in place. */
  #update() {
    if (!this.#rendered) return;
    const shape = JSON.stringify([this.#options, this.multiple, this.other, this.question, this.#strings.other]);
    if (this.dataset.shape !== shape) this.#render();
    else this.#sync();
  }

  #render() {
    const s = this.#strings;
    const multiple = this.multiple;
    this.dataset.shape = JSON.stringify([this.#options, multiple, this.other, this.question, s.other]);

    // The question names the group, and the hint describes it; a fieldset around it would name
    // it a second time.
    const body = document.createElement("div");
    body.dataset.part = "body";
    // Says the agent is waiting on this person, until they answer.
    const status = document.createElement("p");
    status.dataset.part = "status";
    status.id = `${this.#id}-status`;
    const dot = document.createElement("span");
    dot.dataset.part = "status-dot";
    dot.setAttribute("aria-hidden", "true");
    const words = document.createElement("span");
    words.dataset.part = "status-text";
    status.append(dot, words);
    body.append(status);
    const legend = document.createElement("p");
    legend.dataset.part = "legend";
    legend.id = `${this.#id}-legend`;
    legend.textContent = this.question;
    body.append(legend);

    const hint = document.createElement("p");
    hint.dataset.part = "hint";
    hint.id = `${this.#id}-hint`;
    hint.hidden = !multiple;
    body.append(hint);

    const group = document.createElement(multiple ? "ui-checkbox-group" : "ui-radio-group") as Group;
    group.dataset.part = "options";
    group.setAttribute("aria-labelledby", legend.id);
    const choices = this.#choices();
    choices.forEach((choice, index) => group.append(this.#option(choice.value, choice.label, choice.description, choice.disabled, index)));
    if (this.other) {
      const row = document.createElement("div");
      row.dataset.part = "other";
      row.append(this.#option(OTHER, s.other, "", false, choices.length));
      const wrapper = document.createElement("ui-input");
      wrapper.dataset.part = "other-input";
      const input = document.createElement("input");
      input.type = "text";
      input.autocomplete = "off";
      input.value = this.#otherText;
      input.addEventListener("input", () => {
        this.#otherText = input.value;
        // Typing an answer of one's own chooses Other.
        if (input.value.trim() && !this.#selected.includes(OTHER)) {
          this.#selected = multiple ? [...this.#selected, OTHER] : [OTHER];
        }
        this.#sync();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.isComposing) {
          event.preventDefault();
          this.submit();
        }
      });
      wrapper.append(input);
      row.append(wrapper);
      group.append(row);
    }
    group.addEventListener("valuechange", (event) => {
      const value = (event as CustomEvent<{ value: string | string[] | null }>).detail.value;
      this.#selected = value === null ? [] : Array.isArray(value) ? [...value] : [value];
      queueMicrotask(() => this.#sync());
    });
    body.append(group);

    const actions = document.createElement("div");
    actions.dataset.part = "actions";
    actions.append(this.#button("send", s.send, () => this.submit()));
    actions.append(this.#button("skip", s.skip, () => this.skip()));

    const answer = document.createElement("p");
    answer.dataset.part = "answer";
    answer.tabIndex = -1;

    const announcement = document.createElement("span");
    announcement.dataset.part = "announcement";
    announcement.setAttribute("role", "status");

    this.replaceChildren(body, actions, answer, announcement);
    this.#sync();
  }

  #option(value: string, label: string, description: string, disabled: boolean, index: number) {
    const multiple = this.multiple;
    const item = document.createElement("div");
    item.dataset.part = "option";
    const choice = document.createElement("label");
    choice.dataset.part = "choice";
    const control = document.createElement(multiple ? "ui-checkbox" : "ui-radio");
    control.setAttribute("value", value);
    control.toggleAttribute("disabled", disabled);
    const indicator = document.createElement(multiple ? "ui-checkbox-indicator" : "ui-radio-indicator");
    if (multiple) indicator.innerHTML = check;
    control.append(indicator);
    const text = document.createElement("span");
    text.dataset.part = "label";
    text.textContent = label;
    choice.append(control, text);
    item.append(choice);
    if (description) {
      const more = document.createElement("span");
      more.dataset.part = "description";
      more.id = `${this.#id}-description-${index}`;
      more.textContent = description;
      control.setAttribute("aria-describedby", more.id);
      item.append(more);
    }
    return item;
  }

  #button(part: string, label: string, press: () => void) {
    const wrapper = document.createElement("ui-button");
    wrapper.dataset.part = part;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    wrapper.append(button);
    wrapper.addEventListener("action", press);
    return wrapper;
  }

  /** Brings the parts in line with the state, without rebuilding them. */
  #sync() {
    const s = this.#strings;
    const answered = this.#answer !== null;
    const disabled = this.disabled;
    const group = this.querySelector<Group>(":scope [data-part='options']");
    if (!group) return;

    const current = Array.isArray(group.value) ? group.value : group.value == null ? [] : [group.value];
    const wanted = this.multiple ? this.#selected : this.#selected.slice(0, 1);
    if (JSON.stringify(current) !== JSON.stringify(wanted)) group.value = this.multiple ? [...wanted] : (wanted[0] ?? null);
    group.toggleAttribute("read-only", answered);
    group.toggleAttribute("disabled", disabled);

    // With max, the choices not taken are disabled once the limit is reached.
    const max = this.multiple ? this.max : null;
    const full = max !== null && this.#selected.length >= max;
    const choices = new Map(this.#choices().map((choice) => [choice.value, choice]));
    for (const control of group.querySelectorAll<HTMLElement>("ui-checkbox, ui-radio")) {
      const value = control.getAttribute("value")!;
      const own = value === OTHER ? false : (choices.get(value)?.disabled ?? false);
      control.toggleAttribute("disabled", own || (full && !this.#selected.includes(value)));
    }

    const hint = this.querySelector<HTMLElement>("[data-part='hint']");
    if (hint) hint.textContent = s.multipleHint(max);

    // While it waits, the status line describes the choices too; once answered, it's gone.
    const status = this.querySelector<HTMLElement>("[data-part='status']")!;
    status.hidden = answered;
    status.querySelector("[data-part='status-text']")!.textContent = s.waiting;
    const described = [!answered && status.id, this.multiple && hint?.id].filter(Boolean).join(" ");
    if (described) group.setAttribute("aria-describedby", described);
    else group.removeAttribute("aria-describedby");

    const input = this.querySelector<HTMLInputElement>("[data-part='other-input'] input");
    if (input) {
      if (input.value !== this.#otherText) input.value = this.#otherText;
      input.placeholder = s.otherPlaceholder;
      input.setAttribute("aria-label", s.otherLabel);
      input.readOnly = answered;
      input.disabled = disabled || (full && !this.#selected.includes(OTHER));
      // Once answered, an empty box has nothing to show.
      input.closest<HTMLElement>("[data-part='other-input']")!.hidden = answered && !this.#selected.includes(OTHER);
    }

    const actions = this.querySelector<HTMLElement>("[data-part='actions']")!;
    actions.hidden = answered;
    const send = this.querySelector<HTMLElement>("[data-part='send']")!;
    send.toggleAttribute("disabled", !this.#valid());
    send.querySelector("button")!.textContent = s.send;
    const skip = this.querySelector<HTMLElement>("[data-part='skip']")!;
    skip.hidden = !this.skippable;
    skip.toggleAttribute("disabled", disabled);
    skip.querySelector("button")!.textContent = s.skip;

    const line = this.querySelector<HTMLElement>("[data-part='answer']")!;
    line.hidden = !answered;
    line.textContent = !this.#answer ? "" : "skipped" in this.#answer ? s.skipped : s.answered(this.#answer.labels);
  }
}

adoptStyles(styles);
define("ai-question", AiQuestionElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-question": AiQuestionElement;
  }
  interface HTMLElementEventMap extends QuestionEvents {}
}
