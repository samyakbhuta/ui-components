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
- `<ai-message>` (`src/components/ai-message/README.md`): one message. Renders Markdown with its own safe renderer (`markdown.ts`), which builds DOM nodes and never parses model text as HTML; keep it that way.
- `<ai-transcript>` (`src/components/ai-transcript/README.md`): the scrolling conversation, which follows streaming replies and announces finished ones.
- `<ai-thinking>` (`src/components/ai-thinking/README.md`): the "Thinking…" indicator for a conversation.

When you change a component's API, update its README, its tests, and the live examples in `src/experiments/ai-composer/main.ts` (`/experiments/ai-composer.html`).
