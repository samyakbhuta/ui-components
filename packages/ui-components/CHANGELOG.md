# Changelog

## Unreleased

- `<ai-questions>` is now built as a ui-sdk primitive, `questions`, exported beside the element and rendered with ui-sdk's `createParts`, and shows its questions in ui-sdk's Carousel, so people can swipe between them too. Breaking changes:
  - `questionsanswer` is now `answerschange`, with `{ value, reason, source }` in `detail`: `value` is the list of answers that `answers` used to carry, and `reason` is `"press"` or `"imperative"`. It doesn't bubble: listen on the element, or with `{ capture: true }` around it.
  - `submit()` is `api.submit()`, and there's `api.goTo()`. New `defaultAnswers`.
  - The set is the carousel's region, named by `label`, rather than a group. The carousel keeps the questions out of view `inert`, in place of `hidden`, and its Previous and Next replace the set's own arrows, under the same names.
  - The `questions` primitive stays out of an AI agent's view: agents use the carousel, its arrows and each question's choices.
  - Screen readers hear "Sent 3 answers" through ui-sdk's shared live region, so the `announcement` part is gone.
- `<ai-question>` is now built as a ui-sdk primitive, `question`, exported beside the element and rendered with ui-sdk's `createParts`. Breaking changes:
  - `questionanswer` and `questionskip` are now one event, `answerchange`, with `{ value, reason, source }` in `detail`: `value` is the answer `{ value, labels, other }`, or `{ skipped: true }`, and `reason` is `"press"`, `"enter-key"`, `"skip-press"` or `"imperative"`. It doesn't bubble: listen on the element, or with `{ capture: true }` around it. `<ai-questions>` catches its questions' answers that way.
  - `submit()`, `skip()` and `reset()` are `api.submit()`, `api.skip()` and `api.reset()`. New `defaultAnswer`.
  - The `question` primitive stays out of an AI agent's view, since its radio or checkbox group already carries the question's name.
  - Screen readers hear the answer through ui-sdk's shared live region, so the `announcement` part is gone.
- `<ai-notice>` is now built as a ui-sdk primitive, `notice`, exported beside the element and rendered with ui-sdk's `createParts`. Breaking changes:
  - Dismiss now closes it through a new `open` state: `noticedismiss` is replaced by `openchange` (`{ value: false, reason: "close-press" }`), and there's `default-open`.
  - `noticeaction` carries `{ value, reason, source }`, and `noticeexpire` `{ value: null, reason: "timeout" }`. Like ui-sdk's events, they don't bubble; `<ai-chat>` passes `noticeaction` on, so listening on the chat works as before.
  - `act()` and `dismiss()` are `api.act()` and `api.dismiss()`. The `expired` property is gone: check the `expired` attribute. `resetsAt` holds what was set, a `Date` or a string; `resetDate()` turns it into a `Date`.
  - New: an action's `confirm` asks the person before an AI agent presses it, like one that spends money.
  - Screen readers hear it through ui-sdk's shared live region, so the `announcement` part is gone.
- `<ai-plan>` is now built as a ui-sdk primitive, `plan`, exported beside the element and rendered with ui-sdk's `createParts`, like `<ai-approval>`. Breaking changes:
  - `plandecision` is now `decisionchange`, with `{ value, reason, source }` in `detail`: `value` is the `{ decision, mode, feedback }` it used to carry. It doesn't bubble: listen on the element, or with `{ capture: true }` around it.
  - Opening and closing the plan fires the new `openchange`, with `"trigger-press"`, `"find-in-page"` or `"imperative"`, and can be cancelled. New `default-open` and `defaultDecision`.
  - `decide()` is `api.decide()`, and there are `api.setOpen()`, `api.startRevising()` and `api.stopRevising()`.
  - Open plan is ui-sdk's Collapsible, so AI agents can open the plan, and a closed plan can be found with the browser's find in page, which opens it.
  - Screen readers hear the decision through ui-sdk's shared live region, so the `announcement` part is gone. The list indent in the plan follows the reading direction.
- `<ai-approval>` and `<ai-plan>` type their events on the element, through `ApprovalElementEventMap` and `PlanElementEventMap`, instead of the global `HTMLElementEventMap`, since both fire `decisionchange` with different details. `element.addEventListener("decisionchange", …)` is typed as before; a listener on an element around them casts the event.
- `<ai-approval>` is now built as a ui-sdk primitive, `approval`, exported beside the element and rendered with ui-sdk's `createParts`. Breaking changes:
  - `approvaldecision` is now `decisionchange`, with `{ value, reason, source }` in `detail`: `value` is the `{ decision, reason }` it used to carry, `reason` says what asked (`"press"`, `"enter-key"` or `"imperative"`), and `source` says how (`"mouse"`, `"keyboard"`, `"agent"` and so on). Like ui-sdk's change events, it doesn't bubble: listen on the element, or with `{ capture: true }` around it.
  - `decide()` is `api.decide()`, and there's a new `api.deny(reason?)` for app code. AI agents see the card as one `approval` component, named by its heading, with its decision, and decide through its buttons, each of which asks the person first.
  - New `defaultDecision`. Screen readers hear the decision through ui-sdk's shared live region, so the `announcement` part is gone. The parts also carry ui-sdk's `data-slot`.
- AI agents no longer decide approvals or plans, or delete chats, on their own. Through ui-sdk's agent bridge, these are refused unless the app's `allow` asks the person and they agree (`data-agent-confirm`):
  - Allow once, Always allow and Deny on an `<ai-approval>`;
  - Accept, each Accept and use, Reject and the Revise box's Send changes on an `<ai-plan>`;
  - Delete forever in `<ai-chat-list>`;
  - in `<ai-chat>`, Send message while an approval or a plan waits, since what's typed then decides it.

  What the person is asked comes from the new `strings.allowConfirm`, `alwaysConfirm`, `denyConfirm`, `acceptConfirm`, `acceptWithConfirm`, `rejectConfirm`, `reviseConfirm`, `deleteConfirm`, and `<ai-chat>`'s `approvalSendConfirm` and `planSendConfirm`. To loosen it later, answer yes in `allow`, or set a sentence to `""`, which takes its mark off.
- Every control is now one the agent bridge can see, so agents can use it by name: Jump to latest and Quote in `<ai-transcript>`, a quote's Remove button and the text boxes between quotes in `<ai-composer>`, the rename field in `<ai-chat-list>`, and an image's thumbnail and the viewer's arrows in `<ai-message>`. They're ui-sdk Buttons, Textareas and Inputs now. A name an agent sets when renaming a chat is saved at once.
- Buttons that shared a name now have their own, so neither people using screen readers nor agents mix them up. `<ai-composer>`'s Send is "Send message", `<ai-question>`'s is "Send answer", `<ai-questions>`' last is "Send answers", and `<ai-plan>`'s Revise box sends with "Send changes". In `<ai-chat-list>`, a chat is named "Open Trip ideas" (its visible text is still the title, from the new `strings.openChat`), so it isn't confused with "Options for Trip ideas", and the dialog's Delete is "Delete forever", unlike the menu's Delete.
- Quoting: select words in a message and press **Quote** to ask about them. `<ai-transcript quotable for="…">` offers the button and fires `messagequote`. On a touch screen it's a "Quote selection" pill at the bottom of the conversation, clear of the phone's own Copy and Translate menu. Words can be quoted from cards too, like a plan or a tool call's result, labelled with the card (`source`). Words written between quotes stay in order: in the box, in the sent message, and in `promptsubmit`, where each quote's `at` says where it sits in `text`; the new `quotesToMarkdown()` puts them together as `> ` lines. `<ai-composer>` gets `addQuote()`, `quotes`, `quoteschange` and `quote-style`: quotes as cards above the text, sent in `promptsubmit`'s new `quotes` (the default), or as `> ` lines in the text with `quote-style="markdown"`. `<ai-message>` shows a message's `quotes` in it, in the order written, and a quote with an `id` is a button that fires `quoteopen`. `<ai-chat>` turns it all on: `ChatMessage.quotes` is sent to the model and saved, and pressing a quote scrolls back to the message it came from.
- `<ai-transcript>`: when you've scrolled up and something below waits on you, like a question, an approval, a plan or a usage limit, Jump to latest says so instead: "Waiting for your answer", in the accent colour with a pulsing dot. Pressing it scrolls to the card and focuses its first choice or button. New: the read-only `waiting`, `strings.jumpWaiting`, `--ai-transcript-waiting`, and the `jump-dot` and `jump-label` parts.
- `<ai-message>`: each message can show when it was sent, and a reply the model that wrote it: "Sonnet 5.5 · 5 minutes ago". Set the new `time` (an ISO time or a `Date`) and `model`. The time keeps up ("just now", "2 minutes ago", "yesterday"), in the page's language, with the full date and time on hover. The line shows when the message is pointed at or has focus, and always on touch screens. New `strings.time` and `strings.fullTime`, the exported `timeAgo`, and the `meta` part.
- `<ai-chat>`: each `ChatMessage` gets `createdAt`, and each reply `model`: the label of the model chosen in the composer, or what a new `{ type: "model", name }` chunk says. `messages` saves both, and the messages show them.
- New `<ai-notice>`: something that stops the chat and needs action, like a usage limit, a lapsed sign-in or a lost connection. It has a heading, a message, a tone (`warning`, `error` or `info`), and a reset time that counts down ("Resets at 3:00 PM · in 2 hours") and then says "You can carry on now.". Its actions are buttons or links, like Upgrade plan or Switch to a smaller model. It fires `noticeaction`, `noticeexpire` and, with `dismissible`, `noticedismiss`.
- `<ai-chat>`: a model can yield `{ type: "notice", … }`, and the message box locks, saying until when, until the notice resets, is dismissed, or the app calls the new `unlock()`. `locked` says whether it is. `messages` keeps the notice, and a saved chat locks again only while it applies. `<ai-transcript>` reads a notice out with its reply, with the new `strings.notice`.
- `<ai-composer>`: code can set `mode`, `model` and `thinking` while the composer is disabled, like switching to a smaller model during a usage limit. They used to be ignored.
- `<ai-composer>`: it's plain when voice input is listening. The mic button turns red, with a pulsing ring (still with reduced motion), and shows a Stop square. The box's border turns red, and the empty box says "Listening… speak now". Words show as they're heard, not only once a phrase is finished. When listening stops because something went wrong, like a blocked microphone, it says why under the box, and fires the new `voiceerror`. Before, the button only turned the accent colour. New: the `listening` attribute; `--ai-composer-recording` and `--ai-composer-recording-text`; and `strings.listeningPlaceholder`, `stopVoice` and `voiceError`. A custom `speechRecognizer` can call the new optional `onInterim` and `onError`.
- `<ai-message>`: an image attachment opens full size. Its thumbnail is a button that opens a viewer over the page, with the image as large as fits and its name. Arrows, and the Left and Right keys, step through the message's other images, with "2 of 3". Escape, Close or a click outside closes it, and focus goes back to the thumbnail. A file that isn't an image opens in a new tab when it has a `url`. Apps can show attachments their own way with the new `attachmentopen` event, and translate the viewer's words through `strings`, including the button names screen readers say.
- New `<ai-questions>`: several questions at once, shown one at a time with "1 of 3" and arrows. Each is an `<ai-question>`. A single choice picked by tap or click moves on by itself, Continue moves on otherwise, and Send on the last sends every answer together, then the card sums them up. It fires `questionsanswer`, and `answers` restores saved ones.
- `<ai-chat>`: a model can yield `{ type: "questions", questions }` and get every answer back at once. Typing in the box answers the question showing. `<ai-transcript>` reads out a waiting set.
- New `<ai-plan>`: an agent proposes a plan before it starts. Open plan shows the plan in place, as Markdown, or links to your app's page with `href`. People Accept it, Reject it, or Revise it by saying what to change, and `accepts` adds "Accept and use …" buttons that accept and switch mode at once. It has the same waiting signs as `<ai-approval>`, fires `plandecision`, and `decision` restores a saved one.
- `<ai-chat>`: a model can yield `{ type: "plan", … }` and wait for the review. Accepting with a mode switches the composer's Mode to it, typing in the box while the plan waits asks for changes, and a saved open plan asks the model again once decided. `<ai-transcript>` reads out a waiting plan, with the new `strings.plan`.
- `<ai-chat>`'s `strings` also takes words for the parts it makes, so a chat can be translated in full: `message` (Copy, Retry, Edit and the rest), `thinking`, `toolCall`, `sources`, `question` and `approval`. Each is passed on as that part's `strings`, including to parts already on the page when `strings` changes. The buttons under each reply used to keep their English names.
- Custom properties can be set on any element around a component, like `ai-chat` or `:root`, to style every one inside at once. Each component used to set its defaults on itself, so only rules on the component itself took effect. Its defaults now sit in private properties, like `--_ai-composer-accent`, which read the public ones first. Rules on the component itself work as before.

## 0.1.0-beta.4 (2026-11-28)

- New `<ai-chat>`: a whole chat in one tag. Give it a `model` that streams a reply, as an async generator or a promise, and it runs the conversation: your messages and the replies, Stop (through an `AbortSignal`), Retry, errors and `chaterror`, starters and follow-ups. A model can also yield thinking, tool calls and their results, and sources. When it yields a question or an approval, the chat waits for the person, and their answer or decision comes back as the value of that `yield`; typing in the box answers too. `messages` saves and restores the conversation as plain data, `chatchange` says when to save, and `alwaysAllowed` keeps the tools chosen with Always allow.
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
