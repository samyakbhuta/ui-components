# `<ai-suggestions>`

Prompts people can send with one press: starters for an empty chat, or follow-up questions after a reply. Point it at an [`<ai-composer>`](../ai-composer/README.md) with `for`, and pressing a suggestion sends it as if it had been typed, or puts it in the box to edit first.

Live examples: run `npm run dev` and open [`/experiments/ai-composer.html#suggestions`](../../../../experiments/ai-composer.html).

## Quick start

```ts
import "@samyakbhuta/ui-components/ai-suggestions"; // registers <ai-suggestions> and loads its CSS
```

```html
<ai-composer id="prompt"></ai-composer>

<ai-suggestions for="prompt">
  <ul>
    <li>What's a custom element?</li>
    <li>Write a haiku about web components</li>
  </ul>
</ai-suggestions>
```

A list written inside the element, one suggestion per item, is the starting list. Or set `suggestions`:

```ts
followUps.suggestions = [
  "Show me an example",
  { label: "Explain the README", value: "/explain @README.md", description: "Walks through it section by section" },
];
```

## Attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `for` | none | The id of the `<ai-composer>` suggestions go to. Without it, handle `suggestionselect` yourself. |
| `action` | `send` | `send` sends the suggestion. `fill` puts it in the box and focuses it, to edit before sending. |
| `layout` | `chips` | `chips` wraps them side by side. `list` stacks them, which suits follow-up questions. |
| `label` | `Suggestions` | The list's accessible name, like "Follow-up questions". |
| `disabled` | off | Turns every suggestion off. |

Nothing is sent while the composer is `busy` or `disabled`.

## Properties and methods

| Member | What it does |
| --- | --- |
| `suggestions` | Strings, or `{ label, value?, description? }`. `value` is what's sent, when it differs from the label shown. |
| `for`, `action`, `layout`, `disabled` | The same as the attributes. |
| `composer` | The composer named by `for`, or `null`. |
| `strings` | Words to replace: `label`, the default accessible name. |
| `select(suggestion)` | Sends or fills a suggestion, as pressing it does. Returns `false` when nothing happened. |

## Events

| Event | `detail` | When |
| --- | --- | --- |
| `suggestionselect` | `{ value, label }` | A suggestion was pressed. `preventDefault()` stops it reaching the composer. |

## Styling

The CSS sits in the `ai-suggestions` cascade layer, so your unlayered rules win over it.

Set its custom properties on `ai-suggestions` itself, or once on an element around it, like `ai-chat` or `:root`, and every `<ai-suggestions>` inside takes them.

| Custom property | Default | What it changes |
| --- | --- | --- |
| `--ai-suggestions-border` | a mix of `CanvasText` and `Canvas` | Each suggestion's border. |
| `--ai-suggestions-hover` | a mix of `CanvasText` and `Canvas` | The background on hover. |
| `--ai-suggestions-muted` | a mix of `CanvasText` and `Canvas` | Descriptions. |

Parts: `[data-part="list"]`, `item`, `suggestion`, `label` and `description`. The element has `data-empty` when there are no suggestions, and hides itself.

## Accessibility

- Suggestions are ui-sdk Buttons in a list named "Suggestions" (or `label`), so screen readers announce how many there are, and agents can press them by name.
- A description is part of its button's name, so it's read with the suggestion.
- With `action="fill"`, focus moves to the prompt, ready to edit.

## Files

- `ai-suggestions.ts`: the element.
- `ai-suggestions.css`: its styles.
- `ai-suggestions.test.ts`: tests for sending and filling, busy and disabled composers, cancelling, lists written inside, and agent use.
