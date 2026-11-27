# Using the AI chat components in another app

This guide is for developers who want to use the components from this repo in their own app:

- `<ai-composer>`: the input box
- `<ai-message>`: one message
- `<ai-transcript>`: the scrolling conversation
- `<ai-thinking>`: the "Thinking…" indicator
- `<ai-tool-call>`: one step an agent takes, like a web search
- `<ai-sources>`: the sources a reply cites
- `<ai-suggestions>`: prompts to send with one press
- `<ai-question>`: a question the model asks, with choices to pick from
- `<ai-approval>`: an agent asks permission before it acts
- `<ai-chat-list>`: the sidebar of saved chats

They're standard Web Components, so they work in a plain HTML page and in React, Vue, Svelte or Angular, with types for React, Vue and Svelte templates. They're packaged as `@samyakbhuta/ui-components`. Each component's full API is in its README, in the package's `docs/` folder and in `packages/ui-components/src/` in this repo. This guide covers getting them into your app.

## What you need

- **A bundler**, like Vite, webpack, Rspack, Parcel or esbuild. The package ships plain JavaScript with its CSS built in and its TypeScript types included, so it needs no TypeScript or CSS configuration. The examples below use Vite.
- **ui-sdk**: `@ui-sdk/web` and its peer `@ui-sdk/core`, installed beside the package so all the components share one copy. The package is built against `0.1.0-beta.18`. ui-sdk is in beta, so pin that version until you've checked a newer one.
- **A current browser.** The styles use `color-mix()`, `light-dark()`, `:has()` and container queries, which Chrome, Edge, Firefox and Safari have supported for some time.

## Option 1: install the package

### 1. Install it

```bash
npm install @samyakbhuta/ui-components@beta @ui-sdk/web@0.1.0-beta.18 @ui-sdk/core@0.1.0-beta.18
```

The `beta` tag always points at the newest beta. A release only moves `latest` when the owner moves it by hand, so `latest` can lag behind for a while.

To start from a working project instead, run `npx degit samyakbhuta/ui-components/examples/quick-start my-chat`, or [open it in StackBlitz](https://stackblitz.com/github/samyakbhuta/ui-components/tree/main/examples/quick-start). For a plain HTML file with nothing to install, import the package from esm.sh: `import "https://esm.sh/@samyakbhuta/ui-components@beta"`, and pin a version before you ship.

To try a change that isn't released yet, run `npm run build:package` in this repo, then `npm pack` in `packages/ui-components/`, and install the `.tgz` file it prints instead.

### 2. Let the page follow light and dark mode

Put this in your global stylesheet:

```css
:root {
  color-scheme: light dark;
}
```

Without it the components stay light even in dark mode. Use `color-scheme: light` or `dark` to pin one.

### 3. Import them and use them

Importing a component registers its tag and adds its styles to the page. Do it once, in your app's entry:

```ts
import "@samyakbhuta/ui-components"; // all ten
```

Or import only what you use:

```ts
import "@samyakbhuta/ui-components/ai-composer";
import "@samyakbhuta/ui-components/ai-message";
```

Then use the tags:

```html
<ai-transcript style="height: 70vh">
  <p slot="empty">What can I help with?</p>
</ai-transcript>
<ai-composer attachments history persist="my-app"></ai-composer>
```

### What you can import

| Import | Gives you |
| --- | --- |
| `@samyakbhuta/ui-components` | All ten elements, their classes and types, and `renderMarkdown()` |
| `@samyakbhuta/ui-components/ai-composer` | `<ai-composer>`, plus `defaultModes`, `defaultModels`, `defaultThinkingLevels` and its types |
| `@samyakbhuta/ui-components/ai-message` | `<ai-message>` and `copyText()` |
| `@samyakbhuta/ui-components/ai-transcript` | `<ai-transcript>` |
| `@samyakbhuta/ui-components/ai-thinking` | `<ai-thinking>` |
| `@samyakbhuta/ui-components/ai-tool-call` | `<ai-tool-call>` |
| `@samyakbhuta/ui-components/ai-sources` | `<ai-sources>`, plus `safeUrl()` and `siteOf()` |
| `@samyakbhuta/ui-components/ai-suggestions` | `<ai-suggestions>` |
| `@samyakbhuta/ui-components/ai-question` | `<ai-question>` |
| `@samyakbhuta/ui-components/ai-approval` | `<ai-approval>` |
| `@samyakbhuta/ui-components/ai-chat-list` | `<ai-chat-list>` |
| `@samyakbhuta/ui-components/markdown` | `renderMarkdown()` and `renderPlainText()` on their own |
| `@samyakbhuta/ui-components/highlight` | The syntax highlighter on its own |
| `@samyakbhuta/ui-components/react`, `/vue`, `/svelte` | Types only: every tag's props and events in JSX or templates. See [Types for JSX and templates](#types-for-jsx-and-templates). |
| `@samyakbhuta/ui-components/elements` | Types only: `CustomElements`, the map of each tag's element class, props and events, for typing another framework |
| `@samyakbhuta/ui-components/ai-composer.css` (and the others) | Each component's stylesheet, for use inside a shadow root |

The package also ships `custom-elements.json`, a Custom Elements Manifest that editors and tools like Storybook can read for tag, property and event autocomplete.

`<ai-chat-list>` only lists chats; saving them is up to your app. For this repo's approach (chats in `localStorage`, plus Markdown export), copy `src/experiments/chat-shell/chat-store.ts` into your app.

## A complete chat in a few lines

This wires the components to your own server. It assumes an endpoint, `/api/chat`, that takes the prompt as JSON and streams the answer back as plain text. Replace it with however you call your model.

```ts
import "@samyakbhuta/ui-components/ai-composer";
import "@samyakbhuta/ui-components/ai-message";
import "@samyakbhuta/ui-components/ai-thinking";
import "@samyakbhuta/ui-components/ai-transcript";

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

To turn on Mode, Model, Thinking, `/` commands and `@` references, see the composer's README (`docs/ai-composer.md` in the package). The docs page in this repo (`npm run dev`, then `/experiments/ai-composer.html`) has a playground that writes the setup code for you.

## Using them with a framework

Web Components are HTML elements, so every framework can render them. The differences are in how you pass lists and objects (as properties, not attributes) and how you listen for their events.

### Types for JSX and templates

The package types every tag for React, Vue and Svelte: each prop, the values it takes, and each event with its `detail`. Your editor completes them, and a typo or a wrong value fails the type check. Add one line, once, in any file your project type-checks:

```ts
import type {} from "@samyakbhuta/ui-components/react"; // or /vue or /svelte
```

The map underneath, `CustomElements` from `@samyakbhuta/ui-components/elements`, lists each tag's element class, props and events, for typing another framework.

React 19, Vue and Svelte all set a prop as a property when the element has one, and as an attribute otherwise. So lists and objects pass straight through, and so do flags like `attachments={false}`. Import the components before the framework first renders them, so the properties exist by then.

### React

React 19 sets properties on custom elements, and `on` with an event's exact name listens to it:

```tsx
import "@samyakbhuta/ui-components/ai-composer";
import { defaultModels } from "@samyakbhuta/ui-components/ai-composer";
import type {} from "@samyakbhuta/ui-components/react";

export function Composer({ onSend }: { onSend: (text: string) => void }) {
  return (
    <ai-composer
      attachments
      models={defaultModels}
      default-model="sonnet-5.5"
      onpromptsubmit={(event) => onSend(event.detail.text)}
    />
  );
}
```

React 18 doesn't set properties or listen to custom events. There, set them through a ref:

```tsx
const ref = useRef<HTMLElementTagNameMap["ai-composer"]>(null);
useEffect(() => {
  const composer = ref.current!;
  composer.models = defaultModels;
  const send = (event: CustomEvent<{ text: string }>) => onSend(event.detail.text);
  composer.addEventListener("promptsubmit", send);
  return () => composer.removeEventListener("promptsubmit", send);
}, [onSend]);
```

### Vue

Tell Vue that tags starting with `ai-` and `ui-` are custom elements, in `vite.config.ts`:

```ts
import vue from "@vitejs/plugin-vue";

export default {
  plugins: [vue({ template: { compilerOptions: { isCustomElement: (tag: string) => tag.startsWith("ai-") || tag.startsWith("ui-") } } })],
};
```

Vue sets a binding as a property when the element has one, and `@` listens to custom events. With `import type {} from "@samyakbhuta/ui-components/vue"`, vue-tsc and the Vue extension check both, including `$event.detail`:

```vue
<ai-composer attachments :models="models" @promptsubmit="send($event.detail)" />
```

### Svelte

Svelte 5 sets properties on custom elements and listens to any event. With `import type {} from "@samyakbhuta/ui-components/svelte"`, svelte-check and the Svelte extension check them:

```svelte
<ai-composer attachments {models} onpromptsubmit={(event) => send(event.detail)}></ai-composer>
```

### Angular

Add `CUSTOM_ELEMENTS_SCHEMA` to the component that uses them, then bind properties with `[]` and events with `()`:

```html
<ai-composer attachments [models]="models" (promptsubmit)="send($event.detail)"></ai-composer>
```

## Server-side rendering

Importing the package on a server is safe: with no DOM there, the import registers nothing and touches nothing. That means you can import it in shared code in Next.js, Nuxt, SvelteKit or Astro without special handling.

The server sends the tags in its HTML as they are, and they come alive once the browser loads the script. Anything you set from script (lists like `models`, event listeners) belongs in client-side code: `useEffect`, `onMounted`, `onMount`, or a `<script>` tag in Astro.

If you copied the source instead of installing the package, the same holds, as long as you copied `styles.ts` with it.

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

If you copied the source, each folder's `*.test.ts` runs in Vitest with jsdom. To run them in your app:

1. Copy `src/test/setup.ts`, which stubs a few browser APIs jsdom lacks.
2. Use a `vitest.config.ts` like this repo's.
3. Install the test tools:

```bash
npm install --save-dev vitest jsdom @testing-library/dom @testing-library/user-event
```

The browser tests in `e2e/` test this repo's pages, so use them as examples for your own rather than copying them as they are.

## Keeping up to date

The package follows semantic versioning, with a [changelog](https://github.com/samyakbhuta/ui-components/blob/main/packages/ui-components/CHANGELOG.md). While it's in beta (`0.1.0-beta.x`), any release can change the API, so pin an exact version and read the changelog before you upgrade.

## Option 2: copy the source instead

If you'd rather own the code, copy the component folders from `packages/ui-components/src/` into your app, along with `packages/ui-components/src/styles.ts`, which they all import. Then:

- Install ui-sdk as above.
- Your bundler has to handle TypeScript and `?inline` CSS imports. Vite does both; other bundlers need loaders for them.
- Your `tsconfig.json` needs `"moduleResolution": "bundler"` and `"allowImportingTsExtensions": true`, since the files import each other with `.ts` extensions, plus `"types": ["vite/client"]` for the CSS imports.

Copied code doesn't update itself. When this repo changes, compare the folders and copy them again.

## Troubleshooting

| What you see | Why, and the fix |
| --- | --- |
| The tag renders nothing | The component was never imported. Import it once in your entry. |
| It looks unstyled | It's inside a shadow root, where page styles don't reach. Add the component's stylesheet there, like `@samyakbhuta/ui-components/ai-composer.css`. |
| It stays light in dark mode | Add `color-scheme: light dark` to `:root`. |
| `HTMLElement is not defined` on a server | Only with copied source: copy `styles.ts` with the components, which makes importing on a server safe. See [Server-side rendering](#server-side-rendering). |
| TypeScript doesn't know `<ai-composer>` in JSX or a template | Add `import type {} from "@samyakbhuta/ui-components/react"` (or `/vue`, `/svelte`) once. See [Types for JSX and templates](#types-for-jsx-and-templates). |
| TypeScript: "An import path can only end with a '.ts' extension…" | Only with copied source. Turn on `allowImportingTsExtensions` with `moduleResolution: "bundler"`. |
| Vue warns "Failed to resolve component: ai-composer" | Add `isCustomElement` for `ai-` and `ui-` tags. |
| A list like `models` does nothing | It was passed as an attribute. Set it as a property (see your framework's section). |
| Your styles don't apply | Check whether your rule sits inside an `@layer` declared after the component's; unlayered rules always win. |
