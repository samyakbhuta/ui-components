// After `vite build` and `tsc`: ship each component's CSS as a plain file, copy the component
// READMEs into docs/, and point the type declarations at .js files, as published packages need.
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const src = join(root, "src");
const dist = join(root, "dist");

await mkdir(join(dist, "css"), { recursive: true });
await mkdir(join(root, "docs"), { recursive: true });
for (const entry of await readdir(src, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const name = entry.name;
  await cp(join(src, name, `${name}.css`), join(dist, "css", `${name}.css`));
  await cp(join(src, name, "README.md"), join(root, "docs", `${name}.md`));
}

async function* declarations(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) yield* declarations(path);
    else if (entry.name.endsWith(".d.ts")) yield path;
  }
}
for await (const file of declarations(dist)) {
  const text = await readFile(file, "utf8");
  await writeFile(file, text.replace(/(from\s+|import\s*\(\s*|import\s+)(["'])(\.\.?\/[^"']+)\.ts\2/g, "$1$2$3.js$2"));
}
// Events dispatched through a shared helper show up in the manifest as "type"; the real ones are
// declared with @fires, so drop the placeholder.
const manifestPath = join(dist, "custom-elements.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
for (const module of manifest.modules) {
  for (const declaration of module.declarations ?? []) {
    if (declaration.events) declaration.events = declaration.events.filter((event) => event.name !== "type");
  }
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// Editor support, from the built elements: each one's observedAttributes, by tag.
const { attributesOf, buildEditorData } = await import("./editor-data.mjs");
const built = await import(join(dist, "index.js"));
const attributes = attributesOf(built);
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const { vscode, webTypes } = buildEditorData({ root, attributes, version });

// The manifest analyzer only sees element classes, so an element made from a ui-sdk primitive
// with `createParts` gets its entry from the editor data instead.
const listed = new Set(manifest.modules.flatMap((module) => (module.declarations ?? []).map((declaration) => declaration.tagName)));
for (const tag of vscode.tags.filter((tag) => !listed.has(tag.name))) {
  const events = webTypes.contributions.html.elements.find((element) => element.name === tag.name)?.events ?? [];
  manifest.modules.push({
    kind: "javascript-module",
    path: `src/${tag.name}/${tag.name}.ts`,
    declarations: [
      {
        kind: "class",
        name: tag.name.replace(/(^|-)(\w)/g, (_, __, letter) => letter.toUpperCase()) + "Element",
        tagName: tag.name,
        customElement: true,
        description: tag.description.value,
        attributes: tag.attributes.map((attribute) => ({ name: attribute.name, description: attribute.description?.value })),
        events: events.map((event) => ({ name: event.name, description: event.description, type: { text: event.arguments[0]?.type } })),
      },
    ],
  });
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(join(dist, "vscode.html-custom-data.json"), `${JSON.stringify(vscode, null, 2)}\n`);
await writeFile(join(dist, "web-types.json"), `${JSON.stringify(webTypes, null, 2)}\n`);

console.log("Copied CSS and READMEs, cleaned the elements manifest, pointed declarations at .js files, and wrote the editor data.");
