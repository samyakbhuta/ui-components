# `<ai-thinking>`

Shows that an AI is working: shimmering "Thinking…" text, an optional timer, and optional reasoning that opens from the summary. When it's done, it stays as a short summary like "Thought for 12s".

It sits in the conversation, where the answer is about to appear. It works on its own, or next to [`<ai-composer>`](../ai-composer/README.md).

Live examples: run `npm run dev` and open [`/experiments/ai-composer.html#thinking`](../../../../experiments/ai-composer.html).

## Quick start

```ts
import "@samyakbhuta/ui-components/ai-thinking"; // registers <ai-thinking> and loads its CSS
```

```html
<ai-thinking timer></ai-thinking>
```

```ts
const thinking = document.querySelector("ai-thinking")!;
thinking.label = "Searching files…"; // change the text as the work moves on
thinking.done(); // "Thought for 4s"
```

## Attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `status` | `thinking` | `thinking` shimmers; `done` stops and shows the summary. |
| `label` | `Thinking…` | The text while thinking, like `Searching files…`. Change it as often as you like. |
| `timer` | off | Counts the seconds while thinking, and ends with "Thought for Ns" in place of "Thought". |
| `duration` | none | Seconds to show in a done summary instead of the time measured, for showing a saved conversation again: `<ai-thinking status="done" timer duration="12">`. A summary shown this way isn't announced. |

## Properties and methods

| Member | What it does |
| --- | --- |
| `status`, `label`, `timer`, `duration` | The same as the attributes. |
| `reasoning` | The model's reasoning, as text. Set it again as more streams in. When there is reasoning, the summary becomes a button that opens it. Text written inside the element is the starting reasoning. |
| `elapsed` | Milliseconds spent thinking so far, or in all once done. |
| `strings` | Words to replace; see below. |
| `done()` | Stops thinking. The same as `status = "done"`. |
| `restart()` | Starts thinking again from zero. |

## Translation

```ts
thinking.strings = {
  thinking: "Réflexion…",
  done: "Réflexion terminée",
  thoughtFor: (duration) => `A réfléchi ${duration}`,
  duration: (seconds) => `${seconds} s`,
  startAnnouncement: "Réflexion en cours",
};
```

| Key | Default |
| --- | --- |
| `thinking` | `Thinking…` |
| `done` | `Thought`: the summary without `timer` |
| `thoughtFor(duration)` | `Thought for ${duration}`: the summary with `timer` |
| `duration(seconds)` | `12s`, or `1m 5s` from a minute |
| `startAnnouncement` | `Thinking`: what screen readers hear when it starts |

## Styling

The CSS sits in the `ai-thinking` cascade layer, so your unlayered rules win over it.

Set its custom properties on `ai-thinking` itself, or once on an element around it, like `ai-chat` or `:root`, and every `<ai-thinking>` inside takes them.

| Custom property | Default | What it changes |
| --- | --- | --- |
| `--ai-thinking-color` | a mix of `CanvasText` and `Canvas` | The text color. It's readable on its own; the sweep only adds a darker or brighter band. |
| `--ai-thinking-highlight` | `CanvasText` | The color of the band that sweeps across. |
| `--ai-thinking-duration` | `2s` | How long one sweep takes. |
| `--ai-thinking-band` | `20%` | How wide the band is. |

Parts: `[data-part="summary"]`, `label`, `time`, `details`, `reasoning`. The label has `data-shimmer` while shimmering, and the element has `data-thinking` or `data-done`.

## Accessibility

- Screen readers hear "Thinking" once at the start, and the summary ("Thought for 4s") once at the end, through a polite live region. Label changes during the work aren't announced, so people don't hear a running commentary.
- Mark the conversation `aria-busy="true"` while the reply comes in, and remove it after.
- The reasoning opens from a native `<details>` summary, which works by keyboard and tells screen readers whether it's open.
- With **Reduce motion** turned on, the moving band becomes a slow color change.
- In Windows high contrast mode, the text is shown plain.
- The timer is hidden from screen readers while it counts, so it isn't read out every second.

## Files

- `ai-thinking.ts`: the element.
- `ai-thinking.css`: its styles.
- `ai-thinking.test.ts`: tests for the shimmer, the timer, reasoning, announcements and translation.
