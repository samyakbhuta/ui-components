// Turns the repo's Markdown guides and component READMEs into pages for the site, at build time.
// The Markdown stays the one source: GitHub and npm show it as it is, and the site shows these
// pages, written to guides/ (not committed) and built by Vite like any other page.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { Marked } from "marked";

const repo = "https://github.com/samyakbhuta/ui-components/blob/main/";
const site = "https://uisdk-components.netlify.app/";

/** The components, in the order the front page lists them. */
const componentOrder = [
  "ai-chat",
  "ai-composer",
  "ai-message",
  "ai-transcript",
  "ai-thinking",
  "ai-tool-call",
  "ai-sources",
  "ai-suggestions",
  "ai-question",
  "ai-questions",
  "ai-approval",
  "ai-plan",
  "ai-notice",
  "ai-chat-list",
];

/** Every page: where its Markdown is, where its page goes, and its name in the sidebar. */
export function guideSources(root) {
  const folders = readdirSync(join(root, "packages/ui-components/src"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("ai-"))
    .map((entry) => entry.name);
  const order = (name) => (componentOrder.includes(name) ? componentOrder.indexOf(name) : componentOrder.length);
  return [
    { source: "docs/using-the-components.md", page: "guides/using-the-components.html", name: "Using the components", group: "Guides" },
    { source: "docs/making-ai-chat-your-own.md", page: "guides/making-ai-chat-your-own.html", name: "Making <ai-chat> your own", group: "Guides" },
    ...folders
      .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
      .map((name) => ({ source: `packages/ui-components/src/${name}/README.md`, page: `guides/components/${name}.html`, name: `<${name}>`, group: "Components" })),
  ];
}

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The id GitHub gives a heading, so `#…` links work the same on both. */
export function slug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** Plain text of inline tokens, the way GitHub reads a heading for its id. */
function plain(tokens) {
  return tokens.map((token) => (token.tokens ? plain(token.tokens) : token.type === "escape" || token.type === "codespan" || token.type === "text" ? token.text : "")).join("");
}

/** Where a link in `source` should point on the site. */
export function resolveLink(href, source, pages) {
  if (href.startsWith("#") || /^(mailto|tel):/.test(href)) return href;
  if (href.startsWith(site)) return `/${href.slice(site.length)}`;
  let path;
  let hash = "";
  if (href.startsWith(repo)) path = href.slice(repo.length);
  else if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;
  else path = posix.normalize(posix.join(posix.dirname(source), href));
  const at = path.indexOf("#");
  if (at >= 0) [path, hash] = [path.slice(0, at), path.slice(at)];
  path = path.replace(/\/$/, "");
  const page = pages.find((entry) => entry.source === path);
  if (page) return `/${page.page}${hash}`;
  // Pages of the site itself, like the docs page and the recipes.
  if (/^(index\.html|showcase\.html|experiments\/[\w-]+\.html|recipes\/[\w/-]+\.html)$/.test(path)) return `/${path}${hash}`;
  return `${repo}${path}${hash}`;
}

/** Renders one page's Markdown to HTML, with GitHub's heading ids and links that work on the site. */
export function renderGuide(markdown, source, pages) {
  const seen = new Map();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const base = slug(plain(tokens));
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count ? `${base}-${count}` : base;
        return `<h${depth} id="${escape(id)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const to = resolveLink(href, source, pages);
        const outside = /^https?:/.test(to) && !to.startsWith(site);
        return `<a href="${escape(to)}"${title ? ` title="${escape(title)}"` : ""}${outside ? ' rel="noopener"' : ""}>${this.parser.parseInline(tokens)}</a>`;
      },
      code({ text, lang }) {
        const language = (lang ?? "").split(/\s/)[0];
        const label = language ? `${language} example` : "example";
        return `<pre data-copy-label="${escape(label)}"><code${language ? ` data-language="${escape(language)}"` : ""}>${escape(text)}</code></pre>\n`;
      },
      // The Markdown is ours, but show any HTML in it as text rather than run it.
      html({ text }) {
        return escape(text);
      },
    },
  });
  return marked.parse(markdown);
}

/** The first paragraph, as plain text, for the page's description. */
function description(markdown) {
  const paragraph = markdown.split(/\n\n/).find((block) => /^[A-Za-z`[*]/.test(block.trim()) && !block.startsWith("#")) ?? "";
  return paragraph.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*]/g, "").replace(/\s+/g, " ").trim().slice(0, 300);
}

/** The whole page around the rendered Markdown. */
export function guidePage(entry, html, markdown, pages) {
  const navigation = ["Guides", "Components"]
    .map((group) => {
      const items = pages
        .filter((page) => page.group === group)
        .map((page) => `<li><a href="/${page.page}"${page === entry ? ' aria-current="page"' : ""}>${escape(page.name)}</a></li>`)
        .join("\n            ");
      return `<h2>${group}</h2>
          <ul>
            ${items}
          </ul>`;
    })
    .join("\n          ");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escape(entry.name)} · AI chat components</title>
    <meta name="description" content="${escape(description(markdown))}" />
    <link rel="stylesheet" href="/src/styles/base.css" />
    <link rel="stylesheet" href="/src/styles/guide.css" />
  </head>
  <body>
    <div class="guide">
      <header class="guide-header">
        <a class="guide-home" href="/">AI chat components</a>
        <nav aria-label="Site">
          <a href="/experiments/chat-shell.html">Chat demo</a>
          <a href="/experiments/ai-composer.html">Every component</a>
          <a href="https://github.com/samyakbhuta/ui-components">GitHub</a>
        </nav>
      </header>
      <nav class="guide-nav" aria-label="Guides and components">
        <details open>
          <summary>All guides</summary>
          ${navigation}
        </details>
      </nav>
      <main class="guide-content" id="content">
${html}
      </main>
      <footer class="guide-footer">
        <a href="${repo}${entry.source}">Edit this page on GitHub</a>
      </footer>
    </div>
    <script type="module" src="/src/guide.ts"></script>
  </body>
</html>
`;
}

/** Every page, rendered. */
export function renderGuides(root) {
  const pages = guideSources(root);
  return pages.map((entry) => {
    const markdown = readFileSync(join(root, entry.source), "utf8");
    return { ...entry, html: guidePage(entry, renderGuide(markdown, entry.source, pages), markdown, pages) };
  });
}

/** Writes every page into guides/, replacing what was there, and returns their paths. */
export function writeGuides(root) {
  rmSync(join(root, "guides"), { recursive: true, force: true });
  return renderGuides(root).map(({ page, html }) => {
    const file = join(root, page);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
    return page;
  });
}

/** A Vite plugin that writes the pages, builds them with the site, and rewrites them in dev when the Markdown changes. */
export function guidePages(root) {
  return {
    name: "guide-pages",
    config() {
      const input = Object.fromEntries(writeGuides(root).map((page) => [page.replace(/\.html$/, "").replace(/\//g, "-"), join(root, page)]));
      return { build: { rollupOptions: { input } } };
    },
    configureServer(server) {
      const sources = guideSources(root).map((entry) => join(root, entry.source));
      server.watcher.add(sources);
      server.watcher.on("change", (file) => {
        if (!sources.includes(file)) return;
        writeGuides(root);
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}
