import "@ui-sdk/web/button";
import "./copy-code.css";

/** Copies text, falling back to a hidden text area where the Clipboard API isn't allowed. */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = Object.assign(document.createElement("textarea"), { value: text });
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  }
}

let status: HTMLElement | undefined;

/** Tells screen readers what happened, through one status region for the page. */
function announce(text: string) {
  if (!status) {
    status = document.createElement("span");
    status.className = "copy-status";
    status.setAttribute("role", "status");
    document.body.append(status);
  }
  const region = status;
  // Clear first, so copying twice is announced twice.
  region.textContent = "";
  requestAnimationFrame(() => (region.textContent = text));
}

/**
 * Adds a Copy button to each `pre` matching `selector` inside `root`. A `data-copy-label` on the
 * `pre`, like "install command", finishes the button's name for screen readers: "Copy install
 * command". Without one, it's "Copy code".
 */
export function addCopyButtons(root: ParentNode, selector = "pre") {
  for (const pre of root.querySelectorAll<HTMLElement>(selector)) {
    if (pre.parentElement?.classList.contains("copy-block")) continue;
    const block = document.createElement("div");
    block.className = "copy-block";
    pre.replaceWith(block);
    block.append(pre);

    const wrapper = document.createElement("ui-button");
    wrapper.className = "copy-button";
    const button = document.createElement("button");
    button.type = "button";
    const visible = document.createElement("span");
    visible.textContent = "Copy";
    const hidden = document.createElement("span");
    hidden.className = "copy-hidden";
    hidden.textContent = ` ${pre.dataset.copyLabel ?? "code"}`;
    button.append(visible, hidden);
    wrapper.append(button);

    let timer: ReturnType<typeof setTimeout> | undefined;
    wrapper.addEventListener("action", async () => {
      const copied = await copy(pre.textContent ?? "");
      visible.textContent = copied ? "Copied" : "Couldn't copy";
      announce(copied ? "Copied" : "Couldn't copy. Select the text and copy it instead.");
      clearTimeout(timer);
      timer = setTimeout(() => (visible.textContent = "Copy"), 2000);
    });
    block.append(wrapper);
  }
}
