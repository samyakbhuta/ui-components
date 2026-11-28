import "@ui-sdk/web/button";
import "@ui-sdk/web/collapsible";
import "@ui-sdk/web/input";
import type { ChangeSource } from "@ui-sdk/core";
import { createParts, type UiActionDetail } from "@ui-sdk/web";
import { needsPerson } from "../agent.ts";
import { renderMarkdown } from "../ai-message/markdown.ts";
import { adoptStyles } from "../styles.ts";
import { plan, type PlanAcceptOption, type PlanDecision, type PlanDecisionDetail, type PlanDecisionReason, type PlanOpenReason, type PlanStrings } from "./plan.ts";
import styles from "./ai-plan.css?inline";

export { defaultPlanStrings, plan } from "./plan.ts";
export type { PlanAcceptOption, PlanDecision, PlanDecisionDetail, PlanDecisionReason, PlanOpenReason, PlanOptions, PlanStrings } from "./plan.ts";

/** What `decisionchange` carries in `event.detail`. */
export type PlanDecisionChangeDetail = {
  value: PlanDecisionDetail | null;
  reason: PlanDecisionReason;
  source: ChangeSource;
  event?: Event;
};

/** What `openchange` carries in `event.detail`. */
export type PlanOpenChangeDetail = {
  value: boolean;
  reason: PlanOpenReason;
  source: ChangeSource;
  event?: Event;
};

/** The events this element fires, by name. */
export type PlanEvents = {
  decisionchange: CustomEvent<PlanDecisionChangeDetail>;
  openchange: CustomEvent<PlanOpenChangeDetail>;
};

/**
 * `<ai-plan>`: an agent proposes a plan before it starts. People can open the plan, then Accept
 * it, Accept and switch mode, Reject it, or Revise it by saying what to change. It's ui-sdk's
 * `plan` primitive (`plan.ts`) rendered as custom elements. See README.md beside this file.
 */
export interface AiPlanElement extends HTMLElement {
  heading: string;
  summary: string;
  href: string;
  disabled: boolean;
  /** The full plan, as Markdown. Rendered safely: it's never parsed as HTML. */
  plan: string;
  accepts: PlanAcceptOption[];
  strings: Partial<PlanStrings> | undefined;
  /** Whether the plan is open, showing its full text. Setting it doesn't fire `openchange`. */
  open: boolean;
  /** The decision once made, or null. Setting it shows a saved decision, or asks again with null, without firing `decisionchange`. */
  decision: PlanDecisionDetail | null;
  /** What's typed in the Revise box. */
  feedbackText: string;
  api: {
    /** Decides as a button does: "accept" (with `mode`, one of `accepts`), "reject", or "revise" with `feedback`. Returns false when nothing happened. */
    decide(decision: PlanDecision, options?: { mode?: string; feedback?: string }): boolean;
    setOpen(open: boolean): boolean;
    startRevising(): boolean;
    stopRevising(): void;
  };
  // Its events are typed here, not in the global map: ui-sdk-style names like `decisionchange`
  // are shared between elements, with different details.
  addEventListener<K extends keyof PlanElementEventMap>(
    type: K,
    listener: (this: AiPlanElement, event: PlanElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof PlanElementEventMap>(
    type: K,
    listener: (this: AiPlanElement, event: PlanElementEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

/** Every event `<ai-plan>` takes listeners for: its own and the usual HTML ones. */
export interface PlanElementEventMap extends HTMLElementEventMap, PlanEvents {}

type Instance = ReturnType<typeof plan>;

const tag = (name: string, part: string) => {
  const element = document.createElement(name);
  element.dataset.part = part;
  return element;
};

/** Builds the card once, then keeps its words and controls in line with the options and state. */
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

  if (!el.querySelector(":scope > [data-part='actions']")) {
    const status = tag("ai-plan-status", "status");
    const dot = tag("span", "status-dot");
    dot.setAttribute("aria-hidden", "true");
    status.append(dot, tag("span", "status-text"));

    // Open plan is ui-sdk's Collapsible: the header holds its trigger, and the plan is its panel.
    const collapsible = tag("ui-collapsible", "collapsible") as HTMLElement & { open: boolean };
    const header = tag("div", "header");
    const titles = tag("div", "titles");
    titles.append(tag("ai-plan-heading", "heading"), tag("p", "summary"));
    const trigger = document.createElement("ui-collapsible-trigger");
    const toggle = tag("button", "toggle") as HTMLButtonElement;
    toggle.type = "button";
    trigger.append(toggle);
    header.append(titles, trigger, tag("a", "link"));
    const panel = tag("ui-collapsible-panel", "plan");
    // Closed, the plan stays findable with the browser's find in page, which opens it.
    panel.setAttribute("hidden-until-found", "");
    panel.setAttribute("hidden", "until-found");
    // A long plan scrolls inside the card, so keyboard users need to reach it too.
    panel.tabIndex = 0;
    collapsible.append(header, panel);
    collapsible.addEventListener("openchange", (event) => {
      const { value, reason, source } = (event as CustomEvent<{ value: boolean; reason: PlanOpenReason; source: ChangeSource }>).detail;
      if (!instance.api.setOpen(value, { reason, source })) event.preventDefault();
    });

    const revise = tag("ai-plan-revise", "revise");
    const field = tag("ui-input", "feedback");
    const box = document.createElement("input");
    box.type = "text";
    box.autocomplete = "off";
    box.addEventListener("input", () => instance.api.setFeedbackText(box.value));
    field.append(box);
    const reviseActions = tag("div", "revise-actions");
    reviseActions.append(
      press("cancel", () => instance.api.stopRevising()),
      press("send", (source) => instance.api.decide("revise", { source, why: "press" })),
    );
    revise.append(field, reviseActions);

    const actions = tag("ai-plan-actions", "actions");
    const secondary = tag("div", "secondary");
    secondary.append(
      press("reject", (source) => instance.api.decide("reject", { source, why: "press" })),
      press("revise-button", () => instance.api.startRevising()),
    );
    const primary = tag("div", "primary");
    primary.append(press("accept", (source) => instance.api.decide("accept", { source, why: "press" })));
    actions.append(secondary, primary);

    el.replaceChildren(status, collapsible, revise, actions, tag("ai-plan-decision", "decision"));
  }

  const part = <T extends HTMLElement = HTMLElement>(name: string) => el.querySelector<T>(`:scope [data-part='${name}']`)!;
  let shownPlan: string | null = null;
  let shownAccepts = "";

  const sync = () => {
    const { decision, open, feedbackText, heading, summary, href, disabled, plan: markdown, accepts, strings: s } = instance.get();

    part("status-text").textContent = s.waiting;
    part("heading").textContent = heading || s.heading;
    const summaryLine = part("summary");
    summaryLine.textContent = summary;
    summaryLine.hidden = !summary;

    if (markdown !== shownPlan) {
      shownPlan = markdown;
      const panel = part("plan");
      panel.replaceChildren(...renderMarkdown(markdown).map((block) => block.node));
      // Code blocks come with a Copy button that only <ai-message> handles.
      for (const copy of panel.querySelectorAll("[data-part='code-copy']")) copy.remove();
    }
    const hasPlan = markdown.trim() !== "";
    const collapsible = part<HTMLElement & { open: boolean }>("collapsible");
    const inPlace = hasPlan && !href;
    if (collapsible.open !== (open && inPlace)) collapsible.open = open && inPlace;
    const toggle = part<HTMLButtonElement>("toggle");
    toggle.hidden = !inPlace;
    toggle.textContent = open ? s.close : s.open;
    const link = part<HTMLAnchorElement>("link");
    link.hidden = !href;
    link.textContent = s.open;
    if (href) link.href = href;
    else link.removeAttribute("href");

    const box = part("feedback").querySelector("input")!;
    if (box.value !== feedbackText) box.value = feedbackText;
    box.placeholder = s.feedbackPlaceholder;
    box.setAttribute("aria-label", s.feedbackLabel);
    box.disabled = disabled;
    part("send").querySelector("button")!.textContent = s.send;
    part("send").toggleAttribute("disabled", disabled || !feedbackText.trim());
    part("cancel").querySelector("button")!.textContent = s.cancel;

    // One "Accept and use …" per option, after plain Accept.
    const acceptsKey = JSON.stringify([accepts, s.acceptWith(""), s.acceptWithConfirm("")]);
    if (acceptsKey !== shownAccepts) {
      shownAccepts = acceptsKey;
      const primary = part("primary");
      for (const old of primary.querySelectorAll("[data-part='accept-with']")) old.remove();
      for (const option of accepts) {
        const wrapper = press("accept-with", (source) => instance.api.decide("accept", { mode: option.value, source, why: "press" }));
        wrapper.dataset.mode = option.value;
        wrapper.querySelector("button")!.textContent = s.acceptWith(option.label);
        needsPerson(wrapper, s.acceptWithConfirm(option.label));
        primary.append(wrapper);
      }
    }
    const labels: Record<string, string> = { reject: s.reject, "revise-button": s.revise, accept: s.accept };
    for (const [name, label] of Object.entries(labels)) part(name).querySelector("button")!.textContent = label;
    // An agent decides nothing here on its own: the bridge asks the person first. An empty sentence lets it.
    // Revise… only opens the box, so it stays free; Send changes is what decides.
    needsPerson(part("accept"), s.acceptConfirm);
    needsPerson(part("reject"), s.rejectConfirm);
    needsPerson(part("send"), s.reviseConfirm(feedbackText.trim()));
    for (const wrapper of el.querySelectorAll<HTMLElement>("[data-part='actions'] ui-button")) wrapper.toggleAttribute("disabled", disabled);

    const chosen = decision?.mode ? (accepts.find((option) => option.value === decision.mode)?.label ?? null) : null;
    part("decision").textContent = decision ? s.decided(decision, chosen) : "";
  };
  sync();
  return instance.subscribe(sync);
}

const parts = createParts(plan, {
  root: {
    tag: "ai-plan",
    display: "block",
    state: {
      decision: { get: (api) => api.getDecision(), set: (api, value) => api.restore(value) },
      open: { get: (api) => api.getOpen(), set: (api, value) => api.setOpen(value !== false) },
      feedbackText: { get: (api) => api.getFeedbackText(), set: (api, value) => api.setFeedbackText(value) },
    },
    api: ["decide", "setOpen", "startRevising", "stopRevising"],
    render: (el, instance) => render(el, instance),
  },
  status: { tag: "ai-plan-status", display: "block" },
  heading: { tag: "ai-plan-heading", display: "block" },
  revise: { tag: "ai-plan-revise", display: "block" },
  actions: { tag: "ai-plan-actions", display: "block" },
  decision: { tag: "ai-plan-decision", display: "block" },
});

/** The element's class, for `instanceof` checks. Undefined on a server, where nothing is defined. */
export const AiPlanElement = parts.Root as unknown as { new (): AiPlanElement; prototype: AiPlanElement } | undefined;

adoptStyles(styles);

declare global {
  interface HTMLElementTagNameMap {
    "ai-plan": AiPlanElement;
  }
}
