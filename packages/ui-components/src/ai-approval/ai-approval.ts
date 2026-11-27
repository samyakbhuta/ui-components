import "@ui-sdk/web/button";
import "@ui-sdk/web/input";
import { showValue } from "../format.ts";
import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-approval.css?inline";

/** What people decided: allow this once, always allow this tool, or deny. */
export type ApprovalDecision = "allow" | "always" | "deny";

/** What `approvaldecision` carries in `event.detail`, and what `decision` holds once decided. */
export type ApprovalDecisionDetail = {
  decision: ApprovalDecision;
  /** With Deny, what was typed for the agent to do instead, or null. */
  reason: string | null;
};

/** Every word `<ai-approval>` shows or announces. Override any of them through `strings`. */
export type ApprovalStrings = {
  /** The line at the top while it waits for a decision. It also describes the prompt. */
  waiting: string;
  /** The heading, unless the `label` attribute gives one. */
  label: (name: string) => string;
  /** The accessible name of the box showing what the tool would get. */
  input: string;
  allow: string;
  always: string;
  deny: string;
  /** The text box's accessible name, with `reason`. */
  reasonLabel: string;
  reasonPlaceholder: string;
  /** The line shown, and announced, once decided. */
  decided: (decision: ApprovalDecision, reason: string | null) => string;
};

export const defaultApprovalStrings: ApprovalStrings = {
  waiting: "Waiting for your approval",
  label: (name) => (name ? `Allow ${name}?` : "Allow this action?"),
  input: "What it will do",
  allow: "Allow once",
  always: "Always allow",
  deny: "Deny",
  reasonLabel: "What should it do instead?",
  reasonPlaceholder: "Optional: tell it what to do instead",
  decided: (decision, reason) =>
    decision === "allow" ? "Allowed once" : decision === "always" ? "Always allowed" : reason ? `Denied: ${reason}` : "Denied",
};

/** The events this element fires, by name. */
export type ApprovalEvents = {
  approvaldecision: CustomEvent<ApprovalDecisionDetail>;
};

let count = 0;

/**
 * `<ai-approval>`: an agent asks permission before it acts, like running a command or sending
 * an email. People choose Allow once, Always allow (with `always`) or Deny, and with `reason`
 * can say what to do instead. See README.md beside this file.
 *
 * @customElement ai-approval
 * @fires approvaldecision - A decision was made. Cancelable.
 */
export class AiApprovalElement extends BaseElement {
  static observedAttributes = ["name", "label", "description", "always", "reason", "disabled"];

  #strings: ApprovalStrings = defaultApprovalStrings;
  #input: unknown = undefined;
  #reasonText = "";
  #decision: ApprovalDecisionDetail | null = null;
  #rendered = false;
  #id = `ai-approval-${++count}`;

  /** The tool or action asking, like "run_command". Shown in code type beside the heading. */
  get name(): string {
    return this.getAttribute("name") ?? "";
  }
  set name(value: string) {
    this.setAttribute("name", value);
  }

  /** What it wants to do, in words, like "Run a command". Defaults to "Allow {name}?". */
  get label(): string {
    return this.getAttribute("label") ?? "";
  }
  set label(value: string) {
    this.setAttribute("label", value);
  }

  /** A line under the heading, like what could happen. */
  get description(): string {
    return this.getAttribute("description") ?? "";
  }
  set description(value: string) {
    this.setAttribute("description", value);
  }

  /** Offers Always allow, for apps that remember the choice. */
  get always(): boolean {
    return this.hasAttribute("always");
  }
  set always(value: boolean) {
    this.toggleAttribute("always", value !== false);
  }

  /** Adds a text box to say what to do instead, sent with Deny. */
  get reason(): boolean {
    return this.hasAttribute("reason");
  }
  set reason(value: boolean) {
    this.toggleAttribute("reason", value !== false);
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }
  set disabled(value: boolean) {
    this.toggleAttribute("disabled", value !== false);
  }

  /** What the tool would get, like a command or its arguments. Shown as text: strings as they are, anything else as JSON. */
  get input(): unknown {
    return this.#input;
  }
  set input(value: unknown) {
    this.#input = value;
    this.#sync();
  }

  /** What's typed in the reason box. */
  get reasonText(): string {
    return this.#reasonText;
  }
  set reasonText(value: string) {
    this.#reasonText = value ?? "";
    this.#sync();
  }

  /**
   * The decision once made, or null. Set it to show a saved decision, like when a chat opens
   * again; null makes it ask again.
   */
  get decision(): ApprovalDecisionDetail | null {
    return this.#decision;
  }
  set decision(value: ApprovalDecisionDetail | null) {
    this.#decision = value ?? null;
    if (value?.reason) this.#reasonText = value.reason;
    this.toggleAttribute("decided", this.#decision !== null);
    this.#sync();
  }

  get strings(): ApprovalStrings {
    return this.#strings;
  }
  set strings(value: Partial<ApprovalStrings>) {
    this.#strings = { ...defaultApprovalStrings, ...value };
    this.#sync();
  }

  connectedCallback() {
    if (this.#rendered) return;
    this.#rendered = true;
    this.#render();
  }

  attributeChangedCallback(_name: string, previous: string | null, next: string | null) {
    if (previous !== next) this.#sync();
  }

  /**
   * Decides, as pressing a button does: "allow", "always" (only with `always`) or "deny", with
   * an optional reason for Deny. Returns false when nothing happened.
   */
  decide(decision: ApprovalDecision, reason?: string): boolean {
    if (this.#decision || this.disabled) return false;
    if (decision === "always" && !this.always) return false;
    const typed = (reason ?? (this.reason ? this.#reasonText : "")).trim();
    const detail: ApprovalDecisionDetail = { decision, reason: decision === "deny" && typed ? typed : null };
    const proceed = this.dispatchEvent(
      new CustomEvent("approvaldecision", { detail, bubbles: true, composed: true, cancelable: true }),
    );
    if (!proceed) return false;
    this.decision = detail;
    const line = this.querySelector<HTMLElement>("[data-part='decision']");
    const announcement = this.querySelector<HTMLElement>("[data-part='announcement']");
    if (announcement) announcement.textContent = line?.textContent ?? "";
    // The buttons just disappeared, so give focus somewhere that stays.
    line?.focus();
    return true;
  }

  // ---- Rendering -------------------------------------------------------------------------------

  #render() {
    const status = document.createElement("p");
    status.dataset.part = "status";
    status.id = `${this.#id}-status`;
    const dot = document.createElement("span");
    dot.dataset.part = "status-dot";
    dot.setAttribute("aria-hidden", "true");
    const words = document.createElement("span");
    words.dataset.part = "status-text";
    status.append(dot, words);

    const header = document.createElement("div");
    header.dataset.part = "header";
    const heading = document.createElement("p");
    heading.dataset.part = "heading";
    heading.id = `${this.#id}-heading`;
    const name = document.createElement("code");
    name.dataset.part = "name";
    header.append(heading, name);

    const description = document.createElement("p");
    description.dataset.part = "description";

    const input = document.createElement("pre");
    input.dataset.part = "input";
    // Long commands scroll, so keyboard users need to reach the box too.
    input.tabIndex = 0;

    const reasonField = document.createElement("ui-input");
    reasonField.dataset.part = "reason";
    const box = document.createElement("input");
    box.type = "text";
    box.autocomplete = "off";
    box.addEventListener("input", () => {
      this.#reasonText = box.value;
    });
    box.addEventListener("keydown", (event) => {
      // Enter with something typed denies with it, as "do this instead".
      if (event.key === "Enter" && !event.isComposing && box.value.trim()) {
        event.preventDefault();
        this.decide("deny");
      }
    });
    reasonField.append(box);

    const actions = document.createElement("div");
    actions.dataset.part = "actions";
    actions.append(
      this.#button("allow", () => this.decide("allow")),
      this.#button("always", () => this.decide("always")),
      this.#button("deny", () => this.decide("deny")),
    );

    const decision = document.createElement("p");
    decision.dataset.part = "decision";
    decision.tabIndex = -1;

    const announcement = document.createElement("span");
    announcement.dataset.part = "announcement";
    announcement.setAttribute("role", "status");

    this.replaceChildren(status, header, description, input, reasonField, actions, decision, announcement);
    if (!this.hasAttribute("role")) this.setAttribute("role", "group");
    this.setAttribute("aria-labelledby", heading.id);
    this.#sync();
  }

  #button(part: ApprovalDecision, press: () => void) {
    const wrapper = document.createElement("ui-button");
    wrapper.dataset.part = part;
    const button = document.createElement("button");
    button.type = "button";
    wrapper.append(button);
    wrapper.addEventListener("action", press);
    return wrapper;
  }

  /** Brings the parts in line with the state, without rebuilding them. */
  #sync() {
    if (!this.#rendered) return;
    const s = this.#strings;
    const decided = this.#decision !== null;
    const disabled = this.disabled;
    const part = <T extends HTMLElement = HTMLElement>(name: string) => this.querySelector<T>(`:scope > [data-part='${name}']`)!;

    const status = part("status");
    status.hidden = decided;
    status.querySelector("[data-part='status-text']")!.textContent = s.waiting;
    if (decided) this.removeAttribute("aria-describedby");
    else this.setAttribute("aria-describedby", status.id);

    part("header").querySelector("[data-part='heading']")!.textContent = this.label || s.label(this.name);
    const name = part("header").querySelector<HTMLElement>("[data-part='name']")!;
    name.textContent = this.name;
    // The default heading already says the name.
    name.hidden = !this.name || !this.label;

    const description = part("description");
    description.textContent = this.description;
    description.hidden = !this.description;

    const input = part<HTMLPreElement>("input");
    const shown = showValue(this.#input);
    input.textContent = shown;
    input.hidden = !shown;
    input.setAttribute("aria-label", s.input);

    const reasonField = part("reason");
    const box = reasonField.querySelector("input")!;
    if (box.value !== this.#reasonText) box.value = this.#reasonText;
    box.placeholder = s.reasonPlaceholder;
    box.setAttribute("aria-label", s.reasonLabel);
    box.disabled = disabled;
    box.readOnly = decided;
    // Once decided, the box only stays to show a reason that was given.
    reasonField.hidden = !this.reason || (decided && !this.#decision?.reason);

    part("actions").hidden = decided;
    for (const choice of ["allow", "always", "deny"] as const) {
      const wrapper = part("actions").querySelector<HTMLElement>(`[data-part='${choice}']`)!;
      wrapper.querySelector("button")!.textContent = s[choice];
      wrapper.toggleAttribute("disabled", disabled);
      if (choice === "always") wrapper.hidden = !this.always;
    }

    const line = part("decision");
    line.hidden = !decided;
    line.textContent = this.#decision ? s.decided(this.#decision.decision, this.#decision.reason) : "";
    if (this.#decision) line.dataset.decision = this.#decision.decision;
    else delete line.dataset.decision;
  }
}

adoptStyles(styles);
define("ai-approval", AiApprovalElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-approval": AiApprovalElement;
  }
  interface HTMLElementEventMap extends ApprovalEvents {}
}
