# `<ai-approval>`

An agent asks permission before it acts, like running a command, deleting files or sending an email. People choose:
- **Allow once:** run it this time.
- **Always allow:** with `always`, for apps that remember the choice and stop asking.
- **Deny:** don't run it. With `reason`, people can also say what to do instead.

It's the permission half of "the agent is waiting on you"; [`<ai-question>`](../ai-question/README.md) is the half that asks for information.

```ts
import "@samyakbhuta/ui-components/ai-approval"; // registers <ai-approval> and loads its CSS
```

```html
<ai-approval
  name="run_command"
  label="Run a command"
  description="This deletes files in your project, and can't be undone."
  always
  reason
></ai-approval>
```

```ts
const approval = document.querySelector("ai-approval")!;
approval.input = "rm -rf dist"; // what the tool would get: shown as text, strings as they are, anything else as JSON
approval.addEventListener("approvaldecision", (event) => {
  const { decision, reason } = event.detail; // "allow", "always" or "deny"; reason is what was typed, with Deny
  if (decision === "deny") tellAgent(reason ?? "The person denied it.");
  else runTool();
});
```

Once decided, the buttons go and a line shows what was chosen: "Allowed once", "Always allowed", "Denied", or, when people typed what to do instead, "Denied. Instead, you suggested: “Only clear dist/cache”". The line is coloured green or red, with a dot. Focus moves to that line, since the buttons are gone, and screen readers hear it too.

## Telling people the agent is waiting on them

Until a decision is made:
- **On screen:** a "Waiting for your approval" line at the top, with a pulsing dot, and an accent border. The dot stays still with reduced motion.
- **To screen readers:**
  - The element is a group named by its heading and described by that line, so moving into it reads "Run a command, group, Waiting for your approval".
  - Inside an [`<ai-transcript>`](../ai-transcript/README.md), the heading is read out after the reply's text when the reply finishes, followed by "Waiting for your approval". Put the approval in the message before calling `done()`.

Around it, your app can say so too:
- set the composer's `placeholder` to something like "Allow or deny above, or tell it what to do instead", and treat what's typed as Deny with that reason;
- give the chat a `status` in [`<ai-chat-list>`](../ai-chat-list/README.md), like "Needs your approval".

The chat shell in this repo does both.

## Attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `name` | none | The tool or action asking, like `run_command`. It's shown in code type beside a `label`. |
| `label` | `Allow {name}?` | What it wants to do, in words, like "Run a command". It's the heading, and names the group. |
| `description` | none | A line under the heading, like what could go wrong. |
| `always` | off | Adds Always allow. Offer it only if your app remembers the choice. |
| `reason` | off | Adds a text box to say what to do instead. What's typed is sent with Deny, and Enter in the box denies. A reason typed before Allow once isn't sent. |
| `disabled` | off | Locks the buttons and the box. |
| `decided` | set by the element | Present once a decision is made. Style it, don't set it; use `decision` instead. |

## Properties

| Property | Type | What it holds |
| --- | --- | --- |
| `name`, `label`, `description`, `always`, `reason`, `disabled` | | The same as the attributes. |
| `input` | `unknown` | What the tool would get, like a command or its arguments. Strings show as they are; anything else as indented JSON. Always text, never HTML. Long input scrolls, and can be reached with Tab. |
| `reasonText` | `string` | What's typed in the reason box. |
| `decision` | `{ decision, reason } \| null` | The decision once made, or `null`. Set it to show a saved decision, like when a chat opens again. `null` makes it ask again. |
| `strings` | `Partial<ApprovalStrings>` | Words to replace; see below. |

## Methods

| Method | What it does |
| --- | --- |
| `decide(decision, reason?)` | Decides, as pressing a button does: `"allow"`, `"always"` (only with `always`) or `"deny"`, with an optional reason for Deny. Returns `false` when nothing happened: it was already decided, it's disabled, or a listener cancelled the event. |

## Events

| Event | `detail` | When |
| --- | --- | --- |
| `approvaldecision` | `{ decision, reason }` | A button was pressed, Enter was pressed in the reason box, or `decide()` was called. `decision` is `"allow"`, `"always"` or `"deny"`. `reason` is what was typed, with Deny, or `null`. It bubbles and is cancelable: `preventDefault()` keeps it asking. |

The event fires before the element shows the decision. To save it with the decision, wait a tick: `queueMicrotask(save)`.

## From a tool call

Agents send tool calls as a name and JSON arguments. Ask before running the ones that change things, and send a denial back as the tool's result, so the model can try something else:

```ts
async function runWithApproval(call: { name: string; input: unknown }, reply: HTMLElement) {
  if (alwaysAllowed.has(call.name)) return run(call);
  const decision = await new Promise<ApprovalDecisionDetail>((resolve) => {
    const approval = document.createElement("ai-approval");
    approval.name = call.name;
    approval.input = call.input;
    approval.always = true;
    approval.reason = true;
    approval.slot = "footer";
    approval.addEventListener("approvaldecision", (event) => resolve(event.detail));
    reply.append(approval); // the <ai-message> that's showing the reply
  });
  if (decision.decision === "always") alwaysAllowed.add(call.name);
  return decision.decision === "deny" ? `Denied by the user. ${decision.reason ?? ""}` : run(call);
}
```

Pair it with [`<ai-tool-call>`](../ai-tool-call/README.md) to show the tool running once it's allowed.

## Translation

| String | Default |
| --- | --- |
| `waiting` | `Waiting for your approval` |
| `label(name)` | `Allow ${name}?`, or `Allow this action?` with no name |
| `input` | `What it will do`: the input box's accessible name |
| `allow` | `Allow once` |
| `always` | `Always allow` |
| `deny` | `Deny` |
| `reasonLabel` | `What should it do instead?`: the text box's accessible name |
| `reasonPlaceholder` | `Optional: tell it what to do instead` |
| `decided(decision, reason)` | `Allowed once`, `Always allowed`, `Denied`, or with a reason `Denied. Instead, you suggested: “${reason}”` |

## Safety

The label, the name, the description, the input and what people type are all set as text, never parsed as HTML. So a tool call written by a model can't add markup or run script.

Showing the input matters: people should see exactly what they're allowing. Pass the real arguments, not a summary of them.

## Accessibility

- **Keyboard:** Tab moves through the input box (when it's long enough to scroll), the reason box, then Allow once, Always allow and Deny. Enter or Space presses a button, and Enter in the reason box denies with what's typed.
- The element is a group named by its heading and, while waiting, described by "Waiting for your approval".
- After deciding, focus moves to the decision line, and a status region announces it.
- The decision isn't told by colour alone: the line says it in words.
- ui-sdk's agent bridge can press the buttons: `{ ref: "Allow once", action: "press" }`.

## Styling

The CSS sits in the `ai-approval` cascade layer.

Set its custom properties on `ai-approval` itself, or once on an element around it, like `ai-chat` or `:root`, and every `<ai-approval>` inside takes them.

**Custom properties:**
- `--ai-approval-border`
- `--ai-approval-muted`
- `--ai-approval-background`: the input box
- `--ai-approval-accent`: Allow once and focus rings
- `--ai-approval-accent-text`
- `--ai-approval-radius`
- `--ai-approval-max-height`: how tall the input box gets before it scrolls (`12rem`)
- `--ai-approval-waiting`
- `--ai-approval-allowed`
- `--ai-approval-denied`

**Parts:** `[data-part="status"]`, `status-dot`, `status-text`, `header`, `heading`, `name`, `description`, `input`, `reason`, `actions`, `allow`, `always`, `deny`, `decision` (with `data-decision`) and `announcement`. `ai-approval[decided]` styles a decided approval, and `ai-approval:not([decided])` one that's waiting.

## Tests

`ai-approval.test.ts`:
- the group's name and description, and the input as text;
- each decision, focus and the announcement;
- Always allow, the reason box and Enter;
- cancelling, restoring a saved decision, and disabled;
- translation, attempts to inject HTML, and agent use.

The browser tests in `e2e/approval.spec.ts` cover:
- keyboard use and focus;
- contrast in light and dark, including both outcomes;
- the cleanup in the chat shell, including a reload;
- phone width.
