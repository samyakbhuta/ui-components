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

console.log("Copied CSS and READMEs, cleaned the elements manifest, and pointed declarations at .js files.");
