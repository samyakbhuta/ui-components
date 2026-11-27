# Using the AI chat components in another app

This guide is for developers who want to use the components from this repo in their own app:

- `<ai-composer>`: the input box
- `<ai-message>`: one message
- `<ai-transcript>`: the scrolling conversation
- `<ai-thinking>`: the "Thinking…" indicator
- `<ai-chat-list>`: the sidebar of saved chats

They're standard Web Components, so they work in a plain HTML page and in React, Vue, Svelte or Angular. Each component's full API is in the README in its folder under `src/components/`. This guide covers getting them into your app.

## What you need

- **A bundler that compiles TypeScript and bundles CSS imports.** Vite does both with no setup, and the examples below use it. webpack, Rspack, Parcel and esbuild work too, with CSS imports turned on. Each component imports its own stylesheet (`import "./ai-composer.css"`) and its siblings with `.ts` extensions (`import "./markdown.ts"`).
- **ui-sdk**: `@ui-sdk/web` and its peer `@ui-sdk/core`. This repo uses `0.1.0-beta.17`. ui-sdk is in beta, so pin the same version until you've checked a newer one.
- **A current browser.** The styles use `color-mix()`, `light-dark()`, `:has()` and container queries, which Chrome, Edge, Firefox and Safari have supported for some time.

## Option 1: copy the components (works today)

The components aren't published as a package yet, so the simplest way in is to copy them.

### 1. Install ui-sdk

```bash
npm install @ui-sdk/web@0.1.0-beta.17 @ui-sdk/core@0.1.0-beta.17
```

### 2. Copy the folders you need

Copy the component folders from `src/components/` into your app, for example into `src/components/`. Each folder holds the element, its CSS, its README and its tests. Copy only what you use: there are no dependencies between the folders.

| Folder | Gives you | ui-sdk parts it imports |
| --- | --- | --- |
| `ai-composer/` | `<ai-composer>` | button, file-input, segmented-control, select, textarea, toggle, trigger-menu |
| `ai-message/` | `<ai-message>`, plus `markdown.ts` and `highlight.ts` | button |
| `ai-transcript/` | `<ai-transcript>` | none |
| `ai-thinking/` | `<ai-thinking>` | none |
| `ai-chat-list/` | `<ai-chat-list>` | alert-dialog, button, menu |

`<ai-chat-list>` only lists chats; saving them is up to your app. If you want this repo's approach (chats in `localStorage`, plus Markdown export), copy `src/experiments/chat-shell/chat-store.ts` too.

### 3. Add two lines of page CSS

Put these in your global stylesheet, before any other CSS:

```css
/* ui-sdk adds a little CSS in this layer. Declared first, it ranks below your own styles. */
@layer ui-sdk;

/* The components follow light and dark mode through system colours and light-dark(). */
:root {
  color-scheme: light dark;
}
```

Without `color-scheme: light dark` the components stay light even in dark mode. Use `color-scheme: light` or `dark` to pin one.

### 4. Check your TypeScript settings

The components import their siblings with `.ts` extensions, so a TypeScript project needs these compiler options (Vite's templates already have them):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  }
}
```

A JavaScript project needs nothing extra: the bundler compiles the `.ts` files.

### 5. Import them and use them

Importing a component's file registers its tag, so do that once, in your app's entry:

```ts
import "./components/ai-composer/ai-composer.ts";
import "./components/ai-message/ai-message.ts";
import "./components/ai-transcript/ai-transcript.ts";
import "./components/ai-thinking/ai-thinking.ts";
```

Then use the tags:

```html
<ai-transcript style="height: 70vh">
  <p slot="empty">What can I help with?</p>
</ai-transcript>
<ai-composer attachments history persist="my-app"></ai-composer>
```

## A complete chat in a few lines

This wires the components to your own server. It assumes an endpoint, `/api/chat`, that takes the prompt as JSON and streams the answer back as plain text. Replace it with however you call your model.

```ts
import "./components/ai-composer/ai-composer.ts";
import "./components/ai-message/ai-message.ts";
import "./components/ai-thinking/ai-thinking.ts";
import "./components/ai-transcript/ai-transcript.ts";

const transcript = document.querySelector("ai-transcript")!;
const composer = document.querySelector("ai-composer")!;

composer.addEventListener("promptsubmit", async (event) => {
  const { text, files } = event.detail;

  // Show what was asked.
  const question = document.createElement("ai-message");
  question.from = "user";
  question.text = text;
  transcript.append(question);

  // Show the answer as it streams in.
  const reply = document.createElement("ai-message");
  reply.streaming = true;
  const thinking = document.createElement("ai-thinking");
  thinking.slot = "header";
  thinking.timer = true;
  reply.append(thinking);
  transcript.append(reply);

  // Stop cancels the request.
  const controller = new AbortController();
  const stop = () => controller.abort();
  composer.addEventListener("promptstop", stop, { once: true });
  composer.busy = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, files: files.map((file) => file.name) }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(`The server answered ${response.status}`);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      thinking.done(); // the first words end the thinking
      reply.appendText(value);
    }
  } catch (error) {
    thinking.remove();
    const note = document.createElement("small");
    note.slot = "footer";
    note.textContent = controller.signal.aborted ? "Stopped" : `Something went wrong: ${(error as Error).message}`;
    reply.append(note);
  } finally {
    reply.done();
    composer.removeEventListener("promptstop", stop);
    composer.busy = false;
  }
});

// Retry asks again; Edit puts the prompt back in the box.
transcript.addEventListener("messageaction", (event) => {
  if (event.detail.action === "edit") {
    composer.value = event.detail.text;
    composer.focus();
  }
});
```

Things you get without writing any code:

- The transcript follows the reply as it streams and offers "Jump to latest" if the reader scrolls up.
- Screen readers hear each finished reply once.
- Replies render as Markdown, with code coloured.
- Send turns into Stop while `busy` is set.

To turn on Mode, Model, Thinking, `/` commands and `@` references, see `src/components/ai-composer/README.md`. The docs page in this repo (`npm run dev`, then `/experiments/ai-composer.html`) has a playground that writes the setup code for you.

## Using them with a framework

Web Components are HTML elements, so every framework can render them. The differences are in how you pass lists and objects (as properties, not attributes) and how you listen for their events.

### React

React 19 sets properties on custom elements, so plain props work for lists. A ref and `addEventListener` works in every version, including React 18:

```tsx
import { useEffect, useRef } from "react";
import "./components/ai-composer/ai-composer.ts";
import { defaultModels } from "./components/ai-composer/ai-composer.ts";

export function Composer({ onSend }: { onSend: (text: string) => void }) {
  const ref = useRef<HTMLElementTagNameMap["ai-composer"]>(null);

  useEffect(() => {
    const composer = ref.current!;
    composer.models = defaultModels;
    const send = (event: CustomEvent<{ text: string }>) => onSend(event.detail.text);
    composer.addEventListener("promptsubmit", send);
    return () => composer.removeEventListener("promptsubmit", send);
  }, [onSend]);

  return <ai-composer ref={ref} attachments="" default-model="sonnet-5.5" />;
}
```

For TypeScript to accept `<ai-composer>` in JSX, declare the tags once:

```ts
import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "ai-composer": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
      "ai-transcript": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      "ai-message": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
    }
  }
}
```

Boolean attributes such as `attachments` need a string value in JSX (`attachments=""`), since React leaves out `false` and passes `true` through as a string.

### Vue

Tell Vue that tags starting with `ai-` and `ui-` are custom elements, in `vite.config.ts`:

```ts
import vue from "@vitejs/plugin-vue";

export default {
  plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag: string) => tag.startsWith("ai-") || tag.startsWith("ui-") } } })],
};
```

Vue sets a binding as a property when the element has one, so lists pass straight through, and `@` listens to custom events:

```vue
<ai-composer attachments :models="models" @promptsubmit="send($event.detail)" />
```

### Svelte

Svelte sets properties on custom elements and listens to any event:

```svelte
<ai-composer attachments models={models} onpromptsubmit={(event) => send(event.detail)}></ai-composer>
```

### Angular

Add `CUSTOM_ELEMENTS_SCHEMA` to the component that uses them, then bind properties with `[]` and events with `()`:

```html
<ai-composer attachments [models]="models" (promptsubmit)="send($event.detail)"></ai-composer>
```

## Server-side rendering

The components run in the browser only. Their files define classes that extend `HTMLElement`, which doesn't exist on the server, so import them on the client:

- **Next.js:** import them in a `"use client"` component inside `useEffect`, or load that component with `dynamic(..., { ssr: false })`.
- **Nuxt:** wrap them in `<ClientOnly>`, and import them in a client-only plugin (`plugins/components.client.ts`).
- **SvelteKit:** import them in `onMount`, or turn off SSR for that page.
- **Astro:** import them in a `<script>` tag, which runs in the browser.

The server can still send the tags in its HTML. They come alive once the script loads.

## Styling to match your app

- **Your CSS wins.** Each component's CSS sits in its own cascade layer (`ai-composer`, `ai-message` and so on), so any rule of yours that isn't in a layer overrides it, whatever its specificity.
- **Theme with custom properties first.** For example:

  ```css
  ai-composer {
    --ai-composer-accent: #6d28d9;
    --ai-composer-accent-text: white;
    --ai-composer-radius: 0.5rem;
  }
  ```

  Each README lists its properties, and `data-part` attributes for anything deeper.
- **Fonts:** they come from your page.
- **Colours:** they follow your page's `color-scheme`.

## Words and languages

Every built-in word can be replaced through each component's `strings` property, for translation or your own tone:

```ts
composer.strings = { send: "Envoyer", attach: "Joindre des fichiers" };
```

Right-to-left layouts follow `dir="rtl"`.

## Security

- `<ai-message>` renders model output with its own Markdown renderer, which builds elements one by one and never parses the text as HTML. HTML in a reply shows as text, and links keep only `http`, `https` and `mailto` addresses.
- Don't put model output into `innerHTML` anywhere else in your app; set `message.text` instead.
- If you plug in your own `highlighter`, have it return DOM nodes. If your highlighter library produces an HTML string, sanitize it first.
- `persist` and `chat-store.ts` keep drafts and chats in the browser's `localStorage`. Don't use them for anything that shouldn't stay on a shared computer.

## AI agents

The controls are ui-sdk parts, so ui-sdk's agent bridge can read and use them:

```ts
import { createAgent } from "@ui-sdk/web/agent";

const agent = createAgent();
await agent.act({
  steps: [
    { ref: "Prompt", action: "setValue", args: ["Summarize this page"] },
    { ref: "Send", action: "press" },
  ],
});
```

See ui-sdk's agent docs in `node_modules/@ui-sdk/web/docs/agents.md`, including how to register these as WebMCP tools.

## Bringing the tests along

Each folder's `*.test.ts` runs in Vitest with jsdom. To run them in your app:

1. Copy `src/test/setup.ts`, which stubs a few browser APIs jsdom lacks.
2. Use a `vitest.config.ts` like this repo's.
3. Install the test tools:

```bash
npm install --save-dev vitest jsdom @testing-library/dom @testing-library/user-event
```

The browser tests in `e2e/` test this repo's pages, so use them as examples for your own rather than copying them as they are.

## Keeping up to date

Copied components don't update themselves. When this repo changes, compare the component folders and copy them again; their READMEs describe the API, so you can see what changed. If several apps share the components, consider Option 2.

## Option 2: share them as a package (not set up yet)

To install the components with `npm install` instead of copying them, this repo needs a small library build. That means a Vite library build (`build.lib`) with an entry for each component, a `package.json` `exports` map, and type declarations. Then you could publish it to npm or GitHub Packages, or install it straight from Git. Ask if you'd like that set up.

## Troubleshooting

| What you see | Why, and the fix |
| --- | --- |
| The tag renders nothing | The component's file was never imported. Import it once in your entry. |
| It looks unstyled | Your bundler isn't bundling the CSS imports. Turn on CSS handling (Vite does it by default). |
| It stays light in dark mode | Add `color-scheme: light dark` to `:root`. |
| `HTMLElement is not defined` | It was imported on the server. See [Server-side rendering](#server-side-rendering). |
| TypeScript: "An import path can only end with a '.ts' extension…" | Turn on `allowImportingTsExtensions` with `moduleResolution: "bundler"`. |
| Vue warns "Failed to resolve component: ai-composer" | Add `isCustomElement` for `ai-` and `ui-` tags. |
| A list like `models` does nothing | It was passed as an attribute. Set it as a property (see your framework's section). |
| Your styles don't apply | Check whether your rule sits inside an `@layer` declared after the component's; unlayered rules always win. |
