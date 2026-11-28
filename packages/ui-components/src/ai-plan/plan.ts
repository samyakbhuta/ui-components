import { announce, createChange, createFocusRecovery, definePrimitive, type ChangeDetails, type ChangeSource } from "@ui-sdk/core";

/** What people decided: accept the plan, reject it, or ask for changes. */
export type PlanDecision = "accept" | "reject" | "revise";

/** One more way to accept: accept and switch to a mode, like `{ value: "auto", label: "auto mode" }`. */
export type PlanAcceptOption = {
  /** The mode's value, given back in the decision. In `<ai-chat>`, the composer's Mode switches to it. */
  value: string;
  /** The mode's name, as it reads after "Accept and use": "auto mode". */
  label: string;
};

/** A decision once made: what `decisionchange` carries in `event.detail.value`, and what `decision` holds. */
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
  /** What an agent pressing Reject would do, asked of the person first. */
  rejectConfirm: string;
  /** What an agent sending changes from the Revise box would do, with what's typed, asked of the person first. */
  reviseConfirm: (feedback: string) => string;
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
  rejectConfirm: "Rejects the plan, so the agent stops",
  reviseConfirm: (feedback) => (feedback ? `Asks for changes to the plan: “${feedback}”` : "Asks for changes to the plan"),
};

/** What asked for a decision: a button, Enter in the Revise box, or code calling `decide`. */
export type PlanDecisionReason = "press" | "enter-key" | "imperative";

/** What opened or closed the plan: Open plan, the browser's find in page, or code. */
export type PlanOpenReason = "trigger-press" | "find-in-page" | "imperative";

export type PlanOptions = {
  /** The plan's title. Defaults to "Proposed plan". */
  heading?: string;
  /** A line under the heading, shown while the plan is closed. */
  summary?: string;
  /** Makes Open plan a link to the app's own page for the plan, instead of opening it here. */
  href?: string;
  disabled?: boolean;
  /** The full plan, as Markdown. Rendered safely: it's never parsed as HTML. */
  plan?: string;
  /** More ways to accept, each switching to a mode: "Accept and use auto mode". */
  accepts?: PlanAcceptOption[];
  strings?: Partial<PlanStrings>;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, details: ChangeDetails<PlanOpenReason>) => void;
  decision?: PlanDecisionDetail | null;
  defaultDecision?: PlanDecisionDetail | null;
  onDecisionChange?: (value: PlanDecisionDetail | null, details: ChangeDetails<PlanDecisionReason>) => void;
};

/** The words in use: the defaults with any from `strings` on top. */
export const planStrings = (options: Pick<PlanOptions, "strings">): PlanStrings => ({ ...defaultPlanStrings, ...options.strings });

/** The options the card shows, copied into state so a change to any of them renders again. */
const shown = (options: PlanOptions) => ({
  heading: options.heading ?? "",
  summary: options.summary ?? "",
  href: options.href ?? "",
  disabled: options.disabled ?? false,
  plan: options.plan ?? "",
  accepts: options.accepts ?? [],
  strings: planStrings(options),
});

export const plan = definePrimitive({
  name: "plan",
  options: {
    heading: "string",
    summary: "string",
    href: "string",
    disabled: "boolean",
    plan: "value",
    accepts: "value",
    strings: "value",
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    decision: "value",
    defaultDecision: "value",
    onDecisionChange: "callback",
  },
  controlled: ["decision", "open"],
  state: (options: PlanOptions) => ({
    decision: options.decision ?? options.defaultDecision ?? null,
    open: options.open ?? options.defaultOpen ?? false,
    feedbackText: "",
    revising: false,
    ...shown(options),
  }),
  sync: (options) => ({
    ...shown(options),
    ...(options.decision === undefined ? {} : { decision: options.decision }),
    ...(options.open === undefined ? {} : { open: options.open }),
  }),
  api: (context) => {
    const change = createChange(context);
    // Buttons and the Revise box come and go, so focus follows to what replaced them: the
    // decision line, the Revise box's text field, or Revise… again.
    const recovery = createFocusRecovery({
      fallback: () => {
        const { decision, revising } = context.store.get();
        if (decision) return context.element("decision");
        if (revising) return context.element("revise")?.querySelector<HTMLElement>("input");
        return context.element("actions")?.querySelector<HTMLElement>("[data-part='revise-button'] button");
      },
    });

    const decide = (
      decision: PlanDecision,
      options: { mode?: string; feedback?: string; event?: Event; source?: ChangeSource; why?: PlanDecisionReason } = {},
    ) => {
      const state = context.store.get();
      if (state.decision || state.disabled) return false;
      const mode = decision === "accept" ? (options.mode ?? null) : null;
      if (mode !== null && !state.accepts.some((option) => option.value === mode)) return false;
      const feedback = decision === "revise" ? (options.feedback ?? state.feedbackText).trim() : "";
      if (decision === "revise" && !feedback) return false;
      const value: PlanDecisionDetail = { decision, mode, feedback: feedback || null };
      const accepted = change("decision", value, { reason: options.why ?? "imperative", event: options.event, source: options.source });
      if (!accepted) return false;
      context.store.set({ revising: false });
      const label = mode ? (state.accepts.find((option) => option.value === mode)?.label ?? null) : null;
      announce(state.strings.decided(value, label));
      return true;
    };

    return {
      recovery,
      decide,
      setOpen: (open: boolean, options: { reason?: PlanOpenReason; event?: Event; source?: ChangeSource } = {}) =>
        change("open", open, { reason: options.reason ?? "imperative", event: options.event, source: options.source }),
      /** Opens the Revise box, to say what to change. */
      startRevising: () => {
        const state = context.store.get();
        if (state.decision || state.disabled) return false;
        context.store.set({ revising: true });
        return true;
      },
      stopRevising: () => context.store.set({ revising: false }),
      setFeedbackText: (text: string) => context.store.set({ feedbackText: text ?? "" }),
      getDecision: () => context.store.get().decision,
      getOpen: () => context.store.get().open,
      getFeedbackText: () => context.store.get().feedbackText,
      /** Shows a saved decision, or asks again with null, without reporting a change. */
      restore: (value: PlanDecisionDetail | null) => context.store.set({ decision: value ?? null, revising: false }),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state, part) => ({
        "aria-labelledby": `${part.id}-heading`,
        "aria-describedby": state.decision ? undefined : `${part.id}-status`,
        decided: state.decision ? "" : undefined,
        "data-decision": state.decision?.decision,
        "data-open": state.open ? "" : undefined,
        // The first "Accept and use …" is the main action when there is one, otherwise Accept.
        "data-accept-with": state.accepts.length ? "" : undefined,
      }),
    }),
    status: slot({
      present: (state) => !state.decision,
      attrs: (_state, part) => ({ id: `${part.id}-status` }),
    }),
    heading: slot({
      attrs: (_state, part) => ({ id: `${part.id}-heading` }),
    }),
    revise: slot({
      present: (state) => state.revising && !state.decision,
      bind: (el, part) => part.api.recovery.bind(el, part),
      on: {
        keydown: (event, { api }) => {
          const key = (event as KeyboardEvent).key;
          if (key === "Enter" && !(event as KeyboardEvent).isComposing) {
            event.preventDefault();
            api.decide("revise", { event, why: "enter-key" });
          } else if (key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            api.stopRevising();
          }
        },
      },
    }),
    actions: slot({
      present: (state) => !state.decision && !state.revising,
      bind: (el, part) => part.api.recovery.bind(el, part),
    }),
    decision: slot({
      present: (state) => state.decision !== null,
      attrs: (state) => ({ tabindex: "-1", "data-decision": state.decision?.decision }),
    }),
  }),
  // Every decision is a button marked for a person, so the bridge asks before an agent presses
  // one. Open plan is ui-sdk's Collapsible, which agents can open on their own.
  agent: { actions: [] },
});
