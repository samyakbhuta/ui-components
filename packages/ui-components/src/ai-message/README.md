# `<ai-message>`

One message in a conversation. An assistant message renders Markdown safely and streams in a piece at a time; a user message shows what was typed. Each offers actions: **Copy**, plus **Retry** on replies and **Edit** on your own messages. A message can also show its attachments, a failed reply's error, **Good response** and **Bad response** buttons, and arrows to step between versions of a reply.

Put messages in an [`<ai-transcript>`](../ai-transcript/README.md), which scrolls and announces them, or anywhere else.

Live examples: run `npm run dev` and open [`/experiments/ai-composer.html#messages`](../../../../experiments/ai-composer.html).

## Quick start

```ts
import "@samyakbhuta/ui-components/ai-message"; // registers <ai-message> and loads its CSS
```

```html
<ai-message from="user">What's a custom element?</ai-message>
<ai-message>
  A **custom element** is an HTML tag you define yourself, like `<ai-message>`.
</ai-message>
```

Text written inside the element is its starting source. Indentation shared by every line is removed, so Markdown can sit inside indented HTML.

### Stream a reply

```ts
const reply = document.createElement("ai-message");
reply.streaming = true; // shows a caret and hides the actions
transcript.append(reply);
for await (const chunk of streamFromYourServer()) reply.appendText(chunk);
reply.done(); // renders what's left and fires messagecomplete
```

`appendText()` renders at most once per frame. Blocks that are already finished aren't rebuilt, so people can select and copy earlier paragraphs while the rest streams in.

## Attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `from` | `assistant` | `assistant` or `user`. User messages sit on the right in a bubble. |
| `format` | `markdown` for assistant, `text` for user | `markdown` renders Markdown; `text` keeps the words as typed, with paragraphs and line breaks. |
| `streaming` | off | Text is still coming. A caret shows after it, the actions hide, and the message is `aria-busy`. |
| `actions` | `copy retry` for assistant, `copy edit` for user | Which actions to offer, separated by spaces: `copy`, `retry`, `edit` and `feedback`. `actions=""` shows none. |
| `error` | none | The reply failed. Shows the message given, or "Something went wrong." for `error=""`, below the text. |
| `feedback` | none | `good` or `bad`: which of Good response and Bad response is pressed, when `actions` includes `feedback`. |
| `versions` | `1` | How many versions of this reply there are, after Retry or Edit. From 2, Previous and Next arrows step between them. |
| `version` | the last | Which version is showing, counting from 1. |

## Properties and methods

| Member | What it does |
| --- | --- |
| `text` | The message's source. Setting it replaces the message. |
| `from`, `format`, `streaming`, `actions`, `error`, `feedback`, `versions`, `version` | The same as the attributes. `actions` is an array of `copy`, `retry` and `edit`; `error` and `feedback` are `null` when unset. |
| `attachments` | Files shown above the text: `File` objects, like the ones `<ai-composer>` sends, or `{ name, type?, size?, url? }`. Images show as thumbnails; other files show their name and size. |
| `strings` | Words to replace; see below. |
| `icons` | SVG markup for `copy`, `copied`, `retry`, `edit`, `good`, `bad`, `error`, `previous`, `next` and `file`. |
| `highlighter` | Colours code blocks: `(code, language) => Node[] \| null`. Defaults to the built-in highlighter; `null` shows code plain. |
| `appendText(chunk)` | Adds streamed text to the end. |
| `done()` | Ends streaming. The same as `streaming = false`. |
| `fail(error?)` | Ends streaming and shows the error, keeping the text that arrived. |

## Events

| Event | `detail` | When |
| --- | --- | --- |
| `messageaction` | `{ action, text }` | Copy, Retry or Edit was pressed. Copy copies `text` unless you call `preventDefault()`; Retry and Edit are yours to handle. |
| `messagecomplete` | `null` | Streaming ended. It bubbles, so a transcript can listen once for every message. |
| `messagefeedback` | `{ feedback, text }` | Good response or Bad response was pressed. `feedback` is `"good"`, `"bad"`, or `null` when it was pressed again to clear it. `preventDefault()` keeps the rating as it was. |
| `messageversion` | `{ version, versions }` | Previous or Next was pressed. Set `text` to that version's reply. `preventDefault()` stays on the current one. |

```ts
transcript.addEventListener("messageaction", (event) => {
  if (event.detail.action === "retry") askAgain(event.target);
  if (event.detail.action === "edit") composer.value = event.detail.text;
});
```

### Attachments, errors, feedback and versions

```ts
// Show what was sent with the prompt.
composer.addEventListener("promptsubmit", (event) => {
  const sent = document.createElement("ai-message");
  sent.from = "user";
  sent.text = event.detail.text;
  sent.attachments = event.detail.files;
  transcript.append(sent);
});

// A reply that failed part way keeps what arrived.
reply.fail("The connection dropped. Try again.");

// Ask for ratings, and keep each version after Retry.
reply.setAttribute("actions", "copy retry feedback");
reply.addEventListener("messagefeedback", (event) => saveRating(event.detail.feedback));
reply.versions = answers.length;
reply.addEventListener("messageversion", (event) => (reply.text = answers[event.detail.version - 1]));
```

Image attachments show only from `http:`, `https:`, `blob:` and image `data:` addresses; anything else shows as a file. A `File` gets an object URL that is revoked when `attachments` changes.

## Markdown

The renderer covers what models write: paragraphs and line breaks, headings, **bold**, *italic*, ~~strikethrough~~, `inline code`, fenced code blocks with a language, links and bare URLs, block quotes, nested lists, tables with column alignment, and rules. A code fence that hasn't closed yet, as happens mid-stream, still shows as code.

It's built for untrusted text:

- It never parses the text as HTML. Every element is created one by one and filled with text, so `<img onerror=…>` or `<script>` in a reply shows as words.
- Links keep only `http:`, `https:` and `mailto:` addresses. Anything else, like `javascript:`, shows as plain text. Web links open in a new tab with `rel="noopener noreferrer"`.
- Nesting is capped, so a hostile reply can't nest lists deep enough to hang the page.

Headings start at `<h3>` (`#` becomes `h3`, `##` becomes `h4`), so a reply's headings sit under the page's own.

Code blocks get a **Copy** button named for their language ("Copy ts code"). Wide tables scroll sideways and can be focused, so they scroll from the keyboard too.

`renderMarkdown()` and `renderPlainText()` are exported from `markdown.ts` if you need the renderer on its own.

## Syntax colouring

Code blocks with a language are coloured by a small built-in highlighter (`highlight.ts`). It knows JavaScript and TypeScript (`js`, `ts`, `jsx`, `tsx`), JSON, HTML and XML, CSS, shell (`bash`, `sh`, `zsh`, `console`), Python, SQL, diffs, YAML and TOML. Other languages, and code over 50,000 characters, show plain.

- **Safe:** like the Markdown renderer, it never parses code as HTML. It wraps tokens in `<span data-token="keyword">` and fills them with text. Copy still copies the plain code.
- **Quick enough to stream:** it colours by pattern, not by parsing, so it reruns on every frame while a reply streams in, and an unfinished string or comment simply runs to the end.
- **Readable:** each colour is at least 4.5:1 against the code background in both light and dark, through `light-dark()`. In Windows high contrast mode the system colours take over.

Swap in another highlighter, or turn colouring off:

```ts
message.highlighter = null; // plain code

// Your own: return DOM nodes, or null to show a block plain.
message.highlighter = (code, language) => myHighlighter(code, language);
```

If your highlighter produces an HTML string, sanitize it before turning it into nodes: model output is untrusted.

The colours are custom properties you can change: `--ai-message-syntax-comment`, `-keyword`, `-string`, `-number`, `-function`, `-type`, `-tag`, `-builtin` and `-variable`. Tokens are `comment`, `string`, `keyword`, `builtin`, `number`, `type`, `function`, `property`, `tag`, `attribute`, `variable`, `inserted` and `deleted`, for your own rules like `ai-message [data-token="comment"] { font-style: normal }`.

## Translation

```ts
message.strings = { copy: "Copier", copied: "Copié", retry: "Réessayer", edit: "Modifier" };
```

| Key | Default |
| --- | --- |
| `copy`, `copied`, `copyFailed` | `Copy`, `Copied`, `Couldn't copy` |
| `retry`, `edit` | `Retry`, `Edit` |
| `copyCode` | `Copy`: the visible text on a code block's button |
| `copyCodeName(language)` | `Copy ts code`: that button's accessible name |
| `codeCopied` | `Copied` |
| `actions` | `Message actions`: the name of the group of action buttons |
| `good`, `bad`, `feedback` | `Good response`, `Bad response`, and `Feedback`: the name of their group |
| `error` | `Something went wrong.`: shown for `error=""` |
| `previousVersion`, `nextVersion` | `Previous version`, `Next version` |
| `version(version, versions)` | `2 / 3`: the count between the arrows |
| `versionName(version, versions)` | `Version 2 of 3`: the name of the arrows' group |
| `attachments` | `Attachments`: the name of the list of files |
| `fileSize(bytes)` | `512 B`, `24 KB` or `2.3 MB` |

## Slots

Put an [`<ai-sources>`](../ai-sources/README.md) in the footer and the reply's `[1]` markers become links to its sources, with a preview on hover or focus.


Children with `slot="header"` go above the text, and `slot="footer"` below it, whether they're there at the start or added later. Put an [`<ai-thinking>`](../ai-thinking/README.md) in the header and details like the model in the footer:

```html
<ai-message streaming>
  <ai-thinking slot="header" timer></ai-thinking>
  <small slot="footer">Sonnet 5.5</small>
</ai-message>
```

## Styling

The CSS sits in the `ai-message` cascade layer, so your unlayered rules win over it.

| Custom property | Default |
| --- | --- |
| `--ai-message-bubble` | the user bubble's background |
| `--ai-message-muted` | quotes, code labels and action icons |
| `--ai-message-code-background` | code and table headers |
| `--ai-message-border` | code blocks, tables, quotes and rules |
| `--ai-message-max-width` | `85%`: how wide the text gets |
| `--ai-message-error` | the error's border and icon, at least 3:1 in light and dark |
| `--ai-message-thumbnail-size` | `6rem`: the size of image attachments |

Parts: `[data-part="body"]`, `attachments`, `attachment` (with `data-kind="image"` or `"file"`), `file-name`, `file-size`, `error`, `actions`, `versions`, `version`, `feedback`, `code-block`, `code-header`, `code-language`, `code-copy` and `table`. Buttons show `data-copied` for a moment after copying, and the message has `data-error` while it shows an error.

## Accessibility

- Copy, Retry and Edit are named buttons in a group named "Message actions". After a copy, the button's name changes to "Copied" for two seconds, and screen readers hear it.
- Good response and Bad response are ui-sdk Toggles in a group named "Feedback". Each reports `aria-pressed`, and Left and Right move between them.
- Previous and Next sit in a group named for the version showing, like "Version 2 of 3". At either end the unusable arrow is disabled, and focus moves to the other one.
- An error is announced once when it's set. Its colour isn't the only cue: it has an icon and a border, and the text says what went wrong.
- Attachments are a list named "Attachments". Images use the file name as their alternative text.
- While streaming, the message is `aria-busy`. The caret is drawn in CSS, so it isn't read out, and it doesn't blink with Reduce motion turned on.
- AI agents can press Copy, Retry, Edit, Previous and Next, and set Good response or Bad response with `setPressed`, through ui-sdk's agent bridge.

## Files

- `ai-message.ts`: the element.
- `markdown.ts`: the safe Markdown renderer.
- `highlight.ts`: the syntax highlighter.
- `ai-message.css`: its styles.
- `ai-message.test.ts`: tests for the Markdown it covers, attempts to inject HTML and scripts, streaming, actions, errors, feedback, versions, attachments, slots and agent use.
- `highlight.test.ts`: tests for each language, unfinished code, lossless output and the `highlighter` property.
