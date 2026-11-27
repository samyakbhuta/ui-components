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

// The version `@beta` installs today, from jsDelivr's mirror of npm, which pages can read. The
// site deploys from main, which can be ahead of npm, so it doesn't use its own package.json.
const latest = document.querySelector<HTMLElement>(".home-version")!;
fetch("https://data.jsdelivr.com/v1/package/resolve/npm/@samyakbhuta/ui-components@beta")
  .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
  .then(({ version }: { version?: string }) => {
    if (!version || !/^[\w.+-]+$/.test(version)) return;
    latest.querySelector("a")!.textContent = version;
    latest.hidden = false;
  })
  .catch(() => {
    // Offline or blocked: the line stays hidden.
  });
