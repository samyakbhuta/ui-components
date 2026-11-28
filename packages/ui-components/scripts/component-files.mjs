// Reads each component's stylesheet and README as text, for tests that check them. Tests import
// CSS as an empty string, so they can't import it.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Each component folder in `src`, with its stylesheet and README. */
export function readComponents(src) {
  return readdirSync(src, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("ai-"))
    .map(({ name }) => ({
      name,
      css: readFileSync(join(src, name, `${name}.css`), "utf8"),
      readme: readFileSync(join(src, name, "README.md"), "utf8"),
    }));
}
