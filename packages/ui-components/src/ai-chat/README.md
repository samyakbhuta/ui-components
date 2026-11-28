# `<ai-chat>`

A whole chat in one tag. Give it a `model`, a function that streams a reply, and it runs the conversation:
- your messages, and the replies streaming in;
- **Stop**, **Retry**, and errors;
- thinking, tool calls, cited sources and follow-up questions;
- questions and approvals that wait for the person.

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
| `{ type: "question", question, options, multiple?, other?, max?, skippable? }` | An [`<ai-question>`](../ai-question/README.md). The model waits, and the answer comes back as the value of the `yield`. |
| `{ type: "approval", name, label?, description?, input?, always?, reason? }` | An [`<ai-approval>`](../ai-approval/README.md). The model waits, and the decision comes back as the value of the `yield`. |

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
- **After a reload:** a saved question or approval that wasn't answered asks the model again once it's answered. The answer is in the last message, as `question.answer` or `approval.decision`.

## Attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `actions` | `copy retry` | The actions each reply offers, from `copy`, `retry`, `edit` and `feedback`, separated by spaces. Only the newest turn offers Retry. |
| `waiting` | set by the element | Present while a question or an approval waits for the person. Style it, don't set it. |

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
| `waiting` | `boolean` (read-only) | `true` while a question or an approval waits. |
| `composer`, `transcript` | (read-only) | The [`<ai-composer>`](../ai-composer/README.md) and [`<ai-transcript>`](../ai-transcript/README.md) inside, to set up. For example, `chat.composer.models = defaultModels`. |

## Methods

| Method | What it does |
| --- | --- |
| `send(text)` | Sends a prompt, as typing it and pressing Send does. Returns `false` when nothing was sent. |
| `stop()` | Stops the reply coming in, as Stop does. |
| `retry()` | Asks again for the newest turn, as Retry does. Returns `false` when there's nothing to retry. |
| `clear()` | Empties the conversation. |

## Events

| Event | `detail` | When |
| --- | --- | --- |
| `chatchange` | `{ messages }` | The conversation changed and is worth saving: a reply finished or stopped, a question was asked or answered, or a reply was rated. |
| `chaterror` | `{ error }` | The model threw, or its request failed. The reply shows the error's message, with Retry. Stop doesn't fire it. |

The composer's own events, like `promptsubmit`, bubble from the chat too.

## Saving and restoring

`messages` is plain data: save it on `chatchange`, and set it again later.

```ts
chat.addEventListener("chatchange", (event) => localStorage.setItem("chat", JSON.stringify(event.detail.messages)));
chat.messages = JSON.parse(localStorage.getItem("chat") ?? "[]");
```

Each `ChatMessage` is `{ role, text }`, plus what the reply held:
- `error`, `stopped` and `feedback`;
- `thinking`, `tools` and `sources`;
- a `question` with its `answer`, or an `approval` with its `decision`.

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

The parts have their own `strings`, through `chat.composer`, `chat.transcript`, and the messages.

## Safety

Replies render with `<ai-message>`'s Markdown renderer, which never parses text as HTML. Tool input and output, questions, choices and approvals are shown as text. A model's output can't add markup or run script.

## Accessibility

- **Screen readers:**
  - The transcript reads each finished reply out once, not every word as it streams in.
  - It also reads out a question or an approval that's waiting, with "Waiting for your answer" or "Waiting for your approval".
- **Focus:**
  - It stays in the message box while you chat.
  - A question or an approval doesn't take it. People move to the card, or type their answer.
- Everything inside is a ui-sdk part, so keyboard use, ARIA and ui-sdk's agent bridge work as they do for each component.

## Styling

The CSS sits in the `ai-chat` cascade layer.
- **Custom properties:** `--ai-chat-gap`, the space between the conversation and the composer (`0.75rem`), and `--ai-chat-muted`.
- **Parts:** `[data-part="starters"]`, `follow-ups` and `stopped`.
- `ai-chat[waiting]` styles a chat that's waiting on the person.

Style the parts inside through their own custom properties and parts.

## Tests

`ai-chat.test.ts` covers:
- streaming, a promise, Stop and the signal;
- errors with `chaterror`, and Retry;
- thinking, tools, sources and follow-ups;
- questions and approvals, pressed and typed;
- Always allow;
- restoring a saved chat and answering its open question;
- no model;
- starters, and setting it up in markup.
