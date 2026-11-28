# AGENTS.md

## ui-sdk

This project uses ui-sdk for Web Components: `@ui-sdk/web`, with `@ui-sdk/core` as its peer dependency. Each component registers its tags when you import its entry, like `@ui-sdk/web/dialog`.

Before using ui-sdk:

- Follow the `ui-sdk` skill if it's installed. In this project it's at `.claude/skills/ui-sdk/SKILL.md`.
- Read `node_modules/@ui-sdk/web/docs/llms.txt`.

To build a new component, also:

- Search `node_modules/@ui-sdk/web/docs/core.md` by heading. It's large, so list its headings (for example `grep -n '^#' node_modules/@ui-sdk/web/docs/core.md`) and read only the sections you need.
- Read `node_modules/@ui-sdk/web/docs/rendering.md`.

## Components

Our own components live in the package `packages/ui-components/` (`@samyakbhuta/ui-components`), one folder each under `src/`, each with a README that documents its full API. The showcase imports them by package name; `vite.config.ts` and `tsconfig.json` point that name at the package's source.

- `<ai-composer>` (`packages/ui-components/src/ai-composer/README.md`): the input box of an AI chat. It arranges ui-sdk parts; every extra (attachments, voice, mode, model, thinking, `/` commands, `@` references) is opt-in.
- `<ai-message>` (`packages/ui-components/src/ai-message/README.md`): one message. Renders Markdown with its own safe renderer (`markdown.ts`) and colours code with `highlight.ts`; both build DOM nodes and never parse model text as HTML. Keep it that way. It also shows attachments, errors, feedback and versions of a reply.
- `<ai-transcript>` (`packages/ui-components/src/ai-transcript/README.md`): the scrolling conversation, which follows streaming replies and announces finished ones.
- `<ai-thinking>` (`packages/ui-components/src/ai-thinking/README.md`): the "Thinking…" indicator for a conversation.
- `<ai-tool-call>` (`packages/ui-components/src/ai-tool-call/README.md`): one step an agent takes, like a web search, with its input and result. It shows tool output as text only. Keep it that way.
- `<ai-sources>` (`packages/ui-components/src/ai-sources/README.md`): the sources a reply cites. Inside an `<ai-message>`, it turns `[1]` markers into links with a preview. Only `http:` and `https:` addresses become links. Keep it that way.
- `<ai-suggestions>` (`packages/ui-components/src/ai-suggestions/README.md`): prompts to send with one press, through the `<ai-composer>` named by `for`.
- `<ai-question>` (`packages/ui-components/src/ai-question/README.md`): a question the model asks, with radio buttons or checkboxes and an optional "Other" text box. Questions, choices and typed answers are text only. Keep it that way.
- `<ai-approval>` (`packages/ui-components/src/ai-approval/README.md`): an agent asks permission before it acts, with Allow once, Always allow and Deny. What the tool would get is shown as text only. Keep it that way, so people see exactly what they allow.
- `<ai-plan>` (`packages/ui-components/src/ai-plan/README.md`): an agent proposes a plan, shown in place as Markdown when opened, with Reject, Revise… (a box for what to change), Accept and "Accept and use …" options that switch the composer's Mode inside `<ai-chat>`. The plan goes through `<ai-message>`'s Markdown renderer, so it's never parsed as HTML.
- `<ai-chat>` (`packages/ui-components/src/ai-chat/README.md`): a whole chat in one tag. It runs the conversation from a `model` that yields chunks, using the other components; a yielded question or approval waits for the person, and the answer comes back as the value of that `yield`. A new kind of chunk needs a row in its README's table.
- `<ai-chat-list>` (`packages/ui-components/src/ai-chat-list/README.md`): the list of saved chats for a sidebar, with Rename, Export and Delete. The chat shell keeps its chats in `src/experiments/chat-shell/chat-store.ts`.

The site's front page, `index.html`, introduces the package and lists every component, each linking to its live example on the docs page. Netlify deploys the site from `main` to https://uisdk-components.netlify.app. A new component needs a card there too, and `e2e/home.spec.ts` counts them.

The front page's two quick starts are also projects of their own, installed from npm: `examples/quick-start/`, a chat in one `<ai-chat>` tag, and `examples/from-parts/`, the same chat built from the parts. `npx degit samyakbhuta/ui-components/examples/<name>` starts from either. "Open in StackBlitz" sends the quick start's files to StackBlitz from the page (`src/home.ts`), because StackBlitz's import from GitHub never finishes for this repository; don't switch it back to a `stackblitz.com/github/…` link. `src/home.test.ts` fails unless each starter's page matches its tab on the front page word for word, and the starters use the ui-sdk version the package is built against; change them together. The front page reads the newest version from jsDelivr, since npm's registry doesn't let other sites read it; the browser tests answer for jsDelivr, so they don't need the network.

`docs/making-ai-chat-your-own.md` is a beginner's guide to changing `<ai-chat>`, as recipes. Each recipe is a whole page in `recipes/ai-chat/`, a variation of the quick start's `index.html`, and `vite.config.ts` builds every page there into the site, at `/recipes/ai-chat/…`. The guide shows each page in full: `src/recipes.test.ts` fails unless each code block matches its file word for word, the guide links to it, and the page keeps the quick start's `<head>` setup. `e2e/recipes.spec.ts` checks that each recipe does what the guide says. The recipes must work with the version the quick start installs from npm, so don't use anything unreleased in them; to change a recipe, edit its file and paste it into the guide.

The site also shows the guides in `docs/` and each component's README as pages, at `/guides/…`. `scripts/guide-pages.mjs` renders them from the Markdown with `marked` as a Vite plugin, into `guides/` (not committed), when the site builds or the dev server starts, and again in dev when the Markdown changes. The Markdown stays the one source: edit it, never the pages. Links between the guides and READMEs go to their pages, keeping `#sections`; links to other repo files go to GitHub. `src/guide-pages.test.ts` checks every link on those pages leads somewhere that exists, including each `#section`, so a renamed heading fails the tests. A new guide in `docs/` needs adding to `guideSources()`; a new component's README is picked up on its own.

When you change a component's API, update its README, its tests, the live examples in `src/experiments/ai-composer/main.ts` (`/experiments/ai-composer.html`), `packages/ui-components/CHANGELOG.md`, and its props or events in `packages/ui-components/src/elements.ts`.

`elements.ts` is the map of every tag's props and events that `react.ts`, `vue.ts` and `svelte.ts` turn into JSX and template types. `elements.test.ts` fails when an attribute or writable property is missing from it. Type a prop as its setter takes it. Frameworks set a property whenever the element has one, so a property must accept what a framework passes for the attribute of the same name, like `true` for a bare attribute or a string of words. The type tests in `packages/ui-components/types-test/` run with `npm run typecheck`; each `@ts-expect-error` there must stay an error.

## The package

- `npm run build:package` builds `packages/ui-components/dist/` with the steps below. Its output is gitignored.
  - Vite's library build, one entry per component, with ui-sdk kept external as a peer dependency.
  - Type declarations.
  - The Custom Elements Manifest.
  - `scripts/finish-build.mjs`, which copies the plain CSS files and READMEs, cleans the manifest, and points declarations at `.js`.
- Each component adds its CSS to the page through `adoptStyles()` and registers through `define()`, both in `src/styles.ts`. Keep it that way, so the package needs no CSS setup and is safe to import on a server (`src/server-import.test.ts`).
- Every file that registers an element must stay covered by `sideEffects` in the package's `package.json`, both `dist/` and `src/`, or bundlers tree-shake the registration away and the tags stay empty.
- New entry points need a one-line file in `packages/ui-components/src/` (like `ai-composer.ts`), an entry in its `vite.config.ts`, and an `exports` entry in its `package.json`. A new component also needs its tag in `src/elements.ts`.
- The build also writes editor data: `dist/vscode.html-custom-data.json` for VS Code and `dist/web-types.json` for JetBrains IDEs, from `scripts/editor-data.mjs`. Attribute names come from each element's `observedAttributes`, values from the prop types in `src/elements.ts`, descriptions from the README tables (a row whose first cell names the attribute or event), and live example links from the front page. `src/editor-data.test.ts` runs the data through VS Code's HTML language service, and fails when an attribute or event has no README row. So document a new attribute or event in a README table, not only in prose.
- `./react`, `./vue`, `./svelte` and `./elements` export types only, with no JavaScript. The framework types come from devDependencies (`@types/react`, `vue`, `svelte`), so the package doesn't depend on any framework.
- Don't publish from your machine: CircleCI stages releases and the owner approves them (see Releasing). To check what a release would contain, run `npm publish --dry-run --tag beta` in `packages/ui-components/`. `scripts/check-tag.mjs` refuses to publish a prerelease under `latest`, since npm 10 doesn't always apply `publishConfig.tag`.

## Releasing

The package is on npm as `@samyakbhuta/ui-components`. CircleCI stages each release through npm trusted publishing (the `release` workflow in `.circleci/config.yml`), and the owner approves it with 2FA. No npm token is stored anywhere, and CircleCI's trusted publisher can only stage, not publish.

1. Bump `version` in `packages/ui-components/package.json`. Use `X.Y.Z-beta.N` while ui-sdk is in beta.
2. Date its entry in `packages/ui-components/CHANGELOG.md`, and merge to `main`.
3. Create a GitHub release on the merge commit with the tag `ui-components-v<version>`, and paste that version's changelog entry as its notes. The tag starts the release workflow.
4. The owner approves the staged version on npmjs.com (Staged Packages) or with `npm stage approve <stage-id>`. Only then is it on npm.
5. While the package is in beta, the owner also moves `latest` to it, so a plain `npm install` gets it: `npm dist-tag add @samyakbhuta/ui-components@<version> latest`, with 2FA. CircleCI can't: its trusted publisher can only stage.

The workflow:

- checks that the tag matches the version;
- runs the type-check, unit tests and package build;
- stages the version with `npm stage publish`, under `beta` for a version with a hyphen and under `latest` otherwise.

A beta is staged under `beta` only, so `latest` stays where it was until step 5. Docs tell people to install `@beta`, which is right whether or not `latest` has caught up.

npm only accepts a trusted publisher for a package that already exists, so the first release was published with a temporary token, which has been removed. Don't add an npm token to CircleCI: it would let releases skip the owner's approval.

## Testing

- `npm test` runs the unit tests: Vitest in jsdom, in `*.test.ts` files beside the code.
- `npm run test:e2e` builds the site, serves it with `vite preview`, and runs the browser tests in `e2e/` with Playwright in Chromium. Every test runs in light mode, and tests tagged `@theme` run in dark mode too. Add `--trace on` to record a trace while debugging a failure.
- `npm run typecheck` checks both `src/` and `e2e/`.
- Every browser test fails on a console error, an uncaught error or a dialog, so a reply whose text runs as script fails the suite.
- Playwright is pinned to 1.63.0. It uses an installed Chromium for that version when `PLAYWRIGHT_BROWSERS_PATH` points at one; otherwise run `npx playwright install chromium` once, or set `PLAYWRIGHT_CHROMIUM_PATH` to a Chromium binary.
- When you change how something behaves, update its browser test as well as its unit test. CircleCI (`.circleci/config.yml`) runs the type-check, unit tests and browser tests on every push. It runs both test suites with `circleci testsuite run`, as defined in `.circleci/test-suites.yml`, so update a suite there if you change how its tests are found or run. GitHub Actions is not used.
