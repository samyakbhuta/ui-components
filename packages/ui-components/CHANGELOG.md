# Changelog

## 0.1.0-beta.2 (2026-11-27)

- New `<ai-sources>`: the numbered list of sources a reply drew on. Inside an `<ai-message>`, the reply's `[1]` markers become links to them, with a preview on hover or keyboard focus. Markers in code and links stay as written, and only `http:` and `https:` addresses become links. `max` shows the first few, with "Show N more".
- New `<ai-suggestions>`: prompts people can send with one press, like starters for an empty chat or follow-up questions. `for` names the `<ai-composer>` they go to, and `action="fill"` puts one in the box to edit first.
- `<ai-message>` links its citations whenever its `<ai-sources>` changes, including while it streams.
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
