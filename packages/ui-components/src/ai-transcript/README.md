# `<ai-transcript>`

The scrolling conversation. It follows a reply as it streams while you're at the bottom, stays where you put it when you scroll up to read, and offers **Jump to latest**. Screen readers hear each finished reply once, not every word as it arrives.

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
- **Empty state.** A child with `slot="empty"` shows, centred, until the first message arrives.
- **Busy.** While any message has `streaming`, the transcript is `aria-busy="true"`.
- **Announcements.** When an assistant message fires `messagecomplete`, its text is read out once through a polite live region. The transcript itself isn't a live region, so streaming text isn't read word by word.

## Attributes, properties and methods

| Member | What it does |
| --- | --- |
| `announce="none"` | Stops reading finished replies out. |
| `aria-label` | Names the conversation. It defaults to `strings.label`. |
| `following` (read-only) | `true` while it follows new content. |
| `strings` | Words to replace: `label` (`Conversation`), `jump` (`Jump to latest`) and `reply(text)`, what's read out for a finished reply. |
| `scrollToLatest({ smooth })` | Scrolls to the newest message and follows again. |

```ts
transcript.strings = {
  label: "Conversation avec l'assistant",
  jump: "Aller au dernier message",
  reply: (text) => `Réponse : ${text}`,
};
```

## Styling

The CSS sits in the `ai-transcript` cascade layer. `--ai-transcript-gap` sets the space between messages (`1.25rem`). Parts: `[data-part="jump-bar"]` (a zero-height sticky bar at the bottom), `jump` (the button) and `announcement` (visually hidden).

## Accessibility

- It's a region named "Conversation", and it can take focus so it scrolls from the keyboard.
- Finished replies are announced once, after `aria-busy` clears.
- Jump to latest is a real button, and it shows only when there's something below.

## Files

- `ai-transcript.ts`: the element.
- `ai-transcript.css`: its styles.
- `ai-transcript.test.ts`: tests for naming, part order, busy state, announcements and following.
