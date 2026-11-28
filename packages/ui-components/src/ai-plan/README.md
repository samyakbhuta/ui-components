# `<ai-plan>`

An agent proposes a plan before it starts on a bigger task. People can open the plan to read it, then choose:
- **Accept:** go ahead with it.
- **Accept and use …:** go ahead, and switch to another mode at the same time, like auto mode. Your app lists these options in `accepts`.
- **Reject:** don't do it.
- **Revise…:** say what to change. The agent can then propose a new plan.

It's a sibling of [`<ai-approval>`](../ai-approval/README.md), which asks before one action, and [`<ai-question>`](../ai-question/README.md), which asks for information.

It's built as a ui-sdk primitive, `plan` (in `plan.ts`), rendered as custom elements with ui-sdk's `createParts`, and Open plan is ui-sdk's Collapsible. So it reports changes like ui-sdk's own components do, with a reason and a source, and AI agents see it as one component.

```ts
import "@samyakbhuta/ui-components/ai-plan"; // registers <ai-plan> and loads its CSS
```

```html
<ai-plan heading="Surprise party for Sam's 40th" summary="Five steps. Nothing is booked yet."></ai-plan>
```

```ts
const plan = document.querySelector("ai-plan")!;
plan.plan = "1. Pick a date.\n2. Send the invites.\n3. Book a room.\n4. Order a cake.\n5. Keep it secret."; // Markdown, shown when opened
plan.accepts = [{ value: "auto", label: "auto mode" }]; // adds "Accept and use auto mode"
plan.addEventListener("decisionchange", (event) => {
  const { decision, mode, feedback } = event.detail.value; // "accept", "reject" or "revise"
  if (decision === "accept") startWork({ mode }); // mode is "auto", or null for plain Accept
  else if (decision === "revise") askForNewPlan(feedback);
});
```

**Open plan** shows the full plan inside the card, as Markdown, and **Close plan** hides it again. A closed plan can still be found with the browser's find in page, which opens it. With `href`, Open plan is a link to your app's own page for the plan instead.

Once decided, the buttons go and a line shows what was chosen: "Accepted", "Accepted, using auto mode", "Rejected", or "Asked for changes: “Make it a picnic instead”". The plan can still be opened. Focus moves to that line, since the buttons are gone, and screen readers hear it too.

## Telling people the agent is waiting on them

Until a decision is made:
- **On screen:** a "Waiting for your review" line at the top, with a pulsing dot, and an accent border. The dot stays still with reduced motion.
- **To screen readers:**
  - The element is a group named by its heading and described by that line.
  - Inside an [`<ai-transcript>`](../ai-transcript/README.md), the heading is read out after the reply's text when the reply finishes, followed by "Waiting for your review".

In [`<ai-chat>`](../ai-chat/README.md), a model yields `{ type: "plan", … }` and gets the decision back. Choosing an "Accept and use …" option also switches the composer's Mode, and typing in the message box while the plan waits asks for changes with what was typed.

## Attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `heading` | `Proposed plan` | The plan's title. It names the group. |
| `summary` | none | A line under the heading, like how many steps it has or what could go wrong. |
| `href` | none | Makes Open plan a link to your app's page for the plan, instead of opening it in the card. |
| `open` | off | Whether the plan is open in the card. Open plan and Close plan toggle it. |
| `default-open` | off | Whether the plan starts open, read once when it's created. |
| `disabled` | off | Locks the buttons and the box. |
| `decided` | set by the element | Present once a decision is made. Style it, don't set it; use `decision` instead. `data-decision` says which, and `data-open` is there while the plan is open. |

## Properties

| Property | Type | What it holds |
| --- | --- | --- |
| `heading`, `summary`, `href`, `disabled` | | The same as the attributes. |
| `open` | `boolean` | Whether the plan is open. Setting it doesn't fire `openchange`. |
| `plan` | `string` | The full plan, as Markdown. It's never parsed as HTML. Long plans scroll inside the card, and can be reached with Tab. |
| `accepts` | `{ value, label }[]` | More ways to accept, each switching to a mode. Each adds a button, "Accept and use {label}", so write `label` to read well there, like `auto mode`. The first one is the main button. |
| `feedbackText` | `string` | What's typed in the Revise box. |
| `decision` | `{ decision, mode, feedback } \| null` | The decision once made, or `null`. Set it to show a saved decision, like when a chat opens again. `null` makes it ask again. Setting it doesn't fire `decisionchange`. |
| `defaultDecision` | `{ decision, mode, feedback } \| null` | The decision it starts with, read once when it's created. |
| `strings` | `Partial<PlanStrings>` | Words to replace; see below. |

## Methods

Its methods are on `api`, like ui-sdk's elements:

| Method | What it does |
| --- | --- |
| `api.decide(decision, { mode?, feedback? })` | Decides, as pressing a button does: `"accept"` (with a `mode` from `accepts`, or none), `"reject"`, or `"revise"` with the `feedback` (or what's typed in the box). Returns `false` when nothing happened: it was already decided, it's disabled, the mode isn't offered, there's no feedback for Revise, or a listener cancelled the change. |
| `api.setOpen(open)` | Opens or closes the plan, firing `openchange`. |
| `api.startRevising()`, `api.stopRevising()` | Opens or closes the Revise box, as Revise… and Cancel do. |

## Events

| Event | `detail` | When |
| --- | --- | --- |
| `decisionchange` | `{ value, reason, source }` | A decision was asked for. `value` is `{ decision, mode, feedback }`: `decision` is `"accept"`, `"reject"` or `"revise"`, `mode` is the chosen option's `value` with Accept, or `null`, and `feedback` is what to change with Revise, or `null`. `reason` says what asked: `"press"` for a button, `"enter-key"` for Enter in the Revise box, `"imperative"` for `api.decide()`. `source` says how: `"mouse"`, `"keyboard"`, `"agent"` and so on. Cancelable: `preventDefault()` keeps it asking. |
| `openchange` | `{ value, reason, source }` | The plan is opening (`value` is `true`) or closing. `reason` is `"trigger-press"` for Open plan and Close plan, `"find-in-page"` when the browser's find in page opened it, or `"imperative"` for `api.setOpen()`. Cancelable. |

Like ui-sdk's change events, these don't bubble: listen on the element, or on an element around it with `{ capture: true }`.

The event fires before the element shows the decision. To save it with the decision, wait a tick: `queueMicrotask(save)`.

## Translation

| String | Default |
| --- | --- |
| `waiting` | `Waiting for your review` |
| `heading` | `Proposed plan` |
| `open`, `close` | `Open plan`, `Close plan` |
| `accept`, `reject`, `revise` | `Accept`, `Reject`, `Revise…` |
| `acceptWith(label)` | `Accept and use ${label}` |
| `feedbackLabel` | `What should change?`: the Revise box's accessible name |
| `feedbackPlaceholder` | `Tell it what to change in the plan` |
| `send`, `cancel` | `Send changes`, `Cancel`: the Revise box's buttons |
| `decided(detail, label)` | `Accepted`, `Accepted, using ${label}`, `Rejected`, or `Asked for changes: “${feedback}”` |
| `acceptConfirm` | `Accepts the plan, so the agent goes ahead with it`: what the person is asked when an agent presses Accept |
| `acceptWithConfirm(label)` | `Accepts the plan and switches to ${label}, so the agent goes ahead with it`: the same for each Accept and use button |
| `rejectConfirm` | `Rejects the plan, so the agent stops`: what the person is asked when an agent presses Reject |
| `reviseConfirm(feedback)` | `Asks for changes to the plan: “${feedback}”`: what the person is asked when an agent sends changes from the Revise box |

## Safety

The heading, the summary, the plan and what people type are all set as text, never parsed as HTML: the plan goes through the same Markdown renderer as [`<ai-message>`](../ai-message/README.md). A plan written by a model can't add markup or run script.

## Accessibility

- **Keyboard:** Tab reaches Open plan, the plan when it's open and long enough to scroll, then Reject, Revise…, Accept and the Accept and use buttons. In the Revise box, Enter sends and Escape goes back to the buttons, with focus on Revise….
- Open plan is ui-sdk's Collapsible: a button with `aria-expanded`, pointing at the plan it shows.
- The element is a group named by its heading and, while waiting, described by "Waiting for your review".
- After deciding, focus moves to the decision line, and ui-sdk's shared live region announces it. Revise… and Cancel move focus to the box and back the same way (ui-sdk's focus recovery).
- The decision isn't told by colour alone: the line says it in words.
- ui-sdk's agent bridge sees the card as one `plan` component, named by its heading, with its `decision` and `open`, and the Collapsible as Open plan, which an agent can open on its own. It can press the buttons, like `{ ref: "Reject", action: "press" }`, but an agent decides nothing here on its own. Accept, each Accept and use, Reject and the Revise box's Send changes carry `data-agent-confirm`, so the bridge asks the person first (through `createAgent`'s `allow`, with the sentence from `strings`), and refuses the step without one. Revise… only opens the box, so it needs no one. To let agents make a choice alone, answer yes for it in your `allow`, or set its sentence to `""`, which takes the mark off: `plan.strings = { rejectConfirm: "" }`.

## Styling

The CSS sits in the `ai-plan` cascade layer.

Set its custom properties on `ai-plan` itself, or once on an element around it, like `ai-chat` or `:root`, and every `<ai-plan>` inside takes them.

**Custom properties:**
- `--ai-plan-border`
- `--ai-plan-muted`
- `--ai-plan-background`: the opened plan
- `--ai-plan-accent`: the main button and focus rings
- `--ai-plan-accent-text`
- `--ai-plan-link`: Open plan
- `--ai-plan-radius`
- `--ai-plan-max-height`: how tall the opened plan gets before it scrolls (`24rem`)
- `--ai-plan-waiting`
- `--ai-plan-accepted`
- `--ai-plan-rejected`

**Parts:** `[data-part="status"]`, `status-dot`, `status-text`, `header`, `titles`, `heading`, `summary`, `toggle`, `link`, `plan`, `revise`, `feedback`, `revise-actions`, `send`, `cancel`, `actions`, `secondary`, `primary`, `reject`, `revise-button`, `accept`, `accept-with` (with `data-mode`), `collapsible` and `decision` (with `data-decision`). The primitive's parts also carry ui-sdk's `data-slot`: `plan` on the element, and `plan-status`, `plan-heading`, `plan-revise`, `plan-actions` and `plan-decision`; the Collapsible's are `collapsible`, `collapsible-trigger` and `collapsible-panel`. `ai-plan[decided]` styles a decided plan, and `ai-plan:not([decided])` one that's waiting. On a narrow card, the buttons stack, with the main ones first.

## Tests

`ai-plan.test.ts` covers:
- the group's name and description, opening the plan, and `href`;
- each decision, the Accept and use options, focus and the announcement;
- the Revise box: Enter, Escape and Cancel;
- cancelling, restoring a saved decision, and disabled;
- translation, attempts to inject HTML, and agent use;
- what each change reports, cancelling `openchange`, and the primitive on its own: server rendering, and its parts coming and going.

The browser tests in `e2e/plan.spec.ts` cover:
- keyboard use;
- contrast in light and dark;
- the plan in a chat;
- phone width.
