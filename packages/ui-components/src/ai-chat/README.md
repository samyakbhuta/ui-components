# `<ai-chat>`

A whole chat in one tag. Give it a `model`, a function that streams a reply, and it runs the conversation:
- your messages, and the replies streaming in;
- **Stop**, **Retry**, and errors;
- thinking, tool calls, cited sources and follow-up questions;
- questions, approvals and plans that wait for the person.

It's built from the other components: [`<ai-transcript>`](../ai-transcript/README.md), [`<ai-composer>`](../ai-composer/README.md), [`<ai-message>`](../ai-message/README.md), and the parts a reply can hold.

```ts
import "@samyakbhuta/ui-components/ai-chat"; // registers <ai-chat> and the parts it uses
```

```html
<ai-chat style="height: 80vh"></ai-chat>
```

```ts
const chat = document.querySelector("ai-chat")!;
chat.model = async function* ({ messages, signal }) {
  const response = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ messages }), signal });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  for (let part = await reader.read(); !part.done; part = await reader.read()) yield part.value;
};
```

Give the chat a height, or put it in a grid or flex layout that gives it one. The conversation scrolls within it, and the composer stays at the bottom.

New to it? [Making `<ai-chat>` your own](https://github.com/samyakbhuta/ui-components/blob/main/docs/making-ai-chat-your-own.md) walks through eight recipes, from a model picker to a sidebar of saved chats, each a page you can copy and see running.

## The model

`model` gets `{ messages, prompt, signal }`:
- `messages` is the conversation so far, newest last, as plain data ([`ChatMessage`](#saving-and-restoring)).
- `prompt` is what was sent, from the composer: `text`, `files`, and the chosen `mode`, `model` and `thinking` level, if those are on.
- `signal` aborts when Stop is pressed. Pass it to `fetch`.

It returns an async generator (or any async iterable) of chunks, or a promise of the whole text. A chunk is a string of text to add, or one of these:

| Chunk | What it shows |
| --- | --- |
| `"text"` or `{ type: "text", text }` | Text added to the reply, as Markdown. |
| `{ type: "thinking", text?, done? }` | An [`<ai-thinking>`](../ai-thinking/README.md) above the reply, with `text` added to its reasoning. It finishes at `done: true`, or when text or a tool call arrives. |
| `{ type: "tool", id, name, label?, input? }` | An [`<ai-tool-call>`](../ai-tool-call/README.md), running. |
| `{ type: "tool-result", id, summary?, output?, error? }` | Finishes the tool call with that `id`, or fails it with `error`. |
| `{ type: "sources", sources }` | An [`<ai-sources>`](../ai-sources/README.md) under the reply, linking its `[1]` markers. |
| `{ type: "suggestions", suggestions }` | Follow-up questions under the reply, which send when pressed. Only the newest reply keeps them. |
| `{ type: "model", name }` | Which model answered, like `Haiku 5.5`, shown beside the reply's time. Without it, the reply shows the label of the model chosen in the composer, if it has models. Use it when your server picks the model. |
| `{ type: "question", question, options, multiple?, other?, max?, skippable? }` | An [`<ai-question>`](../ai-question/README.md). The model waits, and the answer comes back as the value of the `yield`. |
| `{ type: "questions", label?, questions }` | An [`<ai-questions>`](../ai-questions/README.md) set: several questions, one at a time. The model waits, and `{ answers }` comes back as the value of the `yield`, one per question. Typing in the box answers the question showing. |
| `{ type: "approval", name, label?, description?, input?, always?, reason? }` | An [`<ai-approval>`](../ai-approval/README.md). The model waits, and the decision comes back as the value of the `yield`. |
| `{ type: "plan", heading?, summary?, plan?, href?, accepts? }` | An [`<ai-plan>`](../ai-plan/README.md): a plan to review, with `plan` as Markdown. The model waits, and the decision comes back as the value of the `yield`. |
| `{ type: "notice", heading, text?, tone?, resetsAt?, actions?, dismissible?, lock? }` | An [`<ai-notice>`](../ai-notice/README.md): something that stops the chat and needs action, like a usage limit. The message box locks until `resetsAt` (an ISO time), until it's dismissed, or until you call `unlock()`. `lock: false` doesn't lock; an `info` notice locks only with `lock: true`. Yield it and return. See [Limits and other notices](#limits-and-other-notices). |

## Questions and approvals

`yield` a question or an approval, and the model waits for the person:

```ts
chat.model = async function* () {
  const city = yield { type: "question", question: "Which city?", options: ["Paris", "Rome"], other: true };
  if ("skipped" in city) return yield "No problem, I'll pick one.";
  yield `${city.labels[0]} it is. `;

  const decision = yield { type: "approval", name: "book_hotel", label: "Book a hotel", input: { city: city.value }, always: true, reason: true };
  if (decision.decision === "deny") return yield `OK, I won't book it. ${decision.reason ?? ""}`;
  yield "Booked.";
};
```

- **The answer:** for a question, it's `{ value, labels, other }`, or `{ skipped: true }`. For an approval, it's `{ decision, reason }`, with `decision` being `"allow"`, `"always"` or `"deny"`.
- **What comes after:** the card ends the reply so far, and anything yielded after it starts a new reply below.
- **While it waits:**
  - the chat has the `waiting` attribute, and Stop gives way to the message box;
  - the message box says how to answer;
  - what's typed answers the question (a choice's name chooses it, anything else is "Other"), or denies the approval with what was typed as the reason.
- **Always allow:** a tool chosen with Always allow isn't asked about again. Its card shows "Always allowed", and the model gets `{ decision: "always" }` straight away. `alwaysAllowed` holds those tools, to save and restore.
- **After a reload:** a saved question, approval or plan that wasn't answered asks the model again once it's answered. The answer is in the last message, as `question.answer`, `approval.decision` or `plan.decision`.

### Plans

`yield` a plan before a bigger task, and the model waits for the review:

```ts
chat.model = async function* () {
  let review = yield { type: "plan", heading: "Clean up the build", plan: "1. Look in `dist/`.\n2. Delete it.", accepts: [{ value: "auto", label: "auto mode" }] };
  while (review.decision === "revise") review = yield { type: "plan", heading: "Clean up, gently", plan: revisedPlan(review.feedback) };
  if (review.decision === "reject") return yield "OK, I'll leave it.";
  yield "Starting."; // review.mode is "auto" with Accept and use auto mode
};
```

- **The decision:** `{ decision, mode, feedback }`, with `decision` being `"accept"`, `"reject"` or `"revise"`.
- **Accept and use …:** each of `accepts` adds a button. Choosing one also switches the composer's Mode to its `value`, when the composer offers that mode, and `mode` comes back with the decision.
- **Typing while it waits:** what's typed asks for changes: `{ decision: "revise", feedback }`.

## Attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `actions` | `copy retry` | The actions each reply offers, from `copy`, `retry`, `edit` and `feedback`, separated by spaces. Only the newest turn offers Retry. |
| `waiting` | set by the element | Present while a question, an approval or a plan waits for the person. Style it, don't set it. |
| `locked` | set by the element | Present while a notice locks the message box. Style it, don't set it. |

## Properties

| Property | Type | What it holds |
| --- | --- | --- |
| `model` | `ChatModel \| null` | Your model. See [The model](#the-model). Without one, a reply says no model is connected. |
| `messages` | `ChatMessage[]` | The conversation, as plain data. Set it to show a saved one; that stops any reply coming in. |
| `suggestions` | `Suggestion[]` | Starters, shown while the chat is empty, as for [`<ai-suggestions>`](../ai-suggestions/README.md). |
| `alwaysAllowed` | `string[]` | Tools chosen with Always allow. |
| `actions` | `string` | The same as the attribute. |
| `strings` | `Partial<ChatStrings>` | Words to replace; see below. |
| `busy` | `boolean` (read-only) | `true` while a reply comes in. |
| `waiting` | `boolean` (read-only) | `true` while a question, an approval or a plan waits. |
| `locked` | `boolean` (read-only) | `true` while a notice locks the message box. |
| `composer`, `transcript` | (read-only) | The [`<ai-composer>`](../ai-composer/README.md) and [`<ai-transcript>`](../ai-transcript/README.md) inside, to set up. For example, `chat.composer.models = defaultModels`. |

## Methods

| Method | What it does |
| --- | --- |
| `send(text)` | Sends a prompt, as typing it and pressing Send does. Returns `false` when nothing was sent. |
| `stop()` | Stops the reply coming in, as Stop does. |
| `retry()` | Asks again for the newest turn, as Retry does. Returns `false` when there's nothing to retry. |
| `clear()` | Empties the conversation. |
| `unlock()` | Unlocks the message box a notice locked, like once people choose a way round a limit. Returns `false` when it wasn't locked. |

## Events

| Event | `detail` | When |
| --- | --- | --- |
| `chatchange` | `{ messages }` | The conversation changed and is worth saving: a reply finished or stopped, a question was asked or answered, or a reply was rated. |
| `chaterror` | `{ error }` | The model threw, or its request failed. The reply shows the error's message, with Retry. Stop doesn't fire it. |
| `noticeaction` | `{ value, reason, source }` | A button or link on a notice in the chat was pressed. The chat passes it on from the `<ai-notice>`, since ui-sdk-style events don't bubble. Cancelable: on a link, `preventDefault()` keeps it from opening. |

The composer's own events, like `promptsubmit`, bubble from the chat too.

## Limits and other notices

When the person can't carry on, like at a usage limit, yield a notice from where the model handles the failed request, and return:

```ts
chat.model = async function* ({ messages, signal }) {
  const response = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ messages }), signal });
  if (response.status === 429) {
    const { resetsAt } = await response.json();
    yield {
      type: "notice",
      heading: "You've reached your usage limit",
      text: "Upgrade, or carry on another way.",
      resetsAt,
      actions: [
        { value: "upgrade", label: "Upgrade plan", href: "/pricing", primary: true },
        { value: "smaller-model", label: "Switch to a smaller model" },
      ],
    };
    return;
  }
  // …stream the reply
};

chat.addEventListener("noticeaction", (event) => {
  if (event.detail.value === "smaller-model") {
    chat.composer.model = "haiku-5.5";
    chat.unlock();
  }
});
```

The reply shows the card, and the message box locks, saying "Sending is paused until 3:00 PM" underneath. It unlocks by itself at the reset time, or when the notice is dismissed. A button press only tells you: call `unlock()` once the way round has worked. `messages` keeps the notice, and a saved chat locks again only while it still applies.

## Quoting

Selecting words anywhere in a message, its cards included, shows a **Quote** button. Words from a card, like a plan's step or a failed command's output, are labelled with it. Pressing it adds them to the box as a card, and several can be added; then people type what they want to ask. The sent message shows the quotes in it, in the order written, between your words, and pressing one scrolls back to the message it came from and marks it for a moment.

Your model gets the quotes on the last message:

```ts
import { quotesToMarkdown } from "@samyakbhuta/ui-components/ai-composer";

chat.model = async function* ({ messages }) {
  const asked = messages.at(-1);
  // The text, with each quote where it was written, as > lines.
  yield* streamFromYourServer(quotesToMarkdown(asked.text, asked.quotes));
};
```

- `chat.composer.quoteStyle = "markdown"` puts quotes into the text as `> ` lines instead, so they arrive in `text`.
- `chat.transcript.quotable = false` turns quoting off.
- Edit on a message brings its quotes back into the box.
- While a question, approval or plan waits, what's typed answers it, and answers have no room for cards: quotes go into the answer's text as `> ` lines, after their label.

## Saving and restoring

`messages` is plain data: save it on `chatchange`, and set it again later.

```ts
chat.addEventListener("chatchange", (event) => localStorage.setItem("chat", JSON.stringify(event.detail.messages)));
chat.messages = JSON.parse(localStorage.getItem("chat") ?? "[]");
```

Each `ChatMessage` is `{ role, text, createdAt }`, plus what the reply held:
- `createdAt`: when it was sent, or when the reply started, as an ISO time. Each message shows it as "5 minutes ago" on hover or focus (see [`<ai-message>`'s Time and model](../ai-message/README.md#time-and-model));
- `model`: on a reply, the label of the model that wrote it;
- `quotes`: on a message of yours, the words it quoted, as `{ text, from, id, source?, at? }`, with `at` saying where in `text` each sits when people wrote between quotes, with `source` naming the card for words from one, like "Plan: Surprise party", where `id` is the quoted message's index in `messages`. The model gets them too, apart from `text`, so you decide how to put them in its prompt;
- `error`, `stopped` and `feedback`;
- `thinking`, `tools` and `sources`;
- a `question` with its `answer`, a set of `questions` with its `answers`, an `approval` with its `decision`, or a `plan` with its `decision`.

Attachments are kept as they were sent. `File` objects don't survive `JSON.stringify`, so store what you need, like each file's name, before saving.

## Setting it up in markup

An `<ai-composer>` or `<ai-transcript>` written inside is used instead of a new one, so you can set it up with attributes. A child with `slot="empty"` shows while the chat is empty, above the starters:

```html
<ai-chat style="height: 80vh">
  <h2 slot="empty">What can I help with?</h2>
  <ai-composer attachments voice history></ai-composer>
</ai-chat>
```

## Translation

| String | Default |
| --- | --- |
| `stopped` | `Stopped` |
| `error` | `Something went wrong. Press Retry to try again.`: for errors with no message |
| `noModel` | `No model is connected. Set the chat's model property.` |
| `starters` | `Suggestions`: the starters' accessible name |
| `followUps` | `Follow-up questions` |
| `answerPlaceholder` | `Answer the question above, or type your answer` |
| `approvalPlaceholder` | `Allow or deny above, or tell it what to do instead` |
| `planPlaceholder` | `Accept or reject the plan above, or say what to change` |
| `approvalSendConfirm(name)` | `Denies ${name}, and tells it what's typed instead`: while an approval waits, what's typed denies it, so an agent pressing Send message asks the person first. `""` lets it |
| `planSendConfirm` | `Asks for changes to the plan, as typed`: the same while a plan waits |
| `locked(resetsAt)` | `Sending is paused until 3:00 PM.`, or `Sending is paused. See the notice above.` without a reset time: under the box while a notice locks it |

The parts the chat makes have words of their own. Give them in `strings` too, under the part's name, and the chat passes them on to every one it shows, including those already on the page:

```ts
chat.strings = {
  stopped: "Arrêté",
  message: { copy: "Copier", copied: "Copié", retry: "Réessayer", edit: "Modifier" },
  thinking: { thinking: "Réflexion…", thoughtFor: (duration) => `Réflexion : ${duration}` },
  toolCall: { running: (name) => `${name} en cours…`, done: (name) => `${name} : terminé` },
  sources: { heading: "Sources" },
  question: { send: "Envoyer", other: "Autre" },
  approval: { allow: "Autoriser une fois", always: "Toujours autoriser", deny: "Refuser" },
  plan: { accept: "Accepter", reject: "Refuser", revise: "Modifier…", acceptWith: (label) => `Accepter en ${label}` },
};
```

| Key | Words for |
| --- | --- |
| `message` | Every message: Copy, Retry, Edit and the rest. See [`<ai-message>`'s Translation](../ai-message/README.md#translation). |
| `thinking` | The thinking line. See [`<ai-thinking>`'s](../ai-thinking/README.md#translation). |
| `toolCall` | Tool calls. See [`<ai-tool-call>`'s](../ai-tool-call/README.md#translation). |
| `sources` | Sources. See [`<ai-sources>`'s](../ai-sources/README.md#translation). |
| `question` | Questions. See [`<ai-question>`'s](../ai-question/README.md#translation). |
| `approval` | Approvals. See [`<ai-approval>`'s](../ai-approval/README.md#translation). |
| `plan` | Plans. See [`<ai-plan>`'s](../ai-plan/README.md#translation). |
| `questions` | Sets of questions: the arrows, Continue and the summary. See [`<ai-questions>`'s](../ai-questions/README.md#translation). |
| `notice` | Notices: the reset line, Dismiss and the tone's word. See [`<ai-notice>`'s](../ai-notice/README.md#translation). |

Leave a key out and that part keeps its own defaults. The composer and the transcript have theirs through `chat.composer.strings` and `chat.transcript.strings`.

## Safety

Replies render with `<ai-message>`'s Markdown renderer, which never parses text as HTML. Tool input and output, questions, choices and approvals are shown as text. A model's output can't add markup or run script.

## Accessibility

- **Screen readers:**
  - The transcript reads each finished reply out once, not every word as it streams in.
  - It also reads out a question, an approval or a plan that's waiting, with "Waiting for your answer", "Waiting for your approval" or "Waiting for your review".
- **Focus:**
  - It stays in the message box while you chat.
  - A question, an approval or a plan doesn't take it. People move to the card, or type their answer.
- Everything inside is a ui-sdk part, so keyboard use, ARIA and ui-sdk's agent bridge work as they do for each component.
- An agent decides nothing on an approval or a plan by itself: each choice asks the person first, and so does Send message while one waits, since what's typed then decides it.

## Styling

The CSS sits in the `ai-chat` cascade layer.
- **Custom properties:** `--ai-chat-gap`, the space between the conversation and the composer (`0.75rem`), and `--ai-chat-muted`.
- **Parts:** `[data-part="starters"]`, `follow-ups` and `stopped`.
- `ai-chat[waiting]` styles a chat that's waiting on the person.

Set its custom properties on `ai-chat` itself, or once on an element around it, like `:root`. Custom properties for the parts inside, like `--ai-composer-accent` or `--ai-message-bubble`, can go on `ai-chat` too, to style just that chat.

Style the parts inside through their own custom properties and parts.

## Tests

`ai-chat.test.ts` covers:
- streaming, a promise, Stop and the signal;
- errors with `chaterror`, and Retry;
- thinking, tools, sources and follow-ups;
- each message's time, and the reply's model, from the composer or a `model` chunk;
- quoting into the box, quotes sent and saved, and going back to the quoted message;
- questions, approvals and plans, pressed and typed;
- Always allow;
- restoring a saved chat and answering its open question;
- no model;
- starters, and setting it up in markup.
