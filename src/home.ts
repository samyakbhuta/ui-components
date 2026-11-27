// The front page: package manager tabs that remember the choice, and Copy buttons on the code.
import "@ui-sdk/web/tabs";
import starterPage from "../examples/quick-start/index.html?raw";
import starterPackage from "../examples/quick-start/package.json?raw";
import starterReadme from "../examples/quick-start/README.md?raw";
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

/**
 * Opens the starter in StackBlitz by sending its files, the way StackBlitz's SDK does.
 * StackBlitz's import from GitHub never finishes for this repository, so this skips it, and
 * also works on preview deploys, before the starter is on main.
 */
function openInStackBlitz() {
  const form = Object.assign(document.createElement("form"), {
    method: "POST",
    action: "https://stackblitz.com/run?file=index.html",
    target: "_blank",
    rel: "noopener",
    hidden: true,
  });
  const field = (name: string, value: string) =>
    form.append(Object.assign(document.createElement("input"), { type: "hidden", name, value }));
  field("project[title]", "AI chat quick start");
  field("project[description]", "A working chat page with @samyakbhuta/ui-components");
  field("project[template]", "node");
  const files = { "index.html": starterPage, "package.json": starterPackage, "README.md": starterReadme };
  for (const [path, contents] of Object.entries(files)) field(`project[files][${path}]`, contents);
  document.body.append(form);
  form.submit();
  form.remove();
}

// The button needs this script, so it shows once it's here.
const stackblitz = document.querySelector<HTMLElement>(".home-stackblitz")!;
stackblitz.addEventListener("action", openInStackBlitz);
stackblitz.hidden = false;

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
