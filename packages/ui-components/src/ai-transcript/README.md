# `<ai-transcript>`

The scrolling conversation. It follows a reply as it streams while you're at the bottom, stays where you put it when you scroll up to read, and offers **Jump to latest**. Screen readers hear each finished reply once, not every word as it arrives. If the reply asks an [`<ai-question>`](../ai-question/README.md) asks for approval with an [`<ai-approval>`](../ai-approval/README.md), or proposes an [`<ai-plan>`](../ai-plan/README.md), they hear that too, and that it's waiting on them. A reply with an [`<ai-notice>`](../ai-notice/README.md), like a usage limit, is read with the notice.

Its children are your messages, usually [`<ai-message>`](../ai-message/README.md) elements.

Live examples: run `npm run dev` and open [`/experiments/ai-composer.html#transcript`](../../../../experiments/ai-composer.html).

## Quick start

```ts
import "@samyakbhuta/ui-components/ai-transcript"; // registers <ai-transcript> and loads its CSS
```

```html
<ai-transcript style="height: 30rem">
  <p slot="empty">What can I help with?</p>
</ai-transcript>
```

```ts
transcript.append(Object.assign(document.createElement("ai-message"), { from: "user", text: "Hi" }));
```

The element is the scroll container, so give it a height, or put it in a grid or flex row that gives it one, as the chat shell does.

## Behavior

- **Following.** While you're at the bottom, growing content keeps the newest line in view. Scroll up and it stops following; scroll back down and it follows again.
- **Your messages.** A new message with `from="user"` always brings the conversation back to the bottom.
- **Jump to latest.** When you've scrolled away from the bottom, a button floats above it. It scrolls smoothly, or instantly with Reduce motion, and keeps focus in the conversation.
- **Waiting for your answer.** When something below waits on you and none of it is in view, the same button says so instead, in the accent colour with a pulsing dot: "Waiting for your answer" for an [`<ai-question>`](../ai-question/README.md) or [`<ai-questions>`](../ai-questions/README.md), "Waiting for your approval" for an [`<ai-approval>`](../ai-approval/README.md), "Waiting for your review" for an [`<ai-plan>`](../ai-plan/README.md), and "Sending is paused" for an [`<ai-notice>`](../ai-notice/README.md) that isn't `info`. While any of the card shows, the card says it waits, so the button doesn't repeat it. Pressing it scrolls the whole message with the card into view, down to its time and buttons (to the bottom, following again, when it's the newest message), and focuses the card, so it can be answered at once: its first choice, or else its first button or link, or else its text box. Once the card is answered, decided or gone, the button is Jump to latest again.
- **Empty state.** A child with `slot="empty"` shows, centred, until the first message arrives.
- **Busy.** While any message has `streaming`, the transcript is `aria-busy="true"`.
- **Announcements.** When an assistant message fires `messagecomplete`, its text is read out once through a polite live region. The transcript itself isn't a live region, so streaming text isn't read word by word.

## Attributes, properties and methods

| Member | What it does |
| --- | --- |
| `announce="none"` | Stops reading finished replies out. |
| `quotable` | Selecting words in a message offers a Quote button over them. See [Quoting](#quoting). `quotable` is also a property. |
| `for` | The id of an [`<ai-composer>`](../ai-composer/README.md): Quote adds the words to it with `addQuote()`. |
| `aria-label` | Names the conversation. It defaults to `strings.label`. |
| `following` (read-only) | `true` while it follows new content. |
| `waiting` (read-only) | The newest card still waiting on the person (a question, an approval, a plan, or a notice that isn't `info`), or `null`. |
| `strings` | Words to replace: `label` (`Conversation`), `jump` (`Jump to latest`), `quote` (`Quote`), `jumpWaiting(kind)`, the button while a card below waits, with `kind` being `answer`, `approval`, `review` or `notice` (`Waiting for your answer`, `Waiting for your approval`, `Waiting for your review`, `Sending is paused`), `reply(text)`, what's read out for a finished reply, `waiting(question)`, read after it for each [`<ai-question>`](../ai-question/README.md) in the reply still waiting for an answer (`${question} Waiting for your answer.`), `approval(label)`, the same for each [`<ai-approval>`](../ai-approval/README.md) still waiting for a decision (`${label} Waiting for your approval.`), `plan(heading)`, the same for each [`<ai-plan>`](../ai-plan/README.md) (`${heading} Waiting for your review.`), `questions(first, count)`, for each [`<ai-questions>`](../ai-questions/README.md) set (`${count} questions, starting with: ${first} Waiting for your answers.`), and `notice(heading, text, resets)`, for each [`<ai-notice>`](../ai-notice/README.md) that still applies (each part, as a sentence). |
| `scrollToLatest({ smooth })` | Scrolls to the newest message and follows again. |

| Event | `detail` | When |
| --- | --- | --- |
| `messagequote` | `{ text, message, from }` | Quote was pressed over words selected in a message. Cancelable: `preventDefault()` stops them going into the composer named by `for`, so you can add them your own way. |

```ts
transcript.strings = {
  label: "Conversation avec l'assistant",
  jump: "Aller au dernier message",
  reply: (text) => `Réponse : ${text}`,
};
```

## Quoting

With `quotable`, selecting words in one message, by mouse, touch or keyboard, shows a **Quote** button just above them (below, when there's no room above). Pressing it fires `messagequote`, adds the words to the composer named by `for`, and clears the selection. Escape hides it. Only words inside one message's text count, not across messages or in its buttons.

```html
<ai-transcript quotable for="box">…</ai-transcript>
<ai-composer id="box"></ai-composer>
```

[`<ai-chat>`](../ai-chat/README.md) turns it on for you, and links each quote back to its message.

## Styling

The CSS sits in the `ai-transcript` cascade layer. `--ai-transcript-gap` sets the space between messages (`1.25rem`), and `--ai-transcript-waiting` the button's colour while something waits (blue, at least 4.5:1 in light and dark). Parts: `[data-part="jump-bar"]` (a zero-height sticky bar at the bottom), `jump` (the button, with `data-waiting` while it points to a waiting card), `jump-dot`, `jump-label`, `quote-button` (the floating Quote button) and `announcement` (visually hidden).

Set its custom properties on `ai-transcript` itself, or once on an element around it, like `ai-chat` or `:root`, and every `<ai-transcript>` inside takes them.

## Accessibility

- It's a region named "Conversation", and it can take focus so it scrolls from the keyboard.
- Finished replies are announced once, after `aria-busy` clears.
- Jump to latest is a real button, and it shows only when there's something below.
- Quote is a real button, after the messages in the tab order, so it can be reached from the keyboard once words are selected. Pressing it keeps the selection it quotes, and Escape hides it.
- While something waits, the button's name says what for, in words, not only by colour and the dot. Pressing it moves focus into the card. The dot keeps still with Reduce motion, and in Windows high contrast mode the button takes system colours.

## Files

- `ai-transcript.ts`: the element.
- `ai-transcript.css`: its styles.
- `ai-transcript.test.ts`: tests for naming, part order, busy state, announcements, following, and the waiting card.
