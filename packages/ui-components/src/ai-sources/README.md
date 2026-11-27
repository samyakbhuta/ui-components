# `<ai-sources>`

The sources a reply drew on, as a numbered list of links. Put it in an [`<ai-message>`](../ai-message/README.md) and the reply's `[1]`, `[2]` markers become citations: small numbered links to each source, which preview it on hover or keyboard focus.

Live examples: run `npm run dev` and open [`/experiments/ai-composer.html#sources`](../../../../experiments/ai-composer.html).

## Quick start

```ts
import "@samyakbhuta/ui-components/ai-message";
import "@samyakbhuta/ui-components/ai-sources"; // registers <ai-sources> and loads its CSS
```

```ts
const reply = document.createElement("ai-message");
reply.text = "Custom elements get lifecycle callbacks [1], defined in the HTML standard [2].";
const sources = document.createElement("ai-sources");
sources.slot = "footer";
sources.sources = [
  { title: "Using custom elements", url: "https://developer.mozilla.org/docs/Web/API/Web_components/Using_custom_elements" },
  { title: "Custom elements", url: "https://html.spec.whatwg.org/multipage/custom-elements.html", site: "WHATWG" },
];
reply.append(sources);
```

Sources can arrive after the text, or while it streams: the message links its citations again whenever `sources` changes.

## Citations

Inside an `<ai-message>` that holds an `<ai-sources>`, each `[n]` with a source becomes a link to it, named for screen readers like "Source 1: Using custom elements". Pressing it opens the source in a new tab, and hovering or focusing it opens a preview with the site, the title and the description.

- `[n]` stays as written inside inline code, code blocks and links, and when there's no source `n`.
- A source whose address isn't `http:` or `https:` shows as plain text, never as a link, in the list and in citations.
- The message's `text`, and Copy, keep the markers as the model wrote them.

Rendering Markdown yourself? `citation(n)` returns the same marker element, to put wherever you like.

## Attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `max` | all | How many sources to show. The rest open from a "Show N more" button. |

## Properties and methods

| Member | What it does |
| --- | --- |
| `sources` | `{ title, url, description?, site? }[]`. `site` defaults to the address's host, like `developer.mozilla.org`. |
| `max` | The same as the attribute, or `null`. |
| `strings` | Words to replace; see below. |
| `cardId` | The id of the shared preview card, which each citation names with `for`. |
| `citation(n)` | A citation marker for source `n`, counting from 1, or `null` when there's no source `n`. |

It fires `sourceschange` (bubbling) when its sources change, which is how a message knows to link its citations again.

## Translation

```ts
sources.strings = {
  heading: "Fuentes",
  showMore: (count) => `Ver ${count} más`,
  showFewer: "Ver menos",
  citationName: (number, title) => `Fuente ${number}: ${title}`,
};
```

| Key | Default |
| --- | --- |
| `heading` | `Sources`: the heading, which also names the list |
| `showMore(count)` | `Show ${count} more` |
| `showFewer` | `Show fewer` |
| `citationName(number, title)` | `Source ${number}: ${title}`: a citation's accessible name |

## Styling

The CSS sits in the `ai-sources` cascade layer, so your unlayered rules win over it. It also styles citations inside `<ai-message>`.

| Custom property | Default | What it changes |
| --- | --- | --- |
| `--ai-sources-muted` | a mix of `CanvasText` and `Canvas` | The heading, the site names and the preview's description. |
| `--ai-sources-border` | a mix of `CanvasText` and `Canvas` | The preview's and the button's borders. |
| `--ai-sources-number-background` | a mix of `CanvasText` and `Canvas` | The numbers in the list and in citations. |

Parts: `[data-part="heading"]`, `list`, `source`, `number`, `title`, `site`, `more`, `card`, `preview`, `preview-site`, `preview-title`, `preview-description`; in a message, `citation-trigger` and `citation`. The element has `data-empty` when there are no sources, and hides itself.

## Accessibility

- The list is an ordered list named by its heading, "Sources". The numbers are hidden from screen readers, since the list already counts.
- Each citation is a link named "Source 1: …", so it makes sense on its own in a list of links.
- The preview is a ui-sdk Hover Card: it opens on hover or keyboard focus after a short delay, Escape closes it, and Tab moves into it. Everything it shows is in the list too, for people on touch screens or screen readers who won't open it.
- "Show N more" reports `aria-expanded`, and opening it moves focus to the first source that appeared.

## Files

- `ai-sources.ts`: the element.
- `ai-sources.css`: its styles, and the citations' styles.
- `ai-sources.test.ts`: tests for the list, unsafe addresses, Show more, citations in a message, sources that arrive later, and translation.
