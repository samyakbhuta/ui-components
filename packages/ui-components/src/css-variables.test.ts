// @vitest-environment node
import { expect, test } from "vitest";
import { readComponents } from "../scripts/component-files.mjs";

// Each component's stylesheet and README, by component name.
const components = readComponents(new URL(".", import.meta.url).pathname);
const stylesheets = Object.fromEntries(components.map(({ name, css }) => [name, css]));
const readmes = Object.fromEntries(components.map(({ name, readme }) => [name, readme]));

test("no component declares its public custom properties, so they can be set on any element around it", () => {
  expect(Object.keys(stylesheets).length).toBeGreaterThanOrEqual(12);
  for (const [name, css] of Object.entries(stylesheets)) {
    expect(css, name).toContain("--_ai-");
    // A declaration on the component itself would beat a value set on `ai-chat` or `:root`.
    expect(css.match(/^\s*--ai-[a-z0-9-]+\s*:/gm), `${name} declares a public property`).toBeNull();
    // Instead, each default sits in a private property that reads the public one first.
    for (const [, privateName, value] of css.matchAll(/^\s*--_(ai-[a-z0-9-]+)\s*:\s*(.+);$/gm)) {
      expect(value.startsWith(`var(--${privateName}, `), `${name}: --_${privateName}`).toBe(true);
    }
  }
});

test("every custom property a README lists is one its component reads", () => {
  const used = new Set(Object.values(stylesheets).flatMap((css) => [...css.matchAll(/var\((--ai-[a-z0-9-]+)/g)].map((match) => match[1])));
  for (const [name, readme] of Object.entries(readmes)) {
    for (const [property] of readme.matchAll(/--ai-[a-z0-9-]+/g)) {
      expect(used.has(property), `${name}/README.md lists ${property}`).toBe(true);
    }
  }
});
