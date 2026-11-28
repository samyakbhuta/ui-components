# `<ai-composer>`

The input box of an AI chat. Out of the box it's a prompt and a **Send** button. Attachments, voice input, **Mode**, **Model**, **Thinking**, `/` commands and `@` references are each turned on only when you ask for them.

It's a plain custom element that arranges [ui-sdk](../../../../AGENTS.md) parts (Textarea, Button, Trigger Menu, File Input, Segmented Control, Select and Toggle). Their keyboard, focus and screen reader behavior comes with them, and AI agents can use every control through ui-sdk's agent bridge.

Live examples: run `npm run dev` and open [`/experiments/ai-composer.html`](../../../../experiments/ai-composer.html).

- [Quick start](#quick-start)
- [Turning features on](#turning-features-on)
- [Attributes](#attributes)
- [Properties](#properties)
- [Methods](#methods)
- [Events](#events)
- [Slots](#slots)
- [Styling](#styling)
- [Translation](#translation)
- [Keyboard](#keyboard)
- [Accessibility](#accessibility)
- [AI agents](#ai-agents)
- [Recipes](#recipes)

## Quick start

```ts
import "@samyakbhuta/ui-components/ai-composer"; // registers <ai-composer> and loads its CSS
```

```html
<ai-composer></ai-composer>
```

```ts
const composer = document.querySelector("ai-composer")!;
composer.addEventListener("promptsubmit", (event) => {
  console.log(event.detail.text);
});
```

When the prompt is sent, the box empties, unless a listener calls `event.preventDefault()`.

## Turning features on

Every extra is opt-in. To leave a feature out, don't add its attribute or data.

| Feature | Turn it on with |
| --- | --- |
| Attachments: the Attach button, dropping and pasting files, file chips | the `attachments` attribute |
| Voice input | the `voice` attribute |
| Mode (a segmented control) | the `modes` property |
| Model (a menu) | the `models` property |
| Thinking level (a menu) | the `thinkingLevels` property |
| `/` commands at the start of the prompt | the `commands` property |
| `@` references anywhere in the prompt | the `references` property |

```html
<ai-composer attachments voice default-mode="auto" default-model="sonnet-5.5" default-thinking="medium"></ai-composer>
```

```ts
import { defaultModes, defaultModels, defaultThinkingLevels } from "@samyakbhuta/ui-components/ai-composer";

composer.modes = defaultModes; // Auto, Plan, Accept-edits
composer.models = defaultModels; // Opus 5.5, Sonnet 5.5, Haiku 5.5
composer.thinkingLevels = defaultThinkingLevels; // Off, Low, Medium, High
composer.commands = [{ value: "summarize", label: "summarize" }];
composer.references = ["README.md", "package.json"];
```

Setting a list to `[]` takes its control away again. If the browser can't recognize speech, the voice button shows greyed out, with a tooltip that says why. Use `voice="hide"` to leave it out instead.

### While voice input listens

It's plain that the microphone is on, so nobody wonders whether they're being heard:

- **The mic button turns red, with a pulsing ring, and shows a Stop square.** Pressing it again stops listening. Its tooltip says "Stop voice input". With reduced motion, the ring stays still.
- **The box's border turns red, and the empty box says "Listening… speak now".** "Listening…" also shows under the box, in red, and screen readers hear it.
- **Words show as they're heard.** They come in while someone is still speaking, and settle into the recognised phrase when they pause. Typing while listening is fine: the next words follow what's typed. Words still being heard when listening stops are kept.
- **When listening stops because something went wrong, it says why** under the box, for a few seconds, and screen readers hear it. For example, "Microphone access is blocked. Allow it in your browser's site settings, then try again." or "Didn't hear anything." It also fires `voiceerror`.

The composer has the `listening` attribute meanwhile, for your own styles.

## Attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `attachments` | off | Turns on attachments. |
| `accept` | any file | The files to accept, like an `<input type="file">`'s `accept`: `image/*,.pdf`. |
| `max-files` | no limit | The most files attached at once. |
| `max-size` | no limit | The largest file, in bytes. |
| `voice` | off | Turns on voice input. `voice="hide"` leaves the button out where speech isn't supported, instead of greying it out. |
| `voice-lang` | the nearest `lang`, then the browser's language | The language people speak in, like `fr-FR`. |
| `listening` | set by the element | Present while voice input listens. Style it, don't set it. |
| `default-mode`, `default-model`, `default-thinking` | the first choice that isn't disabled | The choice each control starts on. |
| `label` | `Prompt` | The prompt's accessible name. It also names the group around the composer, which tells two composers apart. |
| `placeholder` | `Ask anything…` | The prompt's placeholder. |
| `hint` | depends on `submit-on` | The line under the box. `hint=""` hides it. |
| `submit-on` | `enter` | `enter`: Enter sends and Shift+Enter adds a line. `mod-enter`: Ctrl+Enter (⌘+Enter on a Mac) sends and Enter adds a line. |
| `rows` | `1` | How many lines tall the prompt starts. It grows as people type, up to `--ai-composer-max-height`. |
| `max-length` | no limit | The most characters the prompt holds. A counter appears from 80% of the limit, and screen readers hear when it's reached. |
| `history` | off | ArrowUp in an empty box (or at its very start) brings back earlier prompts; ArrowDown goes forward, back to what you were typing. Sent prompts are added to `history`. |
| `persist` | off | Saves the draft, the choices and the history in `localStorage` under this name, like `persist="chat"`, so a reload doesn't lose them. Sending clears the saved draft. |
| `quote-style` | `card` | How `addQuote()` adds words quoted from the conversation: `card`, a card above the text, sent in `quotes`; or `markdown`, `> ` lines in the text. See [Quotes](#quotes). |
| `paste-as-file` | off | With `attachments`, a paste of at least this many characters becomes a text file attachment instead of filling the box. Without a number, 2,000. |
| `busy` | off | The AI is responding. Send becomes **Stop**, which fires `promptstop`, and nothing can be sent. People can keep typing. |
| `disabled` | off | Locks every control. |

Every attribute can change at any time, and what people have typed, attached and chosen is kept. The `default-*` attributes pick the starting choice when a control first appears.

## Properties

| Property | Type | What it holds |
| --- | --- | --- |
| `modes`, `models`, `thinkingLevels` | `ComposerOption[]` | The choices for each control. `[]` (the default) leaves the control out. |
| `commands` | `ComposerCommands` | `/` commands, as [Trigger Menu data](../../../../node_modules/@ui-sdk/web/docs/components/trigger-menu.md#triggers-as-data). Commands can ask for `arguments` and send at once with `after: "submit"`. |
| `references` | `ComposerReferences` | `@` references: a list (strings, `{ value, label }` objects or groups), or a search function `(query, { signal }) => items`. |
| `strings` | `Partial<ComposerStrings>` | Words to replace. See [Translation](#translation). |
| `icons` | `Partial<ComposerIcons>` | SVG markup for `attach`, `voice`, `send`, `stop` and `chevron`. |
| `speechRecognizer` | `SpeechRecognizer` | The speech engine. Defaults to the browser's own; see [Recipes](#use-a-cloud-speech-service). |
| `value` | `string` | The prompt's text. Setting it fires `valuechange`. |
| `mode`, `model`, `thinking` | `string \| undefined` | The chosen values, or `undefined` while that control is off. |
| `files` | `File[]` (read-only) | The attached files. Use `addFiles()` and `clear()` to change them. Image attachments show a thumbnail. |
| `history` | `string[]` | Sent prompts, oldest first, up to 100. Set it to seed or clear the history. Setting `true` or `false` turns the `history` attribute on or off instead, which is what frameworks do for `<ai-composer history>`. |
| `attachments`, `busy`, `disabled` | `boolean` | The same as the attributes. |
| `voice` | `boolean \| "hide"` | The same as the attribute. `false` turns it off. |
| `quoteStyle` | `"card" \| "markdown"` | The same as `quote-style`. |
| `quotes` | `ComposerQuote[]` | The quote cards above the text, as `{ text, from?, id? }`. Set it to restore them, or `[]` to clear them. |
| `pasteAsFile` | `boolean \| number` | The same as `paste-as-file`: `true` for the default of 2,000 characters, or a number. `false` turns it off. |

`ComposerOption` is `{ value, label, description?, disabled? }`. A `description` shows under the label in the Model and Thinking menus, and as a tooltip on a mode. A `disabled` option shows but can't be chosen.

Properties and attributes set before the element is on the page, or straight after, are all applied together.

## Methods

| Method | What it does |
| --- | --- |
| `submit()` | Sends what's in the box, like pressing Send. Returns `false` when nothing was sent: the box was empty, the composer was busy or disabled, or a listener cancelled the event. |
| `clear()` | Empties the prompt and removes the attachments and quotes. |
| `focus()` | Moves focus to the prompt. |
| `insert(text)` | Types `text` at the caret, replacing any selection. Use it to add a reference chosen elsewhere in your app. |
| `addFiles(files)` | Attaches files through the same checks as a drop. Returns `false` when attachments are off. |
| `addQuote(quote)` | Quotes words from the conversation into the prompt, as a card or `> ` lines (see `quote-style`), and moves focus to the box. Takes a string or `{ text, from?, id? }`. Returns `false` while disabled, or for empty text. |

## Events

All events bubble from `<ai-composer>`, and the values are in `event.detail`.

| Event | `detail` | When |
| --- | --- | --- |
| `promptsubmit` | `PromptSubmitDetail` | Send, Enter or `submit()`. Cancelable: `preventDefault()` keeps the prompt in the box. |
| `promptstop` | `null` | Stop was pressed while `busy`. |
| `valuechange` | `{ value }` | The prompt's text changed. |
| `modechange`, `modelchange`, `thinkingchange` | `{ value }` | A choice changed. |
| `fileschange` | `{ value: File[] }` | Files were attached or removed. |
| `filereject` | `{ value: { file, reasons }[] }` | Files broke `accept`, `max-size` or `max-files`. The composer also says why, under the box. |
| `voicestart`, `voiceend` | `null` | Voice input started or stopped listening. |
| `quoteschange` | `{ value: ComposerQuote[] }` | A quote card was added or removed, or the cards were cleared. |
| `voiceerror` | `{ error }` | Voice input stopped because something went wrong, just before `voiceend`. `error` is the speech engine's code, like `"not-allowed"` (the microphone is blocked), `"no-speech"`, `"audio-capture"` (no microphone) or `"network"`. The composer already says why under the box. |

```ts
type PromptSubmitDetail = {
  text: string; // trimmed
  mode?: string; // undefined while Mode is off
  model?: string;
  thinking?: string;
  files: File[];
  command?: string; // the /command at the start, when it's one of `commands`
  references: { value: string; label: string }[]; // the @references still in the text
  quotes?: { text: string; from?: "user" | "assistant"; id?: string }[]; // the quote cards; always set, [] when none
};
```

## Quotes

People can quote words from the conversation and ask about them. [`<ai-transcript quotable>`](../ai-transcript/README.md) offers a Quote button over words selected in a message, and calls `addQuote()` on the composer named by its `for`. You can also call it yourself:

```ts
composer.addQuote({ text: "Custom elements are your own HTML tags.", from: "assistant" });
```

- **`quote-style="card"`** (the default): each quote is a card above the text, a few lines long, with × to remove it. Several can be added. They're sent in `promptsubmit`'s `quotes`, apart from the text, so your app decides how the model sees them, and a quote alone can be sent.
- **`quote-style="markdown"`**: the quote goes into the text at the caret as `> ` lines, on a line of its own, and is sent as part of `text`. People can edit it like any other text.

Either way, focus moves to the box, ready to ask, and screen readers hear "Quote added".

## Slots

Children with a `slot` attribute move into place, whether they're there at the start or added later:

| `slot` | Where it goes |
| --- | --- |
| `start` | The left of the bar, after Attach and Mode. |
| `end` | The right of the bar, before Voice and Send. Send always comes last. |
| `footer` | Under the box, replacing the hint. |

```html
<ai-composer>
  <ui-toggle slot="start"><button type="button" data-button="ghost">Web search</button></ui-toggle>
  <small slot="footer">AI can make mistakes. Check important info.</small>
</ai-composer>
```

`data-button="ghost"` or `data-button="icon"` gives your buttons the composer's button styles. Children without a `slot` are replaced when the composer renders.

## Styling

The CSS is imported with the component and sits in the `ai-composer` cascade layer, so any unlayered rule on your page wins over it. It uses system colors, so it follows light and dark mode.

Set its custom properties on `ai-composer` itself, or once on an element around it, like `ai-chat` or `:root`, and every `<ai-composer>` inside takes them.

| Custom property | Default |
| --- | --- |
| `--ai-composer-background` | `Field` |
| `--ai-composer-color` | `FieldText` |
| `--ai-composer-border` | `1px solid` a mix of the two |
| `--ai-composer-radius` | `1.25rem` |
| `--ai-composer-accent` | `FieldText`: Send's background |
| `--ai-composer-accent-text` | `Field` |
| `--ai-composer-font` | `inherit` |
| `--ai-composer-max-height` | `12rem`: how tall the prompt grows before it scrolls |
| `--ai-composer-recording` | red, `#c62828` in light and `#ff7a70` in dark: the mic button, the box's border and "Listening…" while voice input listens |
| `--ai-composer-recording-text` | the Stop icon on it, at 4.5:1 or more |

```css
.branded {
  --ai-composer-accent: #6d28d9;
  --ai-composer-accent-text: white;
  --ai-composer-radius: 0.5rem;
}
```

For anything else, target the parts by `data-part`: `card`, `attachments`, `attachment`, `quotes`, `quote`, `quote-text`, `quote-remove`, `prompt` (the `ui-textarea`), `bar`, `start`, `end`, `attach`, `mode`, `model`, `thinking`, `voice`, `send`, `send-button`, `popup`, `option-description`, `footer`, `status` and `hint`. ui-sdk's own `data-slot` and state attributes, like `[data-checked]` and `[data-highlighted]`, work too. The send button gets `data-busy` while it's Stop, and the card gets `data-dragging` while files are dragged over it.

The composer is a size container: below `34rem` wide it hides the hint and the "Model" prefix. It lays out right to left under `dir="rtl"`.

## Translation

`strings` replaces any built-in word. Keys you leave out keep their English default.

```ts
composer.strings = {
  send: "Envoyer",
  stop: "Arrêter",
  attach: "Joindre des fichiers",
  voice: "Dictée",
  listening: "Écoute…",
  enterHint: "Entrée pour envoyer · Maj+Entrée pour un saut de ligne",
  fileRejected: (file, reason) => `${file.name} n'a pas été joint.`,
};
```

| Key | Default |
| --- | --- |
| `prompt` | `Prompt`. The `label` attribute wins over it. |
| `placeholder` | `Ask anything…`. The `placeholder` attribute wins over it. |
| `send`, `stop` | `Send`, `Stop` |
| `sendDisabled` | `Type a prompt or attach a file to send`: Send's tooltip while there's nothing to send |
| `attach`, `attachments` | `Attach files`, `Attachments` |
| `mode`, `model`, `thinking` | `Mode`, `Model`, `Thinking` |
| `voice`, `voiceUnsupported`, `listening` | `Voice input`, `Voice input isn't supported in this browser`, `Listening…` |
| `listeningPlaceholder` | `Listening… speak now`: the empty box while listening |
| `stopVoice` | `Stop voice input`: the mic button's tooltip while listening |
| `voiceError(error)` | what's shown when listening stops because something went wrong, by `error` code: `Microphone access is blocked. Allow it in your browser's site settings, then try again.`, `Didn't hear anything. Try again, a little closer to the microphone.`, `No microphone was found.`, `Voice input needs an internet connection.`, or `Voice input stopped.` for anything else |
| `noMatches` | `No matches`: shown when `/` or `@` finds nothing |
| `enterHint` | `Enter to send · Shift+Enter for a new line` |
| `modEnterHint(modifier)` | `${modifier}+Enter to send · Enter for a new line` |
| `fileRejected(file, reason, limits)` | `notes.exe wasn't attached: that type of file isn't accepted.` `reason` is `file-type`, `file-too-large` or `too-many-files`. |
| `pastedAsFile`, `pastedFileName` | `Long paste added as an attachment`, `Pasted text.txt` |
| `counter(length, max)` | `3,500 / 4,000` |
| `limitReached` | `Character limit reached` |
| `quotes` | `Quoted`: the name of the list of quote cards |
| `removeQuote(text)` | `Remove quote: …`: a quote card's × button |
| `quoteAdded` | `Quote added`: announced when a quote is added |

The labels of the modes, models and thinking levels come from your own lists.

## Keyboard

| Keys | In | What happens |
| --- | --- | --- |
| Enter | the prompt | Sends. With `submit-on="mod-enter"`, adds a line. |
| Shift+Enter | the prompt | Adds a line. |
| Ctrl+Enter or ⌘+Enter | the prompt | Sends, with `submit-on="mod-enter"`. |
| `/` at the start, `@` anywhere | the prompt | Opens the suggestions. |
| ↑ ↓, Enter or Tab, Esc | the suggestions | Move, choose (without sending), close. |
| ← → | Mode | Switch modes. |
| Tab | anywhere | Prompt, Attach, Mode, your `start` buttons, Model, Thinking, your `end` buttons, Voice, Send. |

Input methods for Chinese, Japanese and Korean are left alone: Enter that confirms a composition doesn't send.

## Accessibility

- The composer is a `group` named by `label`, and the prompt has the same name.
- Every button has a name from `strings`; the icons are hidden from screen readers.
- Send stays in the tab order while there's nothing to send, marked `aria-disabled`, with a tooltip that says why.
- Voice status ("Listening…", or why listening stopped) and rejected files are announced through a polite live region. While listening, the mic button is still named "Voice input" and reports `aria-pressed="true"`, so screen readers hear "Voice input, pressed"; pressing it again stops. The suggestions announce how many results there are.
- Quote cards are a list named "Quoted". Each × is named "Remove quote:" and the start of the quote; removing one moves focus back to the box. "Quote added" is announced.
- Mode is a radio group; Model and Thinking are select menus. All of them work by keyboard.
- When Stop or Send is pressed, focus goes back to the prompt.
- The page can mark its conversation `aria-busy` while the AI responds; see [Recipes](#stream-a-reply-with-stop).

## AI agents

ui-sdk's agent bridge (`createAgent` from `@ui-sdk/web/agent`) sees the prompt, Send, Attach files, Mode, Model and Thinking by name. Agents can set values (`setValue`) and press buttons (`press`). Voice input and the suggestion list are hidden from agents (`data-agent-hidden`): agents type `/command` and `@reference` straight into the prompt.

With two composers on a page, controls with the same name report the composer's `label` as their `section`, like `"Reply"`. Use their `ref` from the snapshot to act on the right one.

## Recipes

### Stream a reply with Stop

```ts
composer.addEventListener("promptsubmit", async (event) => {
  const controller = new AbortController();
  const stop = () => controller.abort();
  composer.addEventListener("promptstop", stop, { once: true });

  const thinking = document.createElement("ai-thinking"); // see ../ai-thinking/README.md
  thinking.timer = true;
  transcript.append(thinking);
  transcript.setAttribute("aria-busy", "true");
  composer.busy = true;
  try {
    for await (const chunk of streamFromYourServer(event.detail, controller.signal)) {
      thinking.done(); // the first chunk ends the thinking
      // …append chunk to the reply
    }
  } catch {
    thinking.remove(); // stopped
  } finally {
    composer.removeEventListener("promptstop", stop);
    transcript.removeAttribute("aria-busy");
    composer.busy = false;
  }
});
```

### Keep the prompt until the server accepts it

```ts
composer.addEventListener("promptsubmit", (event) => {
  event.preventDefault(); // keep the text and files
  composer.busy = true;
  send(event.detail)
    .then(() => composer.clear())
    .finally(() => (composer.busy = false));
});
```

### Search references as people type

```ts
composer.references = async (query, { signal }) => {
  const response = await fetch(`/api/files?q=${encodeURIComponent(query)}`, { signal });
  return response.json(); // ["README.md", …] or [{ value: "file-7", label: "README.md" }]
};
```

The search runs once typing pauses, and a newer query cancels the older one. The chosen references come back in `promptsubmit` with their `value`.

### Commands with arguments

```ts
composer.commands = [
  {
    value: "translate",
    label: "translate",
    arguments: [{ name: "language", hint: "<language>", required: true, items: ["French", "Hindi"] }],
  },
  { value: "clear", label: "clear", after: "submit" }, // sends as soon as it's chosen
];
```

### Use a cloud speech service

```ts
composer.speechRecognizer = {
  supported: true,
  start({ lang, onText, onInterim, onError, onEnd }) {
    const session = startMyTranscription({
      lang,
      onPartial: onInterim, // optional: the words so far, as they change
      onPhrase: onText,
      onFailure: (code) => onError?.(code), // optional
      onClose: onEnd,
    });
    return { stop: () => session.close() };
  },
};
```

Call `onText` with each finished phrase, and `onEnd` once listening stops for any reason. Two are optional:
- `onInterim` shows the words of the phrase being spoken as they change, and `""` clears them;
- `onError`, called before `onEnd`, says why listening stopped. Web Speech API codes, like `"not-allowed"`, get their own messages through `strings.voiceError`; any other code gets "Voice input stopped." unless you translate it.

### Remember drafts and earlier prompts

```html
<ai-composer history persist="support-chat" attachments paste-as-file max-length="8000"></ai-composer>
```

Each composer with its own `persist` name keeps its own draft. When `accept` is set, make sure it allows `.txt` files if you use `paste-as-file`.

### Your own model list

```ts
composer.models = [
  { value: "opus-5.5", label: "Opus 5.5", description: "Most capable" },
  { value: "haiku-5.5", label: "Haiku 5.5", description: "Fastest" },
  { value: "legacy", label: "Legacy", description: "Retired", disabled: true },
];
composer.addEventListener("modelchange", (event) => localStorage.setItem("model", event.detail.value));
composer.model = localStorage.getItem("model") ?? "haiku-5.5";
```

## Files

- `ai-composer.ts`: the element, its types, and the default lists, strings and icons.
- `ai-composer.css`: its styles.
- `ai-composer.test.ts`: tests for every attribute, property, method, event and slot, the extras (history, drafts, long pastes, thumbnails, the counter), plus agent use.
