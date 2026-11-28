import "@ui-sdk/web/button";
import "@ui-sdk/web/input";
import { renderMarkdown } from "../ai-message/markdown.ts";
import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-plan.css?inline";

/** What people decided: accept the plan, reject it, or ask for changes. */
export type PlanDecision = "accept" | "reject" | "revise";

/** One more way to accept: accept and switch to a mode, like `{ value: "auto", label: "auto mode" }`. */
export type PlanAcceptOption = {
  /** The mode's value, given back in the decision. In `<ai-chat>`, the composer's Mode switches to it. */
  value: string;
  /** The mode's name, as it reads after "Accept and use": "auto mode". */
  label: string;
};

/** What `plandecision` carries in `event.detail`, and what `decision` holds once decided. */
export type PlanDecisionDetail = {
  decision: PlanDecision;
  /** With Accept, the value of the mode chosen with it, or null for plain Accept. */
  mode: string | null;
  /** With Revise, what to change. */
  feedback: string | null;
};

/** Every word `<ai-plan>` shows or announces. Override any of them through `strings`. */
export type PlanStrings = {
  /** The line at the top while it waits for a decision. It also describes the card. */
  waiting: string;
  /** The heading, unless the `heading` attribute gives one. */
  heading: string;
  open: string;
  close: string;
  accept: string;
  /** The button for each of `accepts`: "Accept and use auto mode". */
  acceptWith: (label: string) => string;
  reject: string;
  revise: string;
  /** The feedback box's accessible name. */
  feedbackLabel: string;
  feedbackPlaceholder: string;
  send: string;
  cancel: string;
  /** The line shown, and announced, once decided. `label` is the chosen mode's label, if any. */
  decided: (detail: PlanDecisionDetail, label: string | null) => string;
  /** What an agent pressing Accept would do, asked of the person first (`data-agent-confirm`). */
  acceptConfirm: string;
  /** What an agent pressing one of `accepts` would do, asked of the person first. */
  acceptWithConfirm: (label: string) => string;
};

export const defaultPlanStrings: PlanStrings = {
  waiting: "Waiting for your review",
  heading: "Proposed plan",
  open: "Open plan",
  close: "Close plan",
  accept: "Accept",
  acceptWith: (label) => `Accept and use ${label}`,
  reject: "Reject",
  revise: "Revise…",
  feedbackLabel: "What should change?",
  feedbackPlaceholder: "Tell it what to change in the plan",
  send: "Send changes",
  cancel: "Cancel",
  decided: ({ decision, mode, feedback }, label) =>
    decision === "accept"
      ? mode
        ? `Accepted, using ${label ?? mode}`
        : "Accepted"
      : decision === "reject"
        ? "Rejected"
        : feedback
          ? `Asked for changes: “${feedback}”`
          : "Asked for changes",
  acceptConfirm: "Accepts the plan, so the agent goes ahead with it",
  acceptWithConfirm: (label) => `Accepts the plan and switches to ${label}, so the agent goes ahead with it`,
};

/** The events this element fires, by name. */
export type PlanEvents = {
  plandecision: CustomEvent<PlanDecisionDetail>;
};

let count = 0;

/**
 * `<ai-plan>`: an agent proposes a plan before it starts. People can open the plan, then Accept
 * it, Accept and switch mode, Reject it, or Revise it by saying what to change. See README.md
 * beside this file.
 *
 * @customElement ai-plan
 * @fires plandecision - A decision was made. Cancelable.
 */
export class AiPlanElement extends BaseElement {
  static observedAttributes = ["heading", "summary", "href", "open", "disabled"];

  #strings: PlanStrings = defaultPlanStrings;
  #plan = "";
  #accepts: PlanAcceptOption[] = [];
  #feedbackText = "";
  #revising = false;
  #decision: PlanDecisionDetail | null = null;
  #rendered = false;
  #id = `ai-plan-${++count}`;

  /** The plan's title. Defaults to "Proposed plan". */
  get heading(): string {
    return this.getAttribute("heading") ?? "";
  }
  set heading(value: string) {
    this.setAttribute("heading", value);
  }

  /** A line under the heading, shown while the plan is closed. */
  get summary(): string {
    return this.getAttribute("summary") ?? "";
  }
  set summary(value: string) {
    this.setAttribute("summary", value);
  }

  /** Makes Open plan a link to the app's own page for the plan, instead of opening it here. */
  get href(): string {
    return this.getAttribute("href") ?? "";
  }
  set href(value: string) {
    this.setAttribute("href", value);
  }

  /** Whether the plan is open, showing its full text. */
  get open(): boolean {
    return this.hasAttribute("open");
  }
  set open(value: boolean) {
    this.toggleAttribute("open", value !== false);
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }
  set disabled(value: boolean) {
    this.toggleAttribute("disabled", value !== false);
  }

  /** The full plan, as Markdown. Rendered safely: it's never parsed as HTML. */
  get plan(): string {
    return this.#plan;
  }
  set plan(value: string) {
    this.#plan = value ?? "";
    this.#renderPlan();
    this.#sync();
  }

  /** More ways to accept, each switching to a mode: "Accept and use auto mode". */
  get accepts(): PlanAcceptOption[] {
    return this.#accepts;
  }
  set accepts(value: PlanAcceptOption[]) {
    this.#accepts = [...(value ?? [])];
    this.#renderAccepts();
    this.#sync();
  }

  /** What's typed in the Revise box. */
  get feedbackText(): string {
    return this.#feedbackText;
  }
  set feedbackText(value: string) {
    this.#feedbackText = value ?? "";
    this.#sync();
  }

  /** The decision once made, or null. Set it to show a saved one; null makes it ask again. */
  get decision(): PlanDecisionDetail | null {
    return this.#decision;
  }
  set decision(value: PlanDecisionDetail | null) {
    this.#decision = value ?? null;
    this.#revising = false;
    this.toggleAttribute("decided", this.#decision !== null);
    this.#sync();
  }

  get strings(): PlanStrings {
    return this.#strings;
  }
  set strings(value: Partial<PlanStrings>) {
    this.#strings = { ...defaultPlanStrings, ...value };
    this.#renderAccepts();
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
   * Decides, as pressing a button does: "accept" (with `mode`, one of `accepts`), "reject", or
   * "revise" with `feedback` saying what to change. Returns false when nothing happened.
   */
  decide(decision: PlanDecision, options: { mode?: string; feedback?: string } = {}): boolean {
    if (this.#decision || this.disabled) return false;
    const mode = decision === "accept" ? (options.mode ?? null) : null;
    if (mode !== null && !this.#accepts.some((option) => option.value === mode)) return false;
    const feedback = decision === "revise" ? (options.feedback ?? this.#feedbackText).trim() : "";
    if (decision === "revise" && !feedback) return false;
    const detail: PlanDecisionDetail = { decision, mode, feedback: feedback || null };
    const proceed = this.dispatchEvent(new CustomEvent("plandecision", { detail, bubbles: true, composed: true, cancelable: true }));
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

  #part<T extends HTMLElement = HTMLElement>(name: string) {
    return this.querySelector<T>(`[data-part='${name}']`)!;
  }

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
    const titles = document.createElement("div");
    titles.dataset.part = "titles";
    const heading = document.createElement("p");
    heading.dataset.part = "heading";
    heading.id = `${this.#id}-heading`;
    const summary = document.createElement("p");
    summary.dataset.part = "summary";
    titles.append(heading, summary);

    // Open plan: a button that shows the plan here, or a link to the app's page with `href`.
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.dataset.part = "toggle";
    toggle.setAttribute("aria-controls", `${this.#id}-plan`);
    toggle.addEventListener("click", () => (this.open = !this.open));
    const link = document.createElement("a");
    link.dataset.part = "link";
    header.append(titles, toggle, link);

    const plan = document.createElement("div");
    plan.dataset.part = "plan";
    plan.id = `${this.#id}-plan`;
    // A long plan scrolls inside the card, so keyboard users need to reach it too.
    plan.tabIndex = 0;

    const revise = document.createElement("div");
    revise.dataset.part = "revise";
    const field = document.createElement("ui-input");
    field.dataset.part = "feedback";
    const box = document.createElement("input");
    box.type = "text";
    box.autocomplete = "off";
    box.addEventListener("input", () => {
      this.#feedbackText = box.value;
      this.#sync();
    });
    box.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing && box.value.trim()) {
        event.preventDefault();
        this.decide("revise");
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.#stopRevising();
      }
    });
    field.append(box);
    const reviseActions = document.createElement("div");
    reviseActions.dataset.part = "revise-actions";
    reviseActions.append(
      this.#button("cancel", () => this.#stopRevising()),
      this.#button("send", () => this.decide("revise")),
    );
    revise.append(field, reviseActions);

    const actions = document.createElement("div");
    actions.dataset.part = "actions";
    const secondary = document.createElement("div");
    secondary.dataset.part = "secondary";
    secondary.append(
      this.#button("reject", () => this.decide("reject")),
      this.#button("revise-button", () => this.#startRevising()),
    );
    const primary = document.createElement("div");
    primary.dataset.part = "primary";
    primary.append(this.#button("accept", () => this.decide("accept")));
    actions.append(secondary, primary);

    const decision = document.createElement("p");
    decision.dataset.part = "decision";
    decision.tabIndex = -1;

    const announcement = document.createElement("span");
    announcement.dataset.part = "announcement";
    announcement.setAttribute("role", "status");

    this.replaceChildren(status, header, plan, revise, actions, decision, announcement);
    if (!this.hasAttribute("role")) this.setAttribute("role", "group");
    this.setAttribute("aria-labelledby", heading.id);
    this.#renderPlan();
    this.#renderAccepts();
    this.#sync();
  }

  #button(part: string, press: () => void) {
    const wrapper = document.createElement("ui-button");
    wrapper.dataset.part = part;
    const button = document.createElement("button");
    button.type = "button";
    wrapper.append(button);
    wrapper.addEventListener("action", press);
    return wrapper;
  }

  #renderPlan() {
    if (!this.#rendered) return;
    const blocks = renderMarkdown(this.#plan).map((block) => block.node);
    const plan = this.#part("plan");
    plan.replaceChildren(...blocks);
    // Code blocks come with a Copy button that only <ai-message> handles.
    for (const copy of plan.querySelectorAll("[data-part='code-copy']")) copy.remove();
  }

  /** One "Accept and use …" button per option, after plain Accept. */
  #renderAccepts() {
    if (!this.#rendered) return;
    const primary = this.#part("primary");
    for (const old of primary.querySelectorAll("[data-part='accept-with']")) old.remove();
    for (const option of this.#accepts) {
      const wrapper = this.#button("accept-with", () => this.decide("accept", { mode: option.value }));
      wrapper.dataset.mode = option.value;
      wrapper.dataset.agentConfirm = this.#strings.acceptWithConfirm(option.label);
      wrapper.querySelector("button")!.textContent = this.#strings.acceptWith(option.label);
      primary.append(wrapper);
    }
  }

  #startRevising() {
    if (this.#decision || this.disabled) return;
    this.#revising = true;
    this.#sync();
    this.#part("feedback").querySelector("input")!.focus();
  }

  #stopRevising() {
    this.#revising = false;
    this.#sync();
    this.#part("revise-button").querySelector("button")!.focus();
  }

  /** Brings the parts in line with the state, without rebuilding them. */
  #sync() {
    if (!this.#rendered) return;
    const s = this.#strings;
    const decided = this.#decision !== null;
    const disabled = this.disabled;

    const status = this.#part("status");
    status.hidden = decided;
    status.querySelector("[data-part='status-text']")!.textContent = s.waiting;
    if (decided) this.removeAttribute("aria-describedby");
    else this.setAttribute("aria-describedby", status.id);

    this.#part("heading").textContent = this.heading || s.heading;
    const summary = this.#part("summary");
    summary.textContent = this.summary;
    summary.hidden = !this.summary;

    const hasPlan = this.#plan.trim() !== "";
    const toggle = this.#part<HTMLButtonElement>("toggle");
    const link = this.#part<HTMLAnchorElement>("link");
    toggle.hidden = Boolean(this.href) || !hasPlan;
    toggle.textContent = this.open ? s.close : s.open;
    toggle.setAttribute("aria-expanded", String(this.open));
    link.hidden = !this.href;
    link.textContent = s.open;
    if (this.href) link.href = this.href;
    else link.removeAttribute("href");
    this.#part("plan").hidden = !this.open || !hasPlan || Boolean(this.href);

    const revising = this.#revising && !decided;
    const box = this.#part("feedback").querySelector("input")!;
    if (box.value !== this.#feedbackText) box.value = this.#feedbackText;
    box.placeholder = s.feedbackPlaceholder;
    box.setAttribute("aria-label", s.feedbackLabel);
    box.disabled = disabled;
    this.#part("revise").hidden = !revising;
    this.#part("send").querySelector("button")!.textContent = s.send;
    this.#part("send").toggleAttribute("disabled", disabled || !this.#feedbackText.trim());
    this.#part("cancel").querySelector("button")!.textContent = s.cancel;

    this.#part("actions").hidden = decided || revising;
    const labels: Record<string, string> = { reject: s.reject, "revise-button": s.revise, accept: s.accept };
    for (const [part, label] of Object.entries(labels)) this.#part(part).querySelector("button")!.textContent = label;
    // Accepting lets the agent act, so the bridge asks the person first. Reject and Revise stay free.
    this.#part("accept").dataset.agentConfirm = s.acceptConfirm;
    for (const wrapper of this.querySelectorAll<HTMLElement>("[data-part='actions'] ui-button")) wrapper.toggleAttribute("disabled", disabled);
    // The first "Accept and use …" is the main action when there is one, otherwise Accept.
    this.toggleAttribute("data-accept-with", this.#accepts.length > 0);

    const line = this.#part("decision");
    line.hidden = !decided;
    const chosen = this.#decision?.mode ? (this.#accepts.find((option) => option.value === this.#decision!.mode)?.label ?? null) : null;
    line.textContent = this.#decision ? s.decided(this.#decision, chosen) : "";
    if (this.#decision) line.dataset.decision = this.#decision.decision;
    else delete line.dataset.decision;
  }
}

adoptStyles(styles);
define("ai-plan", AiPlanElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-plan": AiPlanElement;
  }
  interface HTMLElementEventMap extends PlanEvents {}
}
