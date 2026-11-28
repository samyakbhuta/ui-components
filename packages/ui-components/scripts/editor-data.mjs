// Editor support: what VS Code (HTML custom data) and JetBrains IDEs (web-types) need to
// complete each tag, its attributes and their values, and show their docs on hover.
//
// Nothing here is written by hand. Attribute names come from each element's
// `observedAttributes`; values from the types in `src/elements.ts`; descriptions from each
// component's README tables; and the live example links from the site's front page.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const repo = "https://github.com/samyakbhuta/ui-components/blob/main/packages/ui-components/src";
const site = "https://uisdk-components.netlify.app";

/** Markdown as editors show it: links become their text, since README links are relative. */
const plain = (markdown) =>
  markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\\\|/g, "|")
    .trim();

/** The cells of each Markdown table row in `text`, skipping header separators. */
function tableRows(text) {
  return text
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|\s*-{3}/.test(line))
    .map((line) =>
      line
        .slice(1, line.endsWith("|") ? -1 : undefined)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.trim()),
    );
}

/** The README row whose first cell names `name`, as `name` or `name="…"`. */
function rowFor(rows, name) {
  return rows.find(([first = ""]) =>
    [...first.matchAll(/`([^`]+)`/g)].some(([, token]) => token === name || token.startsWith(`${name}=`)),
  );
}

/** `export type Name = "a" | "b";` across the sources, so named unions can be expanded. */
function namedUnions(src) {
  const unions = new Map();
  const files = readdirSync(src, { recursive: true }).filter((file) => String(file).endsWith(".ts") && !String(file).endsWith(".test.ts"));
  for (const file of files) {
    const text = readFileSync(join(src, String(file)), "utf8");
    for (const [, name, body] of text.matchAll(/export type (\w+) = ((?:\s*\|?\s*"[^"]*")+);/g)) {
      unions.set(name, [...body.matchAll(/"([^"]*)"/g)].map(([, value]) => value));
    }
  }
  return unions;
}

/** Each tag's props (name → type text) and events type name, from `src/elements.ts`. */
function elementTypes(src) {
  const text = readFileSync(join(src, "elements.ts"), "utf8");
  const tags = new Map();
  for (const [, tag, props, events] of text.matchAll(/^ {2}"(ai-[\w-]+)": \{ element: \w+; props: (\w+); events: (\w+|\{\}) \};$/gm)) {
    const body = text.match(new RegExp(`export interface ${props} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
    const types = new Map([...body.matchAll(/^\s+"?([\w-]+)"?\?: ([^;]+);/gm)].map(([, name, type]) => [name, type.trim()]));
    tags.set(tag, { types, events });
  }
  return tags;
}

/** Each events type's members (name → detail type), from the component sources. */
function eventTypes(src) {
  const events = new Map();
  for (const folder of readdirSync(src).filter((name) => name.startsWith("ai-"))) {
    let text;
    try {
      text = readFileSync(join(src, folder, `${folder}.ts`), "utf8");
    } catch {
      continue;
    }
    for (const [, name, body] of text.matchAll(/export type (\w+Events) = \{([\s\S]*?)\n\};/g)) {
      events.set(name, [...body.matchAll(/^\s+(\w+): CustomEvent<(.+)>;$/gm)].map(([, event, detail]) => ({ event, detail })));
    }
  }
  return events;
}

/** How an attribute takes values: a fixed list, valueless (a flag), or free text. */
function valuesOf(type, unions) {
  if (!type) return { kind: "text" };
  // Lists only come through the property, never the attribute, so they don't count here.
  const parts = type
    .split("|")
    .map((part) => part.trim())
    .filter((part) => !["undefined", "null"].includes(part) && !part.endsWith("[]"));
  const literals = parts.flatMap((part) => (/^"[^"]*"$/.test(part) ? [part.slice(1, -1)] : unions.get(part) ?? []));
  const flag = parts.includes("boolean");
  const free = parts.some((part) => !/^"[^"]*"$/.test(part) && !unions.has(part) && part !== "boolean");
  if (literals.length && !free) return { kind: flag ? "flag-or-list" : "list", values: literals };
  if (flag && parts.length === 1) return { kind: "flag" };
  return { kind: "text" };
}

const camel = (name) => name.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/**
 * Each tag's attribute names, from a module's exports: an element class's `observedAttributes`,
 * or, for one made from a ui-sdk primitive with `createParts`, which has no class on a server,
 * the primitive's options schema (exported by the tag's name, like `approval` for `ai-approval`).
 */
export function attributesOf(exports) {
  return Object.fromEntries(
    Object.entries(exports)
      .filter(([name]) => /^Ai\w+Element$/.test(name))
      .map(([name, element]) => {
        const tag = name.replace(/Element$/, "").replace(/[A-Z]/g, (letter, index) => `${index ? "-" : ""}${letter.toLowerCase()}`);
        if (element?.observedAttributes) return [tag, element.observedAttributes];
        const schema = exports[camel(tag.slice(3))]?.options ?? {};
        const read = Object.entries(schema).filter(([, kind]) => ["string", "number", "boolean", "list"].includes(kind) || typeof kind === "function");
        return [tag, read.map(([option]) => kebab(option))];
      }),
  );
}

/**
 * Builds both files. `attributes` maps each tag to its `observedAttributes`; `root` is the
 * package folder; `version` goes in web-types.
 */
export function buildEditorData({ root, attributes, version }) {
  const src = join(root, "src");
  const unions = namedUnions(src);
  const types = elementTypes(src);
  const eventsByType = eventTypes(src);
  const home = readFileSync(join(root, "..", "..", "index.html"), "utf8");
  const examples = new Map(
    [...home.matchAll(/href="(\/experiments\/ai-composer\.html#[\w-]+)"><code>&lt;(ai-[\w-]+)&gt;<\/code>/g)].map(([, href, tag]) => [tag, `${site}${href}`]),
  );

  const elements = [...types.keys()].map((tag) => {
    const readme = readFileSync(join(src, tag, "README.md"), "utf8");
    const rows = tableRows(readme);
    const intro = plain(readme.split("\n").find((line, index) => index > 0 && line.trim() && !line.startsWith("#")) ?? "");
    const { types: props, events } = types.get(tag);

    const attrs = (attributes[tag] ?? []).map((name) => {
      const row = rowFor(rows, name);
      // Attribute tables have a Default column between the name and the description.
      const description = row ? plain(row.at(-1)) : "";
      const defaultValue = row && row.length === 3 && !/^none|^off$|^set by/.test(row[1]) ? plain(row[1]) : "";
      return {
        name,
        description: [description, defaultValue && `Default: ${defaultValue}.`].filter(Boolean).join(" "),
        ...valuesOf(props.get(name) ?? props.get(camel(name)), unions),
      };
    });

    const fired = (eventsByType.get(events) ?? []).map(({ event, detail }) => {
      const row = rowFor(rows, event);
      return { name: event, detail, description: row ? plain(row.at(-1)) : "" };
    });

    const readmeUrl = `${repo}/${tag}/README.md`;
    return { tag, intro, attrs, events: fired, readmeUrl, example: examples.get(tag) };
  });

  const vscode = {
    $schema: "https://raw.githubusercontent.com/microsoft/vscode-html-languageservice/main/docs/customData.schema.json",
    version: 1.1,
    tags: elements.map(({ tag, intro, attrs, events, readmeUrl, example }) => ({
      name: tag,
      description: {
        kind: "markdown",
        value: [intro, events.length ? `**Events:** ${events.map(({ name }) => `\`${name}\``).join(", ")}` : ""].filter(Boolean).join("\n\n"),
      },
      attributes: attrs.map((attr) => ({
        name: attr.name,
        description: attr.description ? { kind: "markdown", value: attr.description } : undefined,
        ...(attr.kind === "flag" ? { valueSet: "v" } : {}),
        ...(attr.values ? { values: attr.values.map((value) => ({ name: value })) } : {}),
      })),
      references: [
        ...(example ? [{ name: "Live example", url: example }] : []),
        { name: "API reference", url: readmeUrl },
      ],
    })),
  };

  const webTypes = {
    $schema: "https://raw.githubusercontent.com/JetBrains/web-types/master/schema/web-types.json",
    name: "@samyakbhuta/ui-components",
    version,
    "description-markup": "markdown",
    "js-types-syntax": "typescript",
    contributions: {
      html: {
        elements: elements.map(({ tag, intro, attrs, events, readmeUrl, example }) => ({
          name: tag,
          description: intro,
          "doc-url": example ?? readmeUrl,
          attributes: attrs.map((attr) => ({
            name: attr.name,
            ...(attr.description ? { description: attr.description } : {}),
            value:
              attr.kind === "flag"
                ? { kind: "no-value" }
                : attr.values
                  ? { kind: "plain", type: attr.values.map((value) => JSON.stringify(value)).join(" | "), required: attr.kind === "list" }
                  : { kind: "plain", type: "string" },
          })),
          events: events.map((event) => ({
            name: event.name,
            ...(event.description ? { description: event.description } : {}),
            arguments: [{ name: "event", type: `CustomEvent<${event.detail}>` }],
          })),
        })),
      },
    },
  };

  return { vscode, webTypes };
}
