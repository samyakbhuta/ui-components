# `<ai-message>`

One message in a conversation. An assistant message renders Markdown safely and streams in a piece at a time; a user message shows what was typed. Each offers actions: **Copy**, plus **Retry** on replies and **Edit** on your own messages.

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
| `actions` | `copy retry` for assistant, `copy edit` for user | Which actions to offer, separated by spaces. `actions=""` shows none. |

## Properties and methods

| Member | What it does |
| --- | --- |
| `text` | The message's source. Setting it replaces the message. |
| `from`, `format`, `streaming`, `actions` | The same as the attributes. `actions` is an array. |
| `strings` | Words to replace; see below. |
| `icons` | SVG markup for `copy`, `copied`, `retry` and `edit`. |
| `highlighter` | Colours code blocks: `(code, language) => Node[] \| null`. Defaults to the built-in highlighter; `null` shows code plain. |
| `appendText(chunk)` | Adds streamed text to the end. |
| `done()` | Ends streaming. The same as `streaming = false`. |

## Events

| Event | `detail` | When |
| --- | --- | --- |
| `messageaction` | `{ action, text }` | Copy, Retry or Edit was pressed. Copy copies `text` unless you call `preventDefault()`; Retry and Edit are yours to handle. |
| `messagecomplete` | `null` | Streaming ended. It bubbles, so a transcript can listen once for every message. |

```ts
transcript.addEventListener("messageaction", (event) => {
  if (event.detail.action === "retry") askAgain(event.target);
  if (event.detail.action === "edit") composer.value = event.detail.text;
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

## Slots

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

Parts: `[data-part="body"]`, `actions`, `code-block`, `code-header`, `code-language`, `code-copy` and `table`. Buttons show `data-copied` for a moment after copying.

## Accessibility

- Copy, Retry and Edit are named buttons in a group named "Message actions". After a copy, the button's name changes to "Copied" for two seconds, and screen readers hear it.
- While streaming, the message is `aria-busy`. The caret is drawn in CSS, so it isn't read out, and it doesn't blink with Reduce motion turned on.
- AI agents can press Copy, Retry and Edit through ui-sdk's agent bridge, because they're ui-sdk Buttons.

## Files

- `ai-message.ts`: the element.
- `markdown.ts`: the safe Markdown renderer.
- `highlight.ts`: the syntax highlighter.
- `ai-message.css`: its styles.
- `ai-message.test.ts`: tests for the Markdown it covers, attempts to inject HTML and scripts, streaming, actions, slots and agent use.
- `highlight.test.ts`: tests for each language, unfinished code, lossless output and the `highlighter` property.
