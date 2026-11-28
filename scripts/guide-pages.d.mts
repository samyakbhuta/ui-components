/** One page: its Markdown, where its page goes, its name in the sidebar and its group. See guide-pages.mjs. */
export type GuideEntry = { source: string; page: string; name: string; group: "Guides" | "Components" };
export function guideSources(root: string): GuideEntry[];
export function slug(text: string): string;
export function resolveLink(href: string, source: string, pages: GuideEntry[]): string;
export function renderGuide(markdown: string, source: string, pages: GuideEntry[]): string;
export function guidePage(entry: GuideEntry, html: string, markdown: string, pages: GuideEntry[]): string;
export function renderGuides(root: string): (GuideEntry & { html: string })[];
export function writeGuides(root: string): string[];
export function guidePages(root: string): import("vite").Plugin;
