# `<ai-questions>`

Several questions the model asks at once, shown one at a time. A header says where people are, like "1 of 3", with arrows to move back and forth. Each question is an [`<ai-question>`](../ai-question/README.md), with everything it can do: one choice or several, Other with a text box, and Skip.

People answer in any order. **Send** on the last question sends every answer together, and the card then sums them up: each question with its answer.

```ts
import "@samyakbhuta/ui-components/ai-questions"; // registers <ai-questions> and <ai-question>, and loads their CSS
```

```html
<ai-questions label="About the gift"></ai-questions>
```

```ts
const set = document.querySelector("ai-questions")!;
set.questions = [
  { question: "Who is it for?", options: ["A friend", "A parent", "A child"], other: true },
  { question: "What do they enjoy?", options: ["Books", "Cooking", "Games"], multiple: true, max: 2 },
  { question: "What's your budget?", options: ["Under £20", "£20 to £50", "Over £50"], skippable: true },
];
set.addEventListener("questionsanswer", (event) => {
  const { answers } = event.detail; // one per question: { value, labels, other }, or { skipped: true }
  tellModel(answers.map((answer) => ("skipped" in answer ? "Skipped" : answer.labels.join(", "))));
});
```

Questions written inside work too:

```html
<ai-questions>
  <ai-question question="Wrap it?"><ul><li>Yes</li><li>No</li></ul></ai-question>
  <ai-question question="Add a card?"><ul><li>Yes</li><li>No</li></ul></ai-question>
</ai-questions>
```

## Moving between questions

- **The arrows** go to the previous and next question. People can go back and change an answer at any time before sending.
- **Continue**, each question's own button before the last, keeps its answer and moves on. Skip does too, when a question allows it.
- **A single choice picked by tap or click moves on by itself** after a moment, so a quick answer takes one tap. Choices picked with the arrow keys don't, so keyboard users stay in control. Other, checkboxes and the last question wait for Continue or Send.
- **Send** on the last question sends every answer. If one is still unanswered, it goes there instead and says so.

The questions' own `questionanswer` and `questionskip` events stay inside the set; listen for `questionsanswer`.

In [`<ai-chat>`](../ai-chat/README.md), a model yields `{ type: "questions", questions: [...] }` and gets `{ answers }` back. Typing in the message box answers the question showing.

## Telling people the assistant is waiting on them

Until it's sent:
- **On screen:** a "Waiting for your answers" line at the top, with a pulsing dot, and an accent border around the whole set. The dot stays still with reduced motion.
- **To screen readers:** the set is a group, named by `label` ("Questions" by default) and described by that line. Inside an [`<ai-transcript>`](../ai-transcript/README.md), a finished reply is read out with "3 questions, starting with: Who is it for? Waiting for your answers."

## Attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `label` | `Questions` | The set's accessible name, like "About the gift". |
| `disabled` | off | Locks every question. |
| `answered` | set by the element | Present once the answers are sent. Style it, don't set it; use `answers` instead. |

## Properties

| Property | Type | What it holds |
| --- | --- | --- |
| `label`, `disabled` | | The same as the attributes. |
| `questions` | `{ question, options, multiple?, other?, max?, skippable? }[]` | The questions, as data, the same as each `<ai-question>`'s attributes. Setting it replaces any questions written inside. |
| `index` | `number` | Which question shows, from 0. |
| `answers` | `QuestionAnswer[] \| null` | The answers once sent, one per question, or `null`. Set it to show saved answers, like when a chat opens again; `null` asks again. |
| `strings` | `Partial<QuestionsStrings>` | Words to replace; see below. |

## Methods

| Method | What it does |
| --- | --- |
| `submit()` | Sends every answer, as Send does. Returns `false` when nothing was sent: it's already sent, disabled, a question is still unanswered (it goes there, and says so), or a listener cancelled the event. |

## Events

| Event | `detail` | When |
| --- | --- | --- |
| `questionsanswer` | `{ answers }` | Send was pressed with every question answered or skipped. `answers` has one per question, in order: `{ value, labels, other }`, or `{ skipped: true }`. It bubbles and is cancelable: `preventDefault()` keeps it asking. |

## Translation

| String | Default |
| --- | --- |
| `waiting` | `Waiting for your answers` |
| `label` | `Questions`: the set's name, unless the `label` attribute gives one |
| `position(index, count)` | `1 of 3` |
| `previous`, `next` | `Previous question`, `Next question`: the arrows' names |
| `nextQuestion` | `Continue`: each question's own button before the last |
| `send` | `Send answers`: the last question's button |
| `unanswered(index)` | `Question 1 still needs an answer.` |
| `summary` | `Your answers`: the summary's heading |
| `skipped` | `Skipped` |
| `sent(count)` | `Sent 3 answers`: announced once sent |

Each question's other words are its own: set `strings` on the `<ai-question>` elements inside.

## Safety

The questions, the choices and what people type are set as text, never parsed as HTML, as in `<ai-question>`.

## Accessibility

- The set is a group named by `label`, and described by the waiting line until it's sent.
- Only the question showing can be reached: the others are hidden and `inert`, for keyboards, screen readers and agents alike.
- The arrows are named "Previous question" and "Next question", and are disabled at either end. Focus moves into the question they show.
- Moving on by itself only follows a tap or a click, never the arrow keys.
- Once sent, focus moves to the summary, and a status region says how many answers were sent.

## Styling

The CSS sits in the `ai-questions` cascade layer, declared after `ai-question`'s, so the set's rules for the questions inside win: they lose their own border and waiting line, and the set shows one of each.

Set its custom properties on `ai-questions` itself, or once on an element around it, like `ai-chat` or `:root`, and every `<ai-questions>` inside takes them.

**Custom properties:**
- `--ai-questions-border`
- `--ai-questions-muted`: the position, and the summary's questions
- `--ai-questions-accent`: focus rings
- `--ai-questions-radius`
- `--ai-questions-waiting`

The questions inside keep their own properties, like `--ai-question-accent`.

**Parts:** `[data-part="header"]`, `status`, `status-dot`, `status-text`, `nav`, `previous`, `position`, `next`, `questions`, `summary`, `summary-heading` and `announcement`. `ai-questions[answered]` styles a sent set.

## Tests

`ai-questions.test.ts` covers:
- the group, the waiting line and one question at a time;
- moving with the arrows and Continue, keeping answers, and sending them all at once;
- the summary, and restoring saved answers;
- moving on by itself after a click, but not after the arrow keys or on the last question;
- Send with a question unanswered;
- questions written inside, cancelling and disabled;
- translation and agent use.

The browser tests in `e2e/questions.spec.ts` cover:
- keyboard use;
- contrast in light and dark;
- the gift questions in the chat shell, including a reload;
- phone width.
