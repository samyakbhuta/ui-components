/**
 * A small Markdown renderer for chat messages.
 *
 * Model output is untrusted, so this never parses it as HTML: every node is created with
 * `document.createElement` and filled with text nodes. Raw HTML in the source shows as text, and
 * links keep only http, https and mailto addresses.
 *
 * Covered: paragraphs, line breaks, headings, emphasis, strong, strikethrough, inline code,
 * fenced code blocks, links and bare URLs, block quotes, nested lists, tables and rules.
 */

export type MarkdownBlock = {
  /** The source text of the block, used to keep unchanged blocks while a reply streams in. */
  source: string;
  node: HTMLElement;
};

import type { Highlighter } from "./highlight.ts";

export type MarkdownOptions = {
  /** Colours code blocks. Return null to show a block plain. */
  highlight?: Highlighter | null;
  /** The visible text of each code block's copy button. */
  copyLabel?: string;
  /** The accessible name of each code block's copy button, given the block's language. */
  copyName?: (language: string) => string;
  /** Headings start at this level, so a reply's "#" fits under the page's own headings. */
  headingOffset?: number;
};

type RawBlock =
  | { type: "code"; language: string; text: string; source: string }
  | { type: "heading"; level: number; text: string; source: string }
  | { type: "quote"; body: string; source: string }
  | { type: "list"; ordered: boolean; start: number; items: string[]; source: string }
  | { type: "rule"; source: string }
  | { type: "table"; header: string[]; align: string[]; rows: string[][]; source: string }
  | { type: "paragraph"; text: string; source: string };

const maxDepth = 8;

const fenceStart = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;
const headingLine = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const ruleLine = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const quoteLine = /^ {0,3}>/;
const listItem = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const tableDivider = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const blank = /^[ \t]*$/;

const indentOf = (line: string) => line.match(/^[ \t]*/)![0].replace(/\t/g, "    ").length;

function startsBlock(lines: string[], index: number) {
  const line = lines[index];
  return (
    fenceStart.test(line) ||
    headingLine.test(line) ||
    ruleLine.test(line) ||
    quoteLine.test(line) ||
    listItem.test(line) ||
    isTableStart(lines, index)
  );
}

/** A table starts with a row of cells and a divider with as many columns, like `|---|:--:|`. */
function isTableStart(lines: string[], index: number) {
  const header = lines[index];
  const divider = lines[index + 1];
  return (
    header.includes("|") &&
    divider !== undefined &&
    tableDivider.test(divider) &&
    splitRow(header).length === splitRow(divider).length
  );
}

function splitRow(line: string) {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

/** Splits Markdown into top-level blocks. */
function parseBlocks(source: string): RawBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: RawBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (blank.test(line)) {
      i++;
      continue;
    }
    const start = i;
    const take = () => lines.slice(start, i).join("\n");

    const fence = line.match(fenceStart);
    if (fence) {
      const marker = fence[1];
      const close = new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`);
      const body: string[] = [];
      i++;
      // An unclosed fence runs to the end, which is what a code block looks like mid-stream.
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push({ type: "code", language: fence[2], text: body.join("\n"), source: take() });
      continue;
    }

    const heading = line.match(headingLine);
    if (heading) {
      i++;
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2], source: take() });
      continue;
    }

    if (ruleLine.test(line)) {
      i++;
      blocks.push({ type: "rule", source: take() });
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map((cell) =>
        cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : cell.startsWith(":") ? "left" : "",
      );
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && !blank.test(lines[i]) && lines[i].includes("|")) rows.push(splitRow(lines[i++]));
      blocks.push({ type: "table", header, align, rows, source: take() });
      continue;
    }

    if (quoteLine.test(line)) {
      const body: string[] = [];
      while (i < lines.length && !blank.test(lines[i]) && (quoteLine.test(lines[i]) || !startsBlock(lines, i))) {
        body.push(lines[i++].replace(/^ {0,3}> ?/, ""));
      }
      blocks.push({ type: "quote", body: body.join("\n"), source: take() });
      continue;
    }

    const first = line.match(listItem);
    if (first) {
      const ordered = /\d/.test(first[2]);
      const baseIndent = indentOf(first[1]);
      const contentIndent = baseIndent + first[2].length + 1;
      const items: string[][] = [];
      while (i < lines.length) {
        const current = lines[i];
        const item = current.match(listItem);
        if (item && indentOf(item[1]) < contentIndent) {
          // A different kind of marker at this level starts a new list.
          if (/\d/.test(item[2]) !== ordered) break;
          items.push([item[3]]);
          i++;
          continue;
        }
        if (blank.test(current)) {
          // A blank line continues the list only if more of it follows.
          const next = lines.slice(i + 1).findIndex((after) => !blank.test(after));
          const following = next === -1 ? undefined : lines[i + 1 + next];
          if (following !== undefined && (indentOf(following) >= contentIndent || (listItem.test(following) && indentOf(following) < contentIndent))) {
            items[items.length - 1].push("");
            i++;
            continue;
          }
          break;
        }
        if (indentOf(current) >= contentIndent || !startsBlock(lines, i)) {
          // Indented lines belong to the item; unindented ones continue its paragraph.
          const dedent = Math.min(indentOf(current), contentIndent);
          items[items.length - 1].push(current.replace(/^[ \t]*/, (space) => " ".repeat(Math.max(0, space.replace(/\t/g, "    ").length - dedent))));
          i++;
          continue;
        }
        break;
      }
      blocks.push({
        type: "list",
        ordered,
        start: ordered ? Number.parseInt(first[2], 10) : 1,
        items: items.map((itemLines) => itemLines.join("\n")),
        source: take(),
      });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && !blank.test(lines[i]) && (paragraph.length === 0 || !startsBlock(lines, i))) {
      paragraph.push(lines[i++].trim());
    }
    blocks.push({ type: "paragraph", text: paragraph.join("\n"), source: take() });
  }

  return blocks;
}

// ---- Inline -----------------------------------------------------------------------------------

const inlinePattern = new RegExp(
  [
    String.raw`\\(?<escaped>[\\\x60*_{}\[\]()#+\-.!~>|])`,
    String.raw`(?<ticks>\x60+)(?<code>[\s\S]*?[^\x60])\k<ticks>(?!\x60)`,
    String.raw`\[(?<linkText>[^\]\n]+)\]\((?<href>[^()\s]*(?:\([^()\s]*\)[^()\s]*)*)(?:[ \t]+"[^"]*")?\)`,
    String.raw`(?<url>\bhttps?:\/\/[^\s<>]*[^\s<>.,;:!?'")\]*_~])`,
    String.raw`\*\*(?=\S)(?<strong>[\s\S]+?)(?<=\S)\*\*(?!\*)`,
    String.raw`__(?=\S)(?<strongUnderscore>[\s\S]+?)(?<=\S)__(?!_)`,
    String.raw`~~(?=\S)(?<del>[\s\S]+?)(?<=\S)~~`,
    String.raw`(?<![\w*\\])\*(?=[^\s*])(?<em>[\s\S]*?[^\s*\\])\*(?![\w*])`,
    String.raw`(?<![\w\\])_(?=[^\s_])(?<emUnderscore>[\s\S]*?[^\s_\\])_(?!\w)`,
  ].join("|"),
  "g",
);

const safeHref = (href: string) => (/^(https?:|mailto:)/i.test(href) ? href : null);

function textWithBreaks(text: string): Node[] {
  const nodes: Node[] = [];
  text.split("\n").forEach((part, index) => {
    if (index > 0) nodes.push(document.createElement("br"));
    if (part) nodes.push(document.createTextNode(part));
  });
  return nodes;
}

function link(href: string, content: Node[]) {
  const safe = safeHref(href);
  if (!safe) return content;
  const anchor = document.createElement("a");
  anchor.href = safe;
  if (!safe.startsWith("mailto:")) {
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  }
  anchor.append(...content);
  return [anchor];
}

/** Turns inline Markdown into DOM nodes. */
export function renderInline(text: string, depth = 0): Node[] {
  if (depth > maxDepth) return textWithBreaks(text);
  const nodes: Node[] = [];
  let last = 0;
  for (const match of text.matchAll(inlinePattern)) {
    const groups = match.groups!;
    nodes.push(...textWithBreaks(text.slice(last, match.index)));
    last = match.index! + match[0].length;

    if (groups.escaped !== undefined) {
      nodes.push(document.createTextNode(groups.escaped));
    } else if (groups.code !== undefined) {
      const code = document.createElement("code");
      const content = groups.code.replace(/\n/g, " ");
      code.textContent = /^ .* $/.test(content) ? content.slice(1, -1) : content;
      nodes.push(code);
    } else if (groups.linkText !== undefined) {
      nodes.push(...link(groups.href, renderInline(groups.linkText, depth + 1)));
    } else if (groups.url !== undefined) {
      nodes.push(...link(groups.url, [document.createTextNode(groups.url)]));
    } else {
      const [tag, content] =
        groups.strong !== undefined || groups.strongUnderscore !== undefined
          ? ["strong", groups.strong ?? groups.strongUnderscore]
          : groups.del !== undefined
            ? ["del", groups.del]
            : ["em", groups.em ?? groups.emUnderscore];
      const element = document.createElement(tag);
      element.append(...renderInline(content, depth + 1));
      nodes.push(element);
    }
  }
  nodes.push(...textWithBreaks(text.slice(last)));
  return nodes;
}

// ---- Blocks -----------------------------------------------------------------------------------

function element<K extends keyof HTMLElementTagNameMap>(tag: K, children: Node[] = []) {
  const node = document.createElement(tag);
  node.append(...children);
  return node;
}

function renderBlock(block: RawBlock, options: MarkdownOptions, depth: number): HTMLElement {
  switch (block.type) {
    case "paragraph":
      return element("p", renderInline(block.text, depth));
    case "heading": {
      const level = Math.min(6, block.level + (options.headingOffset ?? 2));
      const heading = document.createElement(`h${level}`);
      heading.append(...renderInline(block.text, depth));
      return heading;
    }
    case "rule":
      return document.createElement("hr");
    case "quote":
      return element(
        "blockquote",
        depth < maxDepth
          ? parseBlocks(block.body).map((inner) => renderBlock(inner, options, depth + 1))
          : [element("p", textWithBreaks(block.body))],
      );
    case "code": {
      const wrapper = document.createElement("div");
      wrapper.dataset.part = "code-block";
      const header = document.createElement("div");
      header.dataset.part = "code-header";
      const language = document.createElement("span");
      language.dataset.part = "code-language";
      language.textContent = block.language;
      const copy = document.createElement("button");
      copy.type = "button";
      copy.dataset.part = "code-copy";
      copy.dataset.button = "ghost";
      copy.textContent = options.copyLabel ?? "Copy";
      copy.setAttribute("aria-label", options.copyName?.(block.language) ?? (block.language ? `Copy ${block.language} code` : "Copy code"));
      header.append(language, copy);
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      if (block.language) code.className = `language-${block.language.replace(/[^\w+#-]/g, "")}`;
      const highlighted = options.highlight?.(block.text, block.language);
      if (highlighted) code.append(...highlighted);
      else code.textContent = block.text;
      pre.append(code);
      wrapper.append(header, pre);
      return wrapper;
    }
    case "list": {
      const list = document.createElement(block.ordered ? "ol" : "ul");
      if (block.ordered && block.start !== 1) (list as HTMLOListElement).start = block.start;
      for (const item of block.items) {
        const li = document.createElement("li");
        const inner = depth < maxDepth ? parseBlocks(item) : [];
        // Without blank lines the item is "tight": its text sits in the item, not in paragraphs.
        const tight = !/\n[ \t]*\n/.test(item);
        if (inner.length === 0) li.append(...textWithBreaks(item));
        for (const child of inner) {
          if (tight && child.type === "paragraph") li.append(...renderInline(child.text, depth + 1));
          else li.append(renderBlock(child, options, depth + 1));
        }
        list.append(li);
      }
      return list;
    }
    case "table": {
      const wrapper = document.createElement("div");
      wrapper.dataset.part = "table";
      // A wide table scrolls sideways, so it takes focus to scroll from the keyboard.
      wrapper.tabIndex = 0;
      wrapper.setAttribute("role", "region");
      wrapper.setAttribute("aria-label", block.header.join(", "));
      const table = document.createElement("table");
      const cell = (tag: "th" | "td", text: string, column: number) => {
        const node = element(tag, renderInline(text, depth + 1));
        if (tag === "th") node.setAttribute("scope", "col");
        if (block.align[column]) node.style.textAlign = block.align[column];
        return node;
      };
      table.append(
        element("thead", [element("tr", block.header.map((text, column) => cell("th", text, column)))]),
        element(
          "tbody",
          block.rows.map((row) => element("tr", block.header.map((_, column) => cell("td", row[column] ?? "", column)))),
        ),
      );
      wrapper.append(table);
      return wrapper;
    }
  }
}

/** Renders Markdown to one element per top-level block. */
export function renderMarkdown(source: string, options: MarkdownOptions = {}): MarkdownBlock[] {
  return parseBlocks(source).map((block) => ({ source: block.source, node: renderBlock(block, options, 0) }));
}

/** Renders plain text: paragraphs split at blank lines, with line breaks kept. */
export function renderPlainText(source: string): MarkdownBlock[] {
  return source
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => ({ source: paragraph, node: element("p", textWithBreaks(paragraph.trim())) }));
}
