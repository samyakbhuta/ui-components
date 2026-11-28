import "@ui-sdk/web/button";
import "@ui-sdk/web/input";
import type { ChangeSource } from "@ui-sdk/core";
import { createParts, type UiActionDetail } from "@ui-sdk/web";
import { showValue } from "../format.ts";
import { adoptStyles } from "../styles.ts";
import { approval, type ApprovalDecision, type ApprovalDecisionDetail, type ApprovalDecisionReason, type ApprovalStrings } from "./approval.ts";
import styles from "./ai-approval.css?inline";

export { approval, defaultApprovalStrings } from "./approval.ts";
export type { ApprovalDecision, ApprovalDecisionDetail, ApprovalDecisionReason, ApprovalOptions, ApprovalStrings } from "./approval.ts";

/** What `decisionchange` carries in `event.detail`. */
export type ApprovalDecisionChangeDetail = {
  value: ApprovalDecisionDetail | null;
  reason: ApprovalDecisionReason;
  source: ChangeSource;
  event?: Event;
};

/** The events this element fires, by name. */
export type ApprovalEvents = {
  decisionchange: CustomEvent<ApprovalDecisionChangeDetail>;
};

/**
 * `<ai-approval>`: an agent asks permission before it acts, like running a command or sending
 * an email. People choose Allow once, Always allow (with `always`) or Deny, and with `reason`
 * can say what to do instead. It's ui-sdk's `approval` primitive (`approval.ts`) rendered as
 * custom elements. See README.md beside this file.
 */
export type AiApprovalElement = HTMLElement & {
  name: string;
  label: string;
  description: string;
  always: boolean;
  reason: boolean;
  disabled: boolean;
  input: unknown;
  strings: Partial<ApprovalStrings> | undefined;
  /** The decision once made, or null. Setting it shows a saved decision, or asks again with null, without firing `decisionchange`. */
  decision: ApprovalDecisionDetail | null;
  /** What's typed in the reason box. */
  reasonText: string;
  api: {
    /** Decides as a button does: "allow", "always" (only with `always`) or "deny", with an optional reason for Deny. Returns false when nothing happened. */
    decide(decision: ApprovalDecision, options?: { reason?: string }): boolean;
    deny(reason?: string): boolean;
  };
};

type Instance = ReturnType<typeof approval>;

const tag = <K extends string>(name: K, part: string) => {
  const element = document.createElement(name);
  element.dataset.part = part;
  return element;
};

/** Builds the card once, then keeps its words and controls in line with the options and state. */
function render(el: HTMLElement, instance: Instance) {
  if (!el.querySelector(":scope > [data-part='actions']")) {
    const status = tag("ai-approval-status", "status");
    const dot = tag("span", "status-dot");
    dot.setAttribute("aria-hidden", "true");
    status.append(dot, tag("span", "status-text"));

    const header = tag("div", "header");
    header.append(tag("ai-approval-heading", "heading"), tag("code", "name"));

    const input = tag("pre", "input");
    // Long commands scroll, so keyboard users need to reach the box too.
    input.tabIndex = 0;

    const reasonField = tag("ai-approval-reason", "reason");
    const field = document.createElement("ui-input");
    const box = document.createElement("input");
    box.type = "text";
    box.autocomplete = "off";
    box.addEventListener("input", () => instance.api.setReasonText(box.value));
    box.addEventListener("keydown", (event) => {
      // Enter with something typed denies with it, as "do this instead".
      if (event.key === "Enter" && !event.isComposing && box.value.trim()) {
        event.preventDefault();
        instance.api.decide("deny", { event, why: "enter-key" });
      }
    });
    field.append(box);
    reasonField.append(field);

    const actions = tag("ai-approval-actions", "actions");
    for (const choice of ["allow", "always", "deny"] as const) {
      const wrapper = tag("ui-button", choice);
      const button = document.createElement("button");
      button.type = "button";
      wrapper.append(button);
      // The press's own source, since the change comes from the button's event, not a key or pointer of ours.
      wrapper.addEventListener("action", (event) => instance.api.decide(choice, { source: (event as CustomEvent<UiActionDetail>).detail.source, why: "press" }));
      actions.append(wrapper);
    }

    el.replaceChildren(status, header, tag("p", "description"), input, reasonField, actions, tag("ai-approval-decision", "decision"));
  }

  const sync = () => {
    const { decision, reasonText, strings: s, ...card } = instance.get();
    const part = <T extends HTMLElement = HTMLElement>(name: string) => el.querySelector<T>(`:scope [data-part='${name}']`)!;

    part("status-text").textContent = s.waiting;
    part("heading").textContent = card.label || s.label(card.name);
    const name = part("name");
    name.textContent = card.name;
    // The default heading already says the name.
    name.hidden = !card.name || !card.label;
    const description = part("description");
    description.textContent = card.description;
    description.hidden = !card.description;

    const input = part("input");
    const shown = showValue(card.input);
    input.textContent = shown;
    input.hidden = !shown;
    input.setAttribute("aria-label", s.input);

    const reasonField = part("reason");
    const box = reasonField.querySelector("input")!;
    if (box.value !== reasonText) box.value = reasonText;
    box.placeholder = s.reasonPlaceholder;
    box.setAttribute("aria-label", s.reasonLabel);
    box.disabled = card.disabled;
    box.readOnly = decision !== null;

    for (const choice of ["allow", "always", "deny"] as const) {
      const wrapper = part(choice);
      wrapper.querySelector("button")!.textContent = s[choice];
      wrapper.toggleAttribute("disabled", card.disabled);
      if (choice === "always") wrapper.hidden = !card.always;
      // An agent can't approve its own request: the bridge asks the person first. Deny stays free.
      if (choice !== "deny") wrapper.dataset.agentConfirm = (choice === "allow" ? s.allowConfirm : s.alwaysConfirm)(card.name);
    }

    part("decision").textContent = decision ? s.decided(decision.decision, decision.reason) : "";
  };
  sync();
  return instance.subscribe(sync);
}

const parts = createParts(approval, {
  root: {
    tag: "ai-approval",
    display: "block",
    state: {
      decision: { get: (api) => api.getDecision(), set: (api, value) => api.restore(value) },
      reasonText: { get: (api) => api.getReasonText(), set: (api, value) => api.setReasonText(value) },
    },
    api: ["decide", "deny"],
    render: (el, instance) => render(el, instance),
  },
  status: { tag: "ai-approval-status", display: "block" },
  heading: { tag: "ai-approval-heading", display: "block" },
  reason: { tag: "ai-approval-reason", display: "block" },
  actions: { tag: "ai-approval-actions", display: "block" },
  decision: { tag: "ai-approval-decision", display: "block" },
});

/** The element's class, for `instanceof` checks. Undefined on a server, where nothing is defined. */
export const AiApprovalElement = parts.Root as unknown as { new (): AiApprovalElement; prototype: AiApprovalElement } | undefined;

adoptStyles(styles);

declare global {
  interface HTMLElementTagNameMap {
    "ai-approval": AiApprovalElement;
  }
  interface HTMLElementEventMap extends ApprovalEvents {}
}
