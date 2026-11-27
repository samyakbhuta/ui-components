// The front page: package manager tabs that remember the choice, and Copy buttons on the code.
import "@ui-sdk/web/tabs";
import { addCopyButtons } from "./experiments/copy-code.ts";

const tabs = document.querySelector<HTMLElement & { value: string | null }>(".home-install-tabs")!;
const key = "home:package-manager";
try {
  const saved = localStorage.getItem(key);
  if (saved && tabs.querySelector(`ui-tabs-tab[value="${CSS.escape(saved)}"]`)) tabs.value = saved;
} catch {
  // Storage is blocked; npm it is.
}
tabs.addEventListener("valuechange", (event) => {
  try {
    localStorage.setItem(key, String((event as CustomEvent<{ value: string }>).detail.value));
  } catch {
    // Storage is blocked; the choice lasts until the page closes.
  }
});

addCopyButtons(document.querySelector(".home")!);
