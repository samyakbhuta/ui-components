const adopted = new Set<string>();

/**
 * Adds a component's CSS to the page once, so the package works without any bundler setup for
 * CSS. Uses a constructed stylesheet where the browser has them, and a <style> element otherwise.
 * It styles the document only: inside a shadow root, load the matching .css file there too.
 */
export function adoptStyles(css: string) {
  if (!css || typeof document === "undefined" || adopted.has(css)) return;
  adopted.add(css);
  if ("adoptedStyleSheets" in Document.prototype && "replaceSync" in CSSStyleSheet.prototype) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } else {
    const style = document.createElement("style");
    style.dataset.uiComponents = "";
    style.textContent = css;
    document.head.append(style);
  }
}

/** HTMLElement in a browser, and a stand-in on a server, so importing a component there does nothing. */
export const BaseElement = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

/** Registers a tag once, and only where custom elements exist. */
export function define(tag: string, element: CustomElementConstructor) {
  if (globalThis.customElements && !customElements.get(tag)) customElements.define(tag, element);
}
