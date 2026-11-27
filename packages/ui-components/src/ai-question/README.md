# `<ai-question>`

A question the model asks, with choices to pick from. Use radio buttons for one choice, or checkboxes for several with `multiple`. `other` adds a last choice with a text box for an answer of one's own. It's the "ask the user" step of an agent: put it in a reply, and send the answer on as the next message.

```ts
import "@samyakbhuta/ui-components/ai-question"; // registers <ai-question> and loads its CSS
```

```html
<ai-question question="Which city should the trip start in?" other skippable></ai-question>
<ai-question question="What would you like to do there?" multiple max="2">
  <ul>
    <li>Museums</li>
    <li>Food</li>
    <li>Beaches</li>
  </ul>
</ai-question>
```

```ts
const question = document.querySelector("ai-question")!;
question.options = ["Paris", "Rome", { value: "Lisbon", description: "The cheapest flights this month" }];
question.addEventListener("questionanswer", (event) => {
  sendToModel(event.detail.labels.join(", ")); // "Rome", or what was typed for Other
});
```

## Telling people the agent is waiting on them

Until it's answered, the question says so in three ways:
- **On screen:** a "Waiting for your answer" line at the top, with a pulsing dot, and an accent border. The dot stays still with reduced motion.
- **To screen readers:**
  - The line describes the choices, so moving into them reads "Which city should the trip start in?, radio group, Waiting for your answer".
  - Inside an [`<ai-transcript>`](../ai-transcript/README.md), the question is read out after the reply's text when the reply finishes, followed by "Waiting for your answer". Put the question in the message before calling `done()`.
- **Once answered:** the line, the dot and the accent go.

Around it, your app can say so too:
- set the composer's `placeholder` to something like "Answer the question above, or type your answer", and treat what's typed as the answer;
- give the chat a `status` in [`<ai-chat-list>`](../ai-chat-list/README.md), like "Needs your answer".

The chat shell in this repo does both, and also starts the tab's title with "Waiting for you" while the tab is in the background.

## Answering

Send stays disabled until there's an answer to send:
- one choice;
- at least one with `multiple`;
- some text when Other is chosen.

Typing in the Other box chooses Other, and Enter there sends.

Once sent, the question shows "Answered: Rome" and moves focus there, since Send is gone. Screen readers hear it too. The choices stay checked and readable, but can't change.

## Attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `question` | none | The question, shown above the choices. It names the group of choices. |
| `multiple` | off | Checkboxes, for choosing several, instead of radio buttons. A hint under the question says "Choose all that apply." |
| `max` | no limit | With `multiple`, the most choices allowed. Once that many are chosen, the rest are disabled, and the hint says "Choose up to 2." |
| `other` | off | Adds a last "Other" choice with a text box. |
| `skippable` | off | Adds a Skip button. |
| `disabled` | off | Locks every choice and button. |
| `answered` | set by the element | Present once the question has been answered or skipped. Style it, don't set it; use `answer` instead. |

## Properties

| Property | Type | What it holds |
| --- | --- | --- |
| `options` | `QuestionOption[]` | The choices: strings, or `{ value, label?, description?, disabled? }`. A `<ul>` or `<ol>` written inside the element is the starting list. |
| `question`, `multiple`, `other`, `max`, `skippable`, `disabled` | | The same as the attributes. |
| `value` | `string \| string[] \| null` | What's chosen so far: a value, or a list with `multiple`. A typed answer stands in for Other. Set it to choose from script. |
| `otherText` | `string` | What's typed in the Other box. |
| `answer` | `QuestionAnswer \| null` | The answer once sent, `{ skipped: true }` once skipped, or `null`. Set it to show a saved answer, like when a chat opens again. `null` makes the question answerable again. |
| `strings` | `Partial<QuestionStrings>` | Words to replace; see below. |

## Methods

| Method | What it does |
| --- | --- |
| `submit()` | Sends the answer, as pressing Send does. Returns `false` when nothing was sent: there was no valid answer, it was already answered, or a listener cancelled the event. |
| `skip()` | Skips the question, as pressing Skip does. Returns `false` when a listener cancelled it. |
| `reset()` | Makes the question answerable again, keeping what was chosen. |

## Events

Both events bubble and are cancelable: `preventDefault()` leaves the question open.

| Event | `detail` | When |
| --- | --- | --- |
| `questionanswer` | `{ value, labels, other }` | Send was pressed, or Enter in the Other box. `value` is the chosen value, or the chosen values in the order the choices appear with `multiple`; a typed answer stands in for Other, last. `labels` are the same in words, for showing or sending as text. `other` is what was typed, or `null`. |
| `questionskip` | `null` | Skip was pressed. |

The events fire before the question shows as answered. To save it with its answer, wait a tick: `queueMicrotask(save)`.

## From a tool call

Agents usually ask through a tool, like `ask_user`, whose arguments are JSON. Turn the call into an `<ai-question>`, and send the answer back as the tool's result:

```ts
function askUser(call: { question: string; options: string[]; multiple?: boolean; allowOther?: boolean }) {
  return new Promise<string>((resolve) => {
    const question = document.createElement("ai-question");
    question.question = call.question;
    question.options = call.options;
    question.multiple = call.multiple ?? false;
    question.other = call.allowOther ?? true;
    question.slot = "footer";
    question.addEventListener("questionanswer", (event) => resolve(event.detail.labels.join(", ")));
    reply.append(question); // the <ai-message> that's streaming the reply
  });
}
```

## Translation

| String | Default |
| --- | --- |
| `waiting` | `Waiting for your answer` |
| `other` | `Other` |
| `otherPlaceholder` | `Type your own answer` |
| `otherLabel` | `Your own answer`: the text box's accessible name |
| `send` | `Send` |
| `skip` | `Skip` |
| `multipleHint(max)` | `Choose all that apply.`, or `Choose up to ${max}.` |
| `answered(labels)` | `Answered: ${labels.join(", ")}` |
| `skipped` | `Skipped` |

## Safety

The question, the choices and what people type are set as text, never parsed as HTML. So a question written by a model can't add markup or run script.

## Accessibility

- The choices are ui-sdk Radio and Checkbox groups. Screen readers hear them as a radio group or a group, named by the question. With `multiple`, the hint describes the group, and each choice's `description` describes that choice.
- **Keyboard:** Tab moves into the group, and the arrow keys choose a radio. Space checks a checkbox, and Tab moves on to the Other box, Send and Skip.
- Choices over the `max` are disabled, so they leave the tab order until a choice is unchecked.
- The Other box has its own accessible name, "Your own answer".
- After sending, focus moves to the answer line, and a status region announces it.
- ui-sdk's agent bridge can choose and send: `{ ref: "Which city should the trip start in?", action: "setValue", args: ["Rome"] }`, then `{ ref: "Send", action: "press" }`.

## Styling

The CSS sits in the `ai-question` cascade layer.

**Custom properties:**
- `--ai-question-border`
- `--ai-question-waiting`: the "Waiting for your answer" line and the border until it's answered
- `--ai-question-control`: the outlines of radios and checkboxes
- `--ai-question-hover`
- `--ai-question-muted`
- `--ai-question-accent`: checked controls and Send
- `--ai-question-accent-text`
- `--ai-question-radius`

**Parts:** `[data-part="body"]`, `status` (the waiting line), `status-dot`, `status-text`, `legend`, `hint`, `options`, `option`, `choice` (the label around a control and its text), `label`, `description`, `other`, `other-input`, `actions`, `send`, `skip`, `answer` and `announcement`. `ai-question[answered]` styles an answered question, and `ai-question:not([answered])` one that's waiting.

## Tests

`ai-question.test.ts`:
- one and several choices, `max`, Other with typing and Enter;
- cancelling, Skip, restoring a saved answer and `reset()`;
- translation, attempts to inject HTML, and agent use.

The browser tests in `e2e/question.spec.ts` cover:
- keyboard use and focus;
- contrast in light and dark;
- the trip planner in the chat shell, including a reload;
- phone width.
