# ui-sdk experiments

Web Components built with [ui-sdk](https://www.npmjs.com/package/@ui-sdk/web), plus a showcase of experiments: an AI chat app and the components it's made of (`<ai-composer>`, `<ai-message>`, `<ai-transcript>`, `<ai-thinking>`, `<ai-tool-call>`, `<ai-sources>`, `<ai-suggestions>`, `<ai-question>`, `<ai-approval>` and `<ai-chat-list>`). The components are packaged as `@samyakbhuta/ui-components` in `packages/ui-components/`, each with its own README.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the site at http://localhost:5173. The showcase is at `/showcase.html`. |
| `npm run build` | Type-checks and builds the site into `dist/`. |
| `npm test` | Runs the unit tests (Vitest). |
| `npm run test:e2e` | Builds the site and runs the browser tests in `e2e/` (Playwright, Chromium, light and dark). The first time, run `npx playwright install chromium`. |
| `npm run typecheck` | Type-checks the site, the package and the browser tests. |
| `npm run build:package` | Builds the package into `packages/ui-components/dist/`. |

CircleCI (`.circleci/config.yml`) runs the type-check, unit tests and browser tests on every push and pull request, and keeps the browser test report. A `ui-components-v<version>` tag also stages the package on npm, where it goes live once the owner approves it.

The site is live at https://uisdk-components.netlify.app: a front page for the package, the chat demo and the docs page. Netlify deploys `main` there, with a preview for each pull request.

To use the components in another app, see [docs/using-the-components.md](docs/using-the-components.md). What changed in each release is in the [changelog](https://github.com/samyakbhuta/ui-components/blob/main/packages/ui-components/CHANGELOG.md). See `AGENTS.md` for how the project is put together.
