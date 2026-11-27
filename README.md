# ui-sdk experiments

Web Components built with [ui-sdk](https://www.npmjs.com/package/@ui-sdk/web), plus a showcase of experiments: an AI chat app and the components it's made of (`<ai-composer>`, `<ai-message>`, `<ai-transcript>`, `<ai-thinking>` and `<ai-chat-list>`). Each component has a README in `src/components/`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the site at http://localhost:5173. The showcase is at `/showcase.html`. |
| `npm run build` | Type-checks and builds the site into `dist/`. |
| `npm test` | Runs the unit tests (Vitest). |
| `npm run test:e2e` | Builds the site and runs the browser tests in `e2e/` (Playwright, Chromium, light and dark). The first time, run `npx playwright install chromium`. |
| `npm run typecheck` | Type-checks the site and the browser tests. |

`.github/workflows/ci.yml` runs the type-check, unit tests and browser tests on pull requests and on `main`, and uploads the browser test report.

To use the components in another app, see [docs/using-the-components.md](docs/using-the-components.md). See `AGENTS.md` for how the project is put together.
