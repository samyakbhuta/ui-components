# Changelog

## Unreleased

- Editor support. VS Code can complete each tag, its attributes and their values, and show their docs on hover, with one setting: `"html.customData": ["./node_modules/@samyakbhuta/ui-components/dist/vscode.html-custom-data.json"]`. JetBrains IDEs read the new `web-types` file on their own, which also lists each element's events. Both are generated from the code, the types and the READMEs at build time.
- `<ai-transcript>` lists `announce` in `observedAttributes`, so editors and frameworks know about it, and `announce="none"` is typed.
- New `<ai-question>`: a question the model asks, with choices to pick from. Radio buttons offer one choice, and `multiple` gives checkboxes, with `max` to cap how many. `other` adds a last choice with a text box for an answer of one's own, and `skippable` adds Skip. Once answered, it shows the answer and keeps the choices readable. `answer` restores a saved one. It fires `questionanswer` and `questionskip`.
- `<ai-question>` shows that the agent is waiting on an answer. Until it's answered, it has a "Waiting for your answer" line, with a pulsing dot that stays still with reduced motion, and an accent border. The line also describes the choices for screen readers.
- `<ai-transcript>` reads out any `<ai-question>` still waiting in a finished reply, after the reply's text: "Which city? Waiting for your answer." The wording is in the new `strings.waiting`.
- New `<ai-approval>`: an agent asks permission before it acts, like running a command. It offers Allow once and Deny, and Always allow with `always`. With `reason`, a text box says what to do instead, sent with Deny. What the tool would get is shown as text. It has the same waiting signs as `<ai-question>`, then shows the decision in words and colour. It fires `approvaldecision`, and `decision` restores a saved one.
- `<ai-transcript>` reads out an `<ai-approval>` still waiting in a finished reply, too: "Run a command Waiting for your approval." The wording is in the new `strings.approval`.
- `<ai-chat-list>`: a chat can have a `status`, like "Needs your answer", shown under its title. Screen readers hear it after the chat's name.

## 0.1.0-beta.3 (2026-11-27)

- Types for React, Vue and Svelte. Add `import type {} from "@samyakbhuta/ui-components/react"` (or `/vue`, `/svelte`) once, and every tag is typed in JSX or templates: its props, the values they take, and its events with their `detail`. The map underneath, `CustomElements`, is exported from `@samyakbhuta/ui-components/elements` for other frameworks.
- `<ai-composer>` has `attachments`, `voice` and `pasteAsFile` properties, the same as the attributes. Frameworks set a property when there is one, so `attachments={false}` now turns attachments off in Vue and Svelte instead of on.
- `<ai-composer>`'s `history` takes `true` or `false` to turn the attribute on or off. `<ai-composer history>` used to throw in React and Svelte, which pass `true` to the property.
- `actions` on `<ai-message>` and `<ai-chat-list>` also takes the attribute's words as a string, as frameworks pass `actions="copy retry"`. It used to throw.
- `<ai-message>`'s `actions` property now includes `"feedback"` when it's on. It used to leave it out, though the attribute had it.

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
