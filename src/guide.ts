// The guide pages, built from the repo's Markdown by scripts/guide-pages.mjs: colours their code
// and gives each block a Copy button.
import { highlight } from "@samyakbhuta/ui-components/highlight";
import { addCopyButtons } from "./experiments/copy-code.ts";

const content = document.querySelector<HTMLElement>(".guide-content")!;

for (const code of content.querySelectorAll<HTMLElement>("pre > code[data-language]")) {
  const nodes = highlight(code.textContent ?? "", code.dataset.language!);
  if (nodes) code.replaceChildren(...nodes);
}

addCopyButtons(content);

// Wide tables scroll on their own, not the page; give keyboard users a way to scroll them too.
for (const table of content.querySelectorAll("table")) {
  const frame = document.createElement("div");
  frame.className = "guide-table";
  frame.tabIndex = 0;
  frame.setAttribute("role", "region");
  const heading = [...content.querySelectorAll("h2, h3")].filter((h) => h.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).pop();
  frame.setAttribute("aria-label", heading ? `Table: ${heading.textContent}` : "Table");
  table.replaceWith(frame);
  frame.append(table);
}

// On a phone, the list of guides starts closed so the page comes first.
const list = document.querySelector<HTMLDetailsElement>(".guide-nav details")!;
if (matchMedia("(max-width: 52rem)").matches) list.open = false;
