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

Our own components live in `src/components/`, each with a README that documents its full API:

- `<ai-composer>` (`src/components/ai-composer/README.md`): the input box of an AI chat. It arranges ui-sdk parts; every extra (attachments, voice, mode, model, thinking, `/` commands, `@` references) is opt-in.
- `<ai-message>` (`src/components/ai-message/README.md`): one message. Renders Markdown with its own safe renderer (`markdown.ts`) and colours code with `highlight.ts`; both build DOM nodes and never parse model text as HTML. Keep it that way.
- `<ai-transcript>` (`src/components/ai-transcript/README.md`): the scrolling conversation, which follows streaming replies and announces finished ones.
- `<ai-thinking>` (`src/components/ai-thinking/README.md`): the "Thinking…" indicator for a conversation.
- `<ai-chat-list>` (`src/components/ai-chat-list/README.md`): the list of saved chats for a sidebar, with Rename, Export and Delete. The chat shell keeps its chats in `src/experiments/chat-shell/chat-store.ts`.

When you change a component's API, update its README, its tests, and the live examples in `src/experiments/ai-composer/main.ts` (`/experiments/ai-composer.html`).

## Testing

- `npm test` runs the unit tests: Vitest in jsdom, in `*.test.ts` files beside the code.
- `npm run test:e2e` builds the site, serves it with `vite preview`, and runs the browser tests in `e2e/` with Playwright in Chromium. Every test runs in light mode, and tests tagged `@theme` run in dark mode too. Add `--trace on` to record a trace while debugging a failure.
- `npm run typecheck` checks both `src/` and `e2e/`.
- Every browser test fails on a console error, an uncaught error or a dialog, so a reply whose text runs as script fails the suite.
- Playwright is pinned to 1.63.0. It uses an installed Chromium for that version when `PLAYWRIGHT_BROWSERS_PATH` points at one; otherwise run `npx playwright install chromium` once, or set `PLAYWRIGHT_CHROMIUM_PATH` to a Chromium binary.
- When you change how something behaves, update its browser test as well as its unit test. `.github/workflows/ci.yml` runs the type-check, unit tests and browser tests on pull requests and on `main`.
