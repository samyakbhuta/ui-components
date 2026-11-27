import "@ui-sdk/web/button";
import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-suggestions.css?inline";

/** A suggested prompt. `value` is what's sent, if it differs from the label shown. */
export type Suggestion = string | { label: string; value?: string; description?: string };

/** What `suggestionselect` carries in `event.detail`. */
export type SuggestionSelectDetail = { value: string; label: string };

/** Every word `<ai-suggestions>` uses. Override any of them through `strings`. */
export type SuggestionsStrings = {
  /** The list's accessible name, unless the `label` attribute gives one. */
  label: string;
};

export const defaultSuggestionsStrings: SuggestionsStrings = {
  label: "Suggestions",
};

type Composer = HTMLElement & { value: string; busy: boolean; disabled: boolean; submit: () => boolean; focus: () => void };

const normalize = (suggestion: Suggestion) =>
  typeof suggestion === "string"
    ? { label: suggestion, value: suggestion, description: "" }
    : { label: suggestion.label, value: suggestion.value ?? suggestion.label, description: suggestion.description ?? "" };

/**
 * `<ai-suggestions>`: prompts people can send with one press, like starters for an empty chat
 * or follow-up questions after a reply. See README.md beside this file.
 *
 * @customElement ai-suggestions
 */
export class AiSuggestionsElement extends BaseElement {
  static observedAttributes = ["label", "for", "action", "layout", "disabled"];

  #suggestions: Suggestion[] = [];
  #strings: SuggestionsStrings = defaultSuggestionsStrings;
  #rendered = false;

  get suggestions(): Suggestion[] {
    return this.#suggestions;
  }
  set suggestions(value: Suggestion[]) {
    this.#suggestions = [...(value ?? [])];
    if (this.#rendered) this.#render();
  }

  /** The id of the `<ai-composer>` a suggestion goes to. */
  get for(): string {
    return this.getAttribute("for") ?? "";
  }
  set for(value: string) {
    this.setAttribute("for", value);
  }

  /** "send" (the default) sends the suggestion; "fill" puts it in the box to edit first. */
  get action(): "send" | "fill" {
    return this.getAttribute("action") === "fill" ? "fill" : "send";
  }
  set action(value: "send" | "fill") {
    this.setAttribute("action", value);
  }

  /** "chips" (the default) wraps them side by side; "list" stacks them, for follow-up questions. */
  get layout(): "chips" | "list" {
    return this.getAttribute("layout") === "list" ? "list" : "chips";
  }
  set layout(value: "chips" | "list") {
    this.setAttribute("layout", value);
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }
  set disabled(value: boolean) {
    this.toggleAttribute("disabled", value);
  }

  get strings(): SuggestionsStrings {
    return this.#strings;
  }
  set strings(value: Partial<SuggestionsStrings>) {
    this.#strings = { ...defaultSuggestionsStrings, ...value };
    if (this.#rendered) this.#render();
  }

  /** The composer named by `for`, if it's on the page. */
  get composer(): Composer | null {
    if (!this.for) return null;
    const root = this.getRootNode() as Document | ShadowRoot;
    return (root.getElementById?.(this.for) as Composer | null) ?? null;
  }

  connectedCallback() {
    if (this.#rendered) return;
    // A list written inside the element, one suggestion per item, is the starting list.
    if (!this.#suggestions.length) {
      const written = [...this.querySelectorAll("li")].map((item) => item.textContent!.trim()).filter(Boolean);
      if (written.length) this.#suggestions = written;
    }
    this.#rendered = true;
    this.#render();
  }

  attributeChangedCallback(_name: string, previous: string | null, next: string | null) {
    if (previous !== next && this.#rendered) this.#render();
  }

  /** Sends or fills a suggestion, as pressing it does. Returns false when nothing happened. */
  select(suggestion: Suggestion): boolean {
    if (this.disabled) return false;
    const { label, value } = normalize(suggestion);
    const composer = this.composer;
    if (composer && (composer.busy || composer.disabled) && this.action === "send") return false;
    const detail: SuggestionSelectDetail = { value, label };
    const proceed = this.dispatchEvent(
      new CustomEvent("suggestionselect", { detail, bubbles: true, composed: true, cancelable: true }),
    );
    if (!proceed || !composer) return proceed;
    composer.value = value;
    if (this.action === "send") composer.submit();
    composer.focus();
    return true;
  }

  #render() {
    const list = document.createElement("ul");
    list.dataset.part = "list";
    list.setAttribute("aria-label", this.getAttribute("label") || this.#strings.label);
    for (const suggestion of this.#suggestions) {
      const { label, description } = normalize(suggestion);
      const item = document.createElement("li");
      item.dataset.part = "item";
      const wrapper = document.createElement("ui-button");
      wrapper.toggleAttribute("disabled", this.disabled);
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.part = "suggestion";
      const text = document.createElement("span");
      text.dataset.part = "label";
      text.textContent = label;
      button.append(text);
      if (description) {
        const more = document.createElement("span");
        more.dataset.part = "description";
        more.textContent = description;
        button.append(more);
      }
      wrapper.append(button);
      wrapper.addEventListener("action", () => this.select(suggestion));
      item.append(wrapper);
      list.append(item);
    }
    this.replaceChildren(list);
    this.toggleAttribute("data-empty", this.#suggestions.length === 0);
  }
}

/** The events this element fires, by name. */
export type SuggestionsEvents = {
  suggestionselect: CustomEvent<SuggestionSelectDetail>;
};

adoptStyles(styles);
define("ai-suggestions", AiSuggestionsElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-suggestions": AiSuggestionsElement;
  }
  interface HTMLElementEventMap extends SuggestionsEvents {}
}
