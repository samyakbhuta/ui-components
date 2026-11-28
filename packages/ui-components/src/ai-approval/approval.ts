import { announce, createChange, createFocusRecovery, definePrimitive, type ChangeDetails, type ChangeSource } from "@ui-sdk/core";

/** What people decided: allow this once, always allow this tool, or deny. */
export type ApprovalDecision = "allow" | "always" | "deny";

/** A decision once made: what `decisionchange` carries in `event.detail.value`, and what `decision` holds. */
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
  /** The line shown, and announced, once decided. With a reason, it says the person suggested something else. */
  decided: (decision: ApprovalDecision, reason: string | null) => string;
  /** What an agent pressing Allow once would do, asked of the person first (`data-agent-confirm`). */
  allowConfirm: (name: string) => string;
  /** What an agent pressing Always allow would do, asked of the person first. */
  alwaysConfirm: (name: string) => string;
  /** What an agent pressing Deny would do, with what's typed in the reason box, asked of the person first. */
  denyConfirm: (name: string, reason: string) => string;
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
    decision === "allow" ? "Allowed once" : decision === "always" ? "Always allowed" : reason ? `Denied. Instead, you suggested: “${reason}”` : "Denied",
  allowConfirm: (name) => (name ? `Allows ${name} to run, this once` : "Allows this action, this once"),
  alwaysConfirm: (name) => (name ? `Always allows ${name}, without asking again` : "Always allows this action, without asking again"),
  denyConfirm: (name, reason) => (reason ? `Denies ${name || "this action"}, and tells it instead: “${reason}”` : `Denies ${name || "this action"}, so it won't run`),
};

/** What asked for a decision: a button, Enter in the reason box, or code calling `decide`. */
export type ApprovalDecisionReason = "press" | "enter-key" | "imperative";

export type ApprovalOptions = {
  /** The tool or action asking, like "run_command". */
  name?: string;
  /** What it wants to do, in words, like "Run a command". Defaults to "Allow {name}?". */
  label?: string;
  /** A line under the heading, like what could happen. */
  description?: string;
  /** Offers Always allow, for apps that remember the choice. */
  always?: boolean;
  /** Adds a text box to say what to do instead, sent with Deny. */
  reason?: boolean;
  disabled?: boolean;
  /** What the tool would get, like a command or its arguments. Shown as text. */
  input?: unknown;
  strings?: Partial<ApprovalStrings>;
  decision?: ApprovalDecisionDetail | null;
  defaultDecision?: ApprovalDecisionDetail | null;
  onDecisionChange?: (value: ApprovalDecisionDetail | null, details: ChangeDetails<ApprovalDecisionReason>) => void;
};

/** The words in use: the defaults with any from `strings` on top. */
export const approvalStrings = (options: Pick<ApprovalOptions, "strings">): ApprovalStrings => ({ ...defaultApprovalStrings, ...options.strings });

/** The options the card shows, copied into state so a change to any of them renders again. */
const shown = (options: ApprovalOptions) => ({
  name: options.name ?? "",
  label: options.label ?? "",
  description: options.description ?? "",
  always: options.always ?? false,
  reason: options.reason ?? false,
  disabled: options.disabled ?? false,
  input: options.input,
  strings: approvalStrings(options),
});

export const approval = definePrimitive({
  name: "approval",
  options: {
    name: "string",
    label: "string",
    description: "string",
    always: "boolean",
    reason: "boolean",
    disabled: "boolean",
    input: "value",
    strings: "value",
    decision: "value",
    defaultDecision: "value",
    onDecisionChange: "callback",
  },
  controlled: ["decision"],
  state: (options: ApprovalOptions) => ({
    decision: options.decision ?? options.defaultDecision ?? null,
    reasonText: options.decision?.reason ?? options.defaultDecision?.reason ?? "",
    ...shown(options),
  }),
  sync: (options) => ({ ...shown(options), ...(options.decision === undefined ? {} : { decision: options.decision }) }),
  api: (context) => {
    const change = createChange(context);
    // The buttons go once decided, so focus moves to the line that says what was decided.
    const recovery = createFocusRecovery({ fallback: () => context.element("decision") });

    const decide = (
      decision: ApprovalDecision,
      options: { reason?: string; event?: Event; source?: ChangeSource; why?: ApprovalDecisionReason } = {},
    ) => {
      const state = context.store.get();
      if (state.decision || state.disabled) return false;
      if (decision === "always" && !state.always) return false;
      const typed = (options.reason ?? (state.reason ? state.reasonText : "")).trim();
      const value: ApprovalDecisionDetail = { decision, reason: decision === "deny" && typed ? typed : null };
      const accepted = change("decision", value, { reason: options.why ?? "imperative", event: options.event, source: options.source });
      if (accepted) announce(state.strings.decided(value.decision, value.reason));
      return accepted;
    };

    return {
      recovery,
      decide,
      /** Denies, with what to do instead. */
      deny: (reason?: string) => decide("deny", { reason }),
      setReasonText: (text: string) => context.store.set({ reasonText: text ?? "" }),
      getDecision: () => context.store.get().decision,
      getReasonText: () => context.store.get().reasonText,
      /** Shows a saved decision, or asks again with null, without reporting a change. */
      restore: (value: ApprovalDecisionDetail | null) =>
        context.store.set({ decision: value ?? null, ...(value?.reason ? { reasonText: value.reason } : {}) }),
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
      }),
    }),
    status: slot({
      present: (state) => !state.decision,
      attrs: (_state, part) => ({ id: `${part.id}-status` }),
    }),
    heading: slot({
      attrs: (_state, part) => ({ id: `${part.id}-heading` }),
    }),
    reason: slot({
      present: (state) => state.reason && !state.decision,
      bind: (el, part) => part.api.recovery.bind(el, part),
    }),
    actions: slot({
      present: (state) => !state.decision,
      bind: (el, part) => part.api.recovery.bind(el, part),
    }),
    decision: slot({
      present: (state) => state.decision !== null,
      attrs: (state) => ({ tabindex: "-1", "data-decision": state.decision?.decision }),
    }),
  }),
  // Every decision is a button marked for a person, so the bridge asks before an agent presses
  // one. An action here would skip those marks, and a mark on the root couldn't say which choice.
  agent: { actions: [] },
});
