# `<ai-question>`

A question the model asks, with choices to pick from. Use radio buttons for one choice, or checkboxes for several with `multiple`. `other` adds a last choice with a text box for an answer of one's own. It's the "ask the user" step of an agent: put it in a reply, and send the answer on as the next message.

It's built as a ui-sdk primitive, `question` (in `question.ts`), rendered as custom elements with ui-sdk's `createParts`. So it reports its answer like ui-sdk's own components report changes, with a reason and a source.

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
question.addEventListener("answerchange", (event) => {
  const answer = event.detail.value; // { value, labels, other }, or { skipped: true }
  sendToModel("skipped" in answer ? "Skipped" : answer.labels.join(", ")); // "Rome", or what was typed for Other
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
| `answer` | `QuestionAnswer \| null` | The answer once sent, `{ skipped: true }` once skipped, or `null`. Set it to show a saved answer, like when a chat opens again. `null` makes the question answerable again. Setting it doesn't fire `answerchange`. |
| `defaultAnswer` | `QuestionAnswer \| null` | The answer it starts with, read once when it's created. |
| `strings` | `Partial<QuestionStrings>` | Words to replace; see below. |

## Methods

Its methods are on `api`, like ui-sdk's elements:

| Method | What it does |
| --- | --- |
| `api.submit()` | Sends the answer, as pressing Send does. Returns `false` when nothing was sent: there was no valid answer, it was already answered, or a listener cancelled the change. |
| `api.skip()` | Skips the question, as pressing Skip does. Returns `false` when a listener cancelled it. |
| `api.reset()` | Makes the question answerable again, keeping what was chosen, without firing `answerchange`. |

## Events

| Event | `detail` | When |
| --- | --- | --- |
| `answerchange` | `{ value, reason, source }` | The question was answered or skipped. `value` is `{ value, labels, other }` for an answer, or `{ skipped: true }`. In an answer, `value` is the chosen value, or the chosen values in the order the choices appear with `multiple`, with a typed answer standing in for Other, last. `labels` are the same in words, for showing or sending as text, and `other` is what was typed, or `null`. `reason` says what asked: `"press"` for Send, `"enter-key"` for Enter in the Other box, `"skip-press"` for Skip, `"imperative"` for `api.submit()` and `api.skip()`. `source` says how: `"mouse"`, `"keyboard"`, `"agent"` and so on. Cancelable: `preventDefault()` leaves the question open. |

Like ui-sdk's change events, it doesn't bubble: listen on the element, or on an element around it with `{ capture: true }`. [`<ai-questions>`](../ai-questions/README.md) catches its questions' answers that way, and cancels them, so it can send them all together.

The event fires before the question shows as answered. To save it with its answer, wait a tick: `queueMicrotask(save)`.

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
    question.addEventListener("answerchange", (event) => {
      const answer = event.detail.value!;
      resolve("skipped" in answer ? "Skipped" : answer.labels.join(", "));
    });
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
| `send` | `Send answer` |
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
- After sending, focus moves to the answer line (ui-sdk's focus recovery), and ui-sdk's shared live region announces it.
- ui-sdk's agent bridge can choose and send: `{ ref: "Which city should the trip start in?", action: "setValue", args: ["Rome"] }`, then `{ ref: "Send answer", action: "press" }`. The radio or checkbox group is what it sees by the question's name; the `question` primitive itself stays out of the agent's view, so the name isn't shared by two components.

## Styling

The CSS sits in the `ai-question` cascade layer.

Set its custom properties on `ai-question` itself, or once on an element around it, like `ai-chat` or `:root`, and every `<ai-question>` inside takes them.

**Custom properties:**
- `--ai-question-border`
- `--ai-question-waiting`: the "Waiting for your answer" line and the border until it's answered
- `--ai-question-control`: the outlines of radios and checkboxes
- `--ai-question-hover`
- `--ai-question-muted`
- `--ai-question-accent`: checked controls and Send
- `--ai-question-accent-text`
- `--ai-question-radius`

**Parts:** `[data-part="body"]`, `status` (the waiting line), `status-dot`, `status-text`, `legend`, `hint`, `options`, `option`, `choice` (the label around a control and its text), `label`, `description`, `other`, `other-input`, `actions`, `send`, `skip` and `answer`. The primitive's parts also carry ui-sdk's `data-slot`: `question` on the element, and `question-status`, `question-hint`, `question-other`, `question-actions` and `question-answer`. `ai-question[answered]` styles an answered question, and `ai-question:not([answered])` one that's waiting.

## Tests

`ai-question.test.ts`:
- one and several choices, `max`, Other with typing and Enter;
- cancelling, Skip, restoring a saved answer and `reset()`;
- translation, attempts to inject HTML, and agent use;
- what each answer reports, that restoring and `reset()` report nothing, and the primitive on its own: server rendering, and its parts coming and going.

The browser tests in `e2e/question.spec.ts` cover:
- keyboard use and focus;
- contrast in light and dark;
- the trip planner in the chat shell, including a reload;
- phone width.
