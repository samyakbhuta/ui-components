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
- `<ai-message>` (`packages/ui-components/src/ai-message/README.md`): one message. Renders Markdown with its own safe renderer (`markdown.ts`) and colours code with `highlight.ts`; both build DOM nodes and never parse model text as HTML. Keep it that way.
- `<ai-transcript>` (`packages/ui-components/src/ai-transcript/README.md`): the scrolling conversation, which follows streaming replies and announces finished ones.
- `<ai-thinking>` (`packages/ui-components/src/ai-thinking/README.md`): the "Thinking…" indicator for a conversation.
- `<ai-chat-list>` (`packages/ui-components/src/ai-chat-list/README.md`): the list of saved chats for a sidebar, with Rename, Export and Delete. The chat shell keeps its chats in `src/experiments/chat-shell/chat-store.ts`.

When you change a component's API, update its README, its tests, the live examples in `src/experiments/ai-composer/main.ts` (`/experiments/ai-composer.html`), and `packages/ui-components/CHANGELOG.md`.

## The package

- `npm run build:package` builds `packages/ui-components/dist/` with the steps below. Its output is gitignored.
  - Vite's library build, one entry per component, with ui-sdk kept external as a peer dependency.
  - Type declarations.
  - The Custom Elements Manifest.
  - `scripts/finish-build.mjs`, which copies the plain CSS files and READMEs, cleans the manifest, and points declarations at `.js`.
- Each component adds its CSS to the page through `adoptStyles()` and registers through `define()`, both in `src/styles.ts`. Keep it that way, so the package needs no CSS setup and is safe to import on a server (`src/server-import.test.ts`).
- Every file that registers an element must stay covered by `sideEffects` in the package's `package.json`, both `dist/` and `src/`, or bundlers tree-shake the registration away and the tags stay empty.
- New entry points need a one-line file in `packages/ui-components/src/` (like `ai-composer.ts`), an entry in its `vite.config.ts`, and an `exports` entry in its `package.json`.
- Don't publish without the owner's go-ahead. To check a release, run `npm publish --dry-run` in `packages/ui-components/`. Publish betas with `npm publish --tag beta`: npm 10 doesn't always apply `publishConfig.tag`, so `scripts/check-tag.mjs` refuses to publish a prerelease under `latest`.

## Releasing

The package is on npm as `@samyakbhuta/ui-components`. Releases go out from GitHub Actions through npm trusted publishing (`.github/workflows/release.yml`), so no npm token is stored anywhere.

1. Bump `version` in `packages/ui-components/package.json`. Use `X.Y.Z-beta.N` while ui-sdk is in beta.
2. Date its entry in `packages/ui-components/CHANGELOG.md`, and merge to `main`.
3. Tag the merge commit `ui-components-v<version>` and push the tag.

The workflow:

- checks that the tag matches the version;
- runs the type-check, unit tests and package build;
- publishes, under `beta` for a version with a hyphen and under `latest` otherwise.

## Testing

- `npm test` runs the unit tests: Vitest in jsdom, in `*.test.ts` files beside the code.
- `npm run test:e2e` builds the site, serves it with `vite preview`, and runs the browser tests in `e2e/` with Playwright in Chromium. Every test runs in light mode, and tests tagged `@theme` run in dark mode too. Add `--trace on` to record a trace while debugging a failure.
- `npm run typecheck` checks both `src/` and `e2e/`.
- Every browser test fails on a console error, an uncaught error or a dialog, so a reply whose text runs as script fails the suite.
- Playwright is pinned to 1.63.0. It uses an installed Chromium for that version when `PLAYWRIGHT_BROWSERS_PATH` points at one; otherwise run `npx playwright install chromium` once, or set `PLAYWRIGHT_CHROMIUM_PATH` to a Chromium binary.
- When you change how something behaves, update its browser test as well as its unit test. `.github/workflows/ci.yml` runs the type-check, unit tests and browser tests on pull requests and on `main`.
