# Changelog

## Unreleased

- Fix: the `hidden` attribute now hides every component, and the parts inside them. Each component's own `display` used to win over it, so `<ai-message>`'s actions stayed visible while a reply streamed, and `hidden` on `<ai-tool-call>` or `<ai-thinking>` did nothing.

## 0.1.0-beta.1 (2026-11-27)

Built on ui-sdk `0.1.0-beta.18`.

- New `<ai-tool-call>`: one step an agent takes, like searching the web or reading a file. It shows whether the step is running, done or failed, announces the start and the end, and opens to show its input and result as text.
- `<ai-message>`:
  - `attachments` shows files sent with a message: images as thumbnails, other files by name and size. It takes the `File` objects `<ai-composer>` sends.
  - `error` and `fail()` show why a reply failed, keeping the text that arrived.
  - `actions="… feedback"` adds Good response and Bad response toggles, with a `messagefeedback` event.
  - `versions` and `version` add Previous and Next arrows to step between versions of a reply, with a `messageversion` event.
  - The parts are now in this order: header, `attachments`, `body`, `error`, footer, `actions`.

## 0.1.0-beta.0 (2026-11-27)

The first release, built on ui-sdk `0.1.0-beta.17`:

- `<ai-composer>`: the input box of an AI chat, with opt-in attachments, voice, mode, model, thinking level, `/` commands, `@` references, history, saved drafts and long-paste attachments.
- `<ai-message>`: one message, with safe Markdown, syntax colouring, streaming, and Copy, Retry and Edit.
- `<ai-transcript>`: the scrolling conversation, which follows streaming replies and announces finished ones.
- `<ai-thinking>`: the "Thinking…" indicator, with a timer and reasoning.
- `<ai-chat-list>`: the list of saved chats, with Rename, Export and Delete.
