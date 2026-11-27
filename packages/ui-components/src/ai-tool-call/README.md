# `<ai-tool-call>`

One step an AI agent takes, like searching the web, reading a file or running code. While it runs, a spinner and shimmering text show what it's doing. Once it's done or has failed, it stays as a one-line summary like "Read src/main.ts", which opens to show what the tool was given and what came back.

Put tool calls in an [`<ai-message>`](../ai-message/README.md)'s header, next to [`<ai-thinking>`](../ai-thinking/README.md), so the steps sit above the answer they led to.

Live examples: run `npm run dev` and open [`/experiments/ai-composer.html#tools`](../../../../experiments/ai-composer.html).

## Quick start

```ts
import "@samyakbhuta/ui-components/ai-tool-call"; // registers <ai-tool-call> and loads its CSS
```

```ts
const call = document.createElement("ai-tool-call");
call.slot = "header";
call.name = "search_web";
call.label = "Searching the web…";
call.input = { query: "web components" };
reply.append(call);

const results = await searchTheWeb("web components");
call.summary = `Found ${results.length} pages`;
call.done(results); // or call.fail("The search timed out.")
```

A finished call, for showing a saved conversation again, needs no script. Text written inside it is its result:

```html
<ai-message>
  <ai-tool-call slot="header" name="read_file" status="done" summary="Read src/main.ts">42 lines</ai-tool-call>
  The file sets up the router and mounts the app.
</ai-message>
```

## Attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `name` | none | The tool's name, like `search_web`. Used in the default summaries: "Running search_web…", "Ran search_web", "search_web failed". |
| `label` | `Running <name>…` | The text while it runs, like "Searching the web…". |
| `summary` | `Ran <name>` | The text once it's done, like "Found 4 pages". |
| `status` | `running` | `running`, `done` or `error`. |

## Properties and methods

| Member | What it does |
| --- | --- |
| `name`, `label`, `summary`, `status` | The same as the attributes. |
| `input` | What the tool was called with. Strings show as they are; anything else shows as indented JSON. |
| `output` | What the tool returned, shown the same way once it's done. Text written inside the element is the starting output. |
| `error` | Why it failed, shown in place of the output when `status` is `error`. |
| `strings` | Words to replace; see below. |
| `done(output?)` | Marks it done, with what it returned. |
| `fail(error?)` | Marks it failed, with why. |

Input, output and errors are always shown as text, never as HTML, so a tool result can't run script on the page.

## Translation

```ts
call.strings = {
  running: (name) => `${name} en cours…`,
  done: (name) => `${name} terminé`,
  failed: (name) => `${name} a échoué`,
  input: "Entrée",
  output: "Résultat",
  error: "Erreur",
};
```

| Key | Default |
| --- | --- |
| `running(name)` | `Running ${name}…` |
| `done(name)` | `Ran ${name}` |
| `failed(name)` | `${name} failed` |
| `input`, `output`, `error` | `Input`, `Result`, `Error`: the headings in the panel, and the names of their boxes |

## Styling

The CSS sits in the `ai-tool-call` cascade layer, so your unlayered rules win over it.

| Custom property | Default | What it changes |
| --- | --- | --- |
| `--ai-tool-call-color` | a mix of `CanvasText` and `Canvas` | The summary's text colour. |
| `--ai-tool-call-highlight` | `CanvasText` | The shimmer's band and the spinner. |
| `--ai-tool-call-done` | green, 3:1 or more in light and dark | The tick once it's done. |
| `--ai-tool-call-error` | red, 3:1 or more in light and dark | The cross and the error box's border. |
| `--ai-tool-call-border` | a mix of `CanvasText` and `Canvas` | The boxes' borders. |
| `--ai-tool-call-background` | a mix of `CanvasText` and `Canvas` | The boxes' background. |
| `--ai-tool-call-max-height` | `16rem` | How tall a box gets before it scrolls. |

Parts: `[data-part="summary"]`, `icon`, `label`, `details`, `panel`, `section-label`, and the boxes `input`, `output` and `error`. The label has `data-shimmer` while it runs, and the element has `data-running`, `data-done` or `data-error`.

## Accessibility

- Screen readers hear what it's doing once when it starts, and the summary once when it ends, through a polite live region. A call shown done from the start isn't announced.
- While it runs, the element is `aria-busy`.
- Once there's something to show, the summary is a native `<details>` summary, so it opens from the keyboard and tells screen readers whether it's open. It stays open, and keeps focus, as the call updates.
- Each box is named ("Input", "Result" or "Error") and can be focused, so a long result scrolls from the keyboard.
- Done and failed aren't shown by colour alone: there's a tick or a cross, and the summary says so.
- With **Reduce motion** turned on, the spinner stops and the text doesn't sweep. In Windows high contrast mode, the text and icons use system colours.

## Files

- `ai-tool-call.ts`: the element.
- `ai-tool-call.css`: its styles.
- `ai-tool-call.test.ts`: tests for each status, announcements, the input and output panel, focus, unsafe text and translation.
