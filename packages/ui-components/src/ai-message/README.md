# `<ai-message>`

One message in a conversation. An assistant message renders Markdown safely and streams in a piece at a time; a user message shows what was typed. Each offers actions: **Copy**, plus **Retry** on replies and **Edit** on your own messages. A message can also show its attachments (click an image to see it full size), a failed reply's error, **Good response** and **Bad response** buttons, and arrows to step between versions of a reply.

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
| `time` | none | When it was sent, as an ISO time. Shown as "5 minutes ago", kept up to date, with the full date and time on hover. See [Time and model](#time-and-model). |
| `model` | none | The model that wrote it, like `Sonnet 5.5`, shown before the time. Set as text. |

## Properties and methods

| Member | What it does |
| --- | --- |
| `text` | The message's source. Setting it replaces the message. |
| `from`, `format`, `streaming`, `actions`, `error`, `feedback`, `versions`, `version`, `model` | The same as the attributes. `actions` is an array of `copy`, `retry`, `edit` and `feedback`, and also takes the attribute's words as a string; `error` and `feedback` are `null` when unset. |
| `quotes` | Words quoted from earlier in the conversation, shown in the message, each a line or two: `{ text, from?, id?, source?, at? }[]`. `source`, for words from a card like a plan, shows above the words. `at` is how many characters of `text` come before the quote, so it sits where it was written, between the words; without it, before them. Every quote looks alike, wherever it sits. A quote with an `id` is a button that fires `quoteopen`; without one, it's a quote block. Text only. |
| `time` | The same as the attribute, as a `Date`, or `null`. Also takes an ISO string or milliseconds. |
| `attachments` | Files shown above the text: `File` objects, like the ones `<ai-composer>` sends, or `{ name, type?, size?, url? }`. Images show as thumbnails that open full size; other files show their name and size, and open in a new tab when they have a `url`. |
| `strings` | Words to replace; see below. |
| `icons` | SVG markup for `copy`, `copied`, `retry`, `edit`, `good`, `bad`, `error`, `previous`, `next`, `file` and `close`. |
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
| `quoteopen` | `{ quote, index }` | A quote with an `id` was pressed. [`<ai-chat>`](../ai-chat/README.md) scrolls to the quoted message; elsewhere, it's yours to handle. Cancelable. |
| `attachmentopen` | `{ attachment, index, kind }` | An image (`kind: "image"`) or a file link (`kind: "file"`) was clicked, before it opens. `preventDefault()` stops it opening; see [Showing attachments your own way](#showing-attachments-your-own-way). |

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

#### Seeing an image full size

Each image shows as a small thumbnail. Clicking it opens the image as large as fits, over the page, with its name and a Close button. If the message has more than one image, arrows step through them, with "2 of 3" between, and so do the Left and Right arrow keys. Escape, Close or a click on the dark space around the image closes it, and keyboard users land back on the thumbnail of the image they last looked at. The viewer is a ui-sdk Dialog.

#### Opening a file

A file that isn't an image, like a PDF, opens in a new tab when it has a `url` from `http:`, `https:` or `blob:`. A file without one, like a `File` the person just picked, shows only its name and size.

```ts
sent.attachments = [
  { name: "chart.png", type: "image/png", url: "https://example.com/chart.png" }, // opens full size
  { name: "report.pdf", type: "application/pdf", size: 2_400_000, url: "https://example.com/report.pdf" }, // opens in a new tab
];
```

#### Showing attachments your own way

The built-in viewer and the new tab suit most apps. If yours already has an image gallery, or shows PDFs inside the app, you can take over.

Every click on an image or a file link fires `attachmentopen` first, before anything opens. Its `detail` says what was clicked: the `attachment` itself, its `index` in `attachments`, and its `kind`, `"image"` or `"file"`.

- **Call `event.preventDefault()`** and nothing opens. Show the attachment however you like.
- **Don't call it,** and the built-in viewer or new tab opens as usual. Listening without cancelling is handy for counting clicks, say.

```ts
// Use your own lightbox for images.
sent.addEventListener("attachmentopen", (event) => {
  if (event.detail.kind !== "image") return; // files still open in a new tab
  event.preventDefault();
  myLightbox.show(event.detail.attachment);
});

// Show PDFs inside the app instead of in a new tab.
sent.addEventListener("attachmentopen", (event) => {
  const { attachment, kind } = event.detail;
  if (kind === "file" && attachment.type === "application/pdf") {
    event.preventDefault();
    openPdfPanel(attachment);
  }
});
```

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

### Time and model

```html
<ai-message time="2026-11-28T15:04:00Z" model="Sonnet 5.5">Here's the summary.</ai-message>
```

Below the message, a small line says "Sonnet 5.5 · 5 minutes ago". It shows when the message is pointed at, or when something in it has focus, so it stays out of the way. On a touch screen, which can't point, it always shows. To always show it everywhere:

```css
ai-message [data-part="meta"] {
  opacity: 1;
}
```

- **The time keeps up:** "just now", then "2 minutes ago", "1 hour ago", "yesterday", "3 weeks ago", in the page's language. One timer updates every message on the page, every 30 seconds while any is under an hour old, then each minute. A message taken off the page stops, and catches up when it's back.
- **The full date and time** shows on hover, from the `<time>` element's `title`, and its `datetime` holds the exact time.
- **No time and no model:** no line.
- [`<ai-chat>`](../ai-chat/README.md) sets both on every message for you, and saves them.

## Translation

Every word the message shows or says comes from `strings`, so an app in another language can replace them all. Give only the ones you want to change; the rest stay in English.

```ts
message.strings = { copy: "Copier", copied: "Copié", retry: "Réessayer", edit: "Modifier" };
```

Some of these words never show on screen. They're the names screen readers say for buttons and links, like "View chart.png" for an image's thumbnail, or "Previous image" for an arrow. Translate them too, or people using a screen reader hear English in an app that's otherwise in their language.

Inside [`<ai-chat>`](../ai-chat/README.md), which makes the messages for you, put them under `message` in the chat's `strings`:

```ts
chat.strings = { message: { closeViewer: "Fermer", previousImage: "Image précédente", nextImage: "Image suivante" } };
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
| `viewImage(name)` | `View chart.png`: what screen readers say for an image's thumbnail |
| `openFile(name)` | `Open report.pdf in a new tab`: what screen readers say for a file link, also its tooltip |
| `previousImage`, `nextImage` | `Previous image`, `Next image`: the image viewer's arrows, said by screen readers |
| `imagePosition(index, count)` | `2 of 3`: shown between the image viewer's arrows |
| `closeViewer` | `Close`: the image viewer's close button, said by screen readers |
| `quoted` | `Quoted:`: said before each quote, for screen readers |
| `goToQuote` | `Show where this was said`: a quote button's tooltip |
| `time(at, now, lang)` | `5 minutes ago`: how long ago it was sent. The default, `timeAgo`, is exported, and uses `Intl.RelativeTimeFormat` in `lang`, the page's language |
| `fullTime(at, lang)` | `Saturday, November 28, 2026 at 3:04 PM`: the time's tooltip |

## Slots

Put an [`<ai-sources>`](../ai-sources/README.md) in the footer and the reply's `[1]` markers become links to its sources, with a preview on hover or focus.


Children with `slot="header"` go above the text, and `slot="footer"` below it, before the time and model, whether they're there at the start or added later. Put an [`<ai-thinking>`](../ai-thinking/README.md) in the header and other details in the footer:

```html
<ai-message streaming>
  <ai-thinking slot="header" timer></ai-thinking>
  <small slot="footer">Used 3 tools</small>
</ai-message>
```

## Styling

The CSS sits in the `ai-message` cascade layer, so your unlayered rules win over it.

Set its custom properties on `ai-message` itself, or once on an element around it, like `ai-chat` or `:root`, and every `<ai-message>` inside takes them.

| Custom property | Default |
| --- | --- |
| `--ai-message-bubble` | the user bubble's background |
| `--ai-message-muted` | quotes, code labels, action icons, and the time and model |
| `--ai-message-code-background` | code and table headers |
| `--ai-message-border` | code blocks, tables, quotes and rules |
| `--ai-message-max-width` | `85%`: how wide the text gets |
| `--ai-message-error` | the error's border and icon, at least 3:1 in light and dark |
| `--ai-message-thumbnail-size` | `6rem`: the size of image attachments |

Parts: `[data-part="body"]`, `quotes`, `quote` (with `data-from`), `quote-source`, `quote-text`, `attachments`, `attachment` (with `data-kind="image"` or `"file"`), `attachment-open` (an image's button), `file-link`, `file-name`, `file-size`, the viewer's `viewer`, `viewer-backdrop`, `viewer-content`, `viewer-header`, `viewer-title`, `viewer-position`, `viewer-close`, `viewer-stage`, `viewer-image`, `viewer-previous` and `viewer-next`, `error`, `meta` (the line with `model` and `time`), `actions`, `versions`, `version`, `feedback`, `code-block`, `code-header`, `code-language`, `code-copy` and `table`. Buttons show `data-copied` for a moment after copying, and the message has `data-error` while it shows an error.

## Accessibility

- Copy, Retry and Edit are named buttons in a group named "Message actions". After a copy, the button's name changes to "Copied" for two seconds, and screen readers hear it.
- Good response and Bad response are ui-sdk Toggles in a group named "Feedback". Each reports `aria-pressed`, and Left and Right move between them.
- Previous and Next sit in a group named for the version showing, like "Version 2 of 3". At either end the unusable arrow is disabled, and focus moves to the other one.
- An error is announced once when it's set. Its colour isn't the only cue: it has an icon and a border, and the text says what went wrong.
- Attachments are a list named "Attachments". Each image is a button named "View" and its file name, and a file with an address is a link named "Open" and its file name "in a new tab".
- The image viewer is a modal dialog named by the file name. Focus starts on Close and stays inside until it closes, then returns to the thumbnail of the image last shown. The image's alternative text is its file name. "2 of 3" is read out as it changes. The arrows are named "Previous image" and "Next image", are disabled at either end, and move focus to the other one there. In right-to-left text, Left and Right swap, and so do the arrows' icons.
- Thumbnails and the viewer's arrows are ui-sdk Buttons, so AI agents can open an image (`{ ref: "View chart.png", action: "press" }`) and step through them too.
- The time is a `<time>` element, so screen readers read "5 minutes ago" with the message, even while it's faded out. It isn't part of what [`<ai-transcript>`](../ai-transcript/README.md) reads out when a reply finishes. With Reduce motion on, it appears without fading. In Windows high contrast mode it always shows.
- Each quote starts with "Quoted:" for screen readers. One that can take you to where it was said is a button, named "Quoted:" and its words.
- While streaming, the message is `aria-busy`. The caret is drawn in CSS, so it isn't read out, and it doesn't blink with Reduce motion turned on.
- AI agents can press Copy, Retry, Edit, Previous and Next, and set Good response or Bad response with `setPressed`, through ui-sdk's agent bridge.

## Files

- `ai-message.ts`: the element.
- `markdown.ts`: the safe Markdown renderer.
- `highlight.ts`: the syntax highlighter.
- `ai-message.css`: its styles.
- `ai-message.test.ts`: tests for the Markdown it covers, attempts to inject HTML and scripts, streaming, actions, errors, feedback, versions, attachments and the image viewer, the time and model, slots and agent use.
- `highlight.test.ts`: tests for each language, unfinished code, lossless output and the `highlighter` property.
