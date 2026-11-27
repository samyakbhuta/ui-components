# @samyakbhuta/ui-components

Web Components for AI chat apps, built on [ui-sdk](https://www.npmjs.com/package/@ui-sdk/web). They work in plain HTML and in React, Vue, Svelte and Angular.

| Element | What it is |
| --- | --- |
| `<ai-composer>` | The input box: a prompt and Send, plus opt-in attachments, voice, mode, model, thinking level, `/` commands, `@` references, history and saved drafts. |
| `<ai-message>` | One message. Renders Markdown safely, colours code, streams text in, and offers Copy, Retry and Edit. It can also show attachments, an error, Good and Bad response buttons, and versions of a reply. |
| `<ai-transcript>` | The scrolling conversation. Follows a streaming reply, offers Jump to latest, and tells screen readers about each finished reply. |
| `<ai-thinking>` | The "Thinking…" indicator, with an optional timer and reasoning. |
| `<ai-tool-call>` | One step an agent takes, like a web search: running, done or failed, and opens to show its input and result. |
| `<ai-sources>` | The sources a reply drew on. Turns a message's `[1]` markers into links, with a preview on hover. |
| `<ai-suggestions>` | Prompts to send with one press: starters for an empty chat, or follow-up questions. |
| `<ai-chat-list>` | The list of saved chats for a sidebar, with Rename, Export and Delete. |

## Install

The package expects ui-sdk beside it, so every component shares one copy. Install the `beta` tag, which always points at the newest beta; `latest` can lag behind it for a while.

```bash
npm install @samyakbhuta/ui-components@beta @ui-sdk/web@0.1.0-beta.18 @ui-sdk/core@0.1.0-beta.18
```

## Use

Importing a component registers its tag and adds its styles to the page; there's no CSS to set up. Import everything, or only what you use:

```ts
import "@samyakbhuta/ui-components"; // all eight
import "@samyakbhuta/ui-components/ai-composer"; // or one at a time
```

```html
<ai-transcript style="height: 70vh">
  <p slot="empty">What can I help with?</p>
</ai-transcript>
<ai-composer attachments history></ai-composer>
```

```ts
const composer = document.querySelector("ai-composer")!;
composer.addEventListener("promptsubmit", (event) => {
  const reply = document.createElement("ai-message");
  reply.streaming = true;
  document.querySelector("ai-transcript")!.append(reply);
  // …stream your model's answer in with reply.appendText(chunk), then reply.done()
});
```

Add this to your page's CSS so the components follow light and dark mode:

```css
:root {
  color-scheme: light dark;
}
```

## Good to know

- **Types:** included. `document.querySelector("ai-composer")` is typed, and so are the events, like `promptsubmit`.
- **React, Vue and Svelte:** add `import type {} from "@samyakbhuta/ui-components/react"` (or `/vue`, `/svelte`) once, and every tag is typed in JSX or templates: its props, their values, and its events with their `detail`. React needs version 19, which sets properties and listens to custom events.
- **Server rendering:** importing on a server does nothing, so it's safe in Next.js, Nuxt, SvelteKit or Astro. The elements come alive in the browser.
- **Styles:** they're added to the document once. Inside a shadow root, add the matching stylesheet there too: `@samyakbhuta/ui-components/ai-composer.css`. Each component's CSS sits in a cascade layer, so your own rules win.
- **Safe Markdown:** replies are rendered without parsing them as HTML, and links keep only `http`, `https` and `mailto` addresses. `renderMarkdown()` and `highlight()` are exported on their own too.
- **Defaults:** `defaultModels` is an example preset (Opus, Sonnet and Haiku 5.5). Pass your own list to `composer.models`.
- **ui-sdk is in beta:** this package is too. Pin versions until 1.0.

## Docs

Each component's full API is in this package's `docs/` folder: `ai-composer.md`, `ai-message.md`, `ai-transcript.md`, `ai-thinking.md`, `ai-tool-call.md`, `ai-sources.md`, `ai-suggestions.md` and `ai-chat-list.md`.

What changed in each release is in the [changelog](https://github.com/samyakbhuta/ui-components/blob/main/packages/ui-components/CHANGELOG.md).

## License

MIT
