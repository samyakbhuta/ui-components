import "@ui-sdk/web/button";
import "@ui-sdk/web/hover-card";
import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-sources.css?inline";

/** One source a reply drew on. */
export type Source = {
  title: string;
  url: string;
  /** A line or two about it, shown in the preview. */
  description?: string;
  /** The site's name. Defaults to the address's host, like "developer.mozilla.org". */
  site?: string;
};

/** Every word `<ai-sources>` shows or announces. Override any of them through `strings`. */
export type SourcesStrings = {
  heading: string;
  showMore: (count: number) => string;
  showFewer: string;
  citationName: (number: number, title: string) => string;
};

export const defaultSourcesStrings: SourcesStrings = {
  heading: "Sources",
  showMore: (count) => `Show ${count} more`,
  showFewer: "Show fewer",
  citationName: (number, title) => `Source ${number}: ${title}`,
};

/** Only web addresses become links; anything else, like `javascript:`, shows as plain text. */
export function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}

export function siteOf(source: Source): string {
  if (source.site) return source.site;
  const url = safeUrl(source.url);
  return url ? new URL(url).hostname.replace(/^www\./, "") : "";
}

type HoverCard = HTMLElement & { api?: { close: () => void } };

let count = 0;

/**
 * `<ai-sources>`: the numbered list of sources a reply drew on. Inside an `<ai-message>`, the
 * reply's `[1]` markers become links to these sources, with a preview on hover or focus.
 * See README.md beside this file.
 *
 * @customElement ai-sources
 */
export class AiSourcesElement extends BaseElement {
  static observedAttributes = ["max"];

  #sources: Source[] = [];
  #strings: SourcesStrings = defaultSourcesStrings;
  #expanded = false;
  #rendered = false;
  #id = `ai-sources-${++count}`;

  get sources(): Source[] {
    return this.#sources;
  }
  set sources(value: Source[]) {
    this.#sources = [...(value ?? [])];
    if (this.#rendered) this.#render();
    this.#changed();
  }

  /** How many sources to show before "Show N more". Unset shows them all. */
  get max(): number | null {
    const value = Number(this.getAttribute("max"));
    return this.hasAttribute("max") && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  }
  set max(value: number | null) {
    if (value === null) this.removeAttribute("max");
    else this.setAttribute("max", String(value));
  }

  get strings(): SourcesStrings {
    return this.#strings;
  }
  set strings(value: Partial<SourcesStrings>) {
    this.#strings = { ...defaultSourcesStrings, ...value };
    if (this.#rendered) this.#render();
    this.#changed();
  }

  /** The id of the preview card that citations point at with `for`. */
  get cardId(): string {
    return `${this.id || this.#id}-card`;
  }

  /**
   * A citation marker for source `number` (counting from 1), for `<ai-message>` or your own
   * renderer: a link to the source that previews it on hover or focus. Null for a number
   * with no source.
   */
  citation(number: number): HTMLElement | null {
    const source = this.#sources[number - 1];
    if (!source) return null;
    const url = safeUrl(source.url);
    const name = this.#strings.citationName(number, source.title);
    if (!url) {
      const plain = document.createElement("sup");
      plain.dataset.part = "citation";
      plain.textContent = String(number);
      plain.title = name;
      return plain;
    }
    const trigger = document.createElement("ui-hover-card-trigger") as HTMLElement & { payload?: unknown };
    trigger.payload = { number, source };
    trigger.setAttribute("for", this.cardId);
    trigger.dataset.part = "citation-trigger";
    const link = document.createElement("a");
    link.dataset.part = "citation";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = String(number);
    link.setAttribute("aria-label", name);
    trigger.append(link);
    return trigger;
  }

  connectedCallback() {
    if (this.#rendered) return;
    this.#rendered = true;
    this.#render();
    this.#changed();
  }

  attributeChangedCallback(_name: string, previous: string | null, next: string | null) {
    if (previous !== next && this.#rendered) this.#render();
  }

  /** Tells a surrounding `<ai-message>` to link its citations again. */
  #changed() {
    if (this.isConnected) this.dispatchEvent(new CustomEvent("sourceschange", { bubbles: true, composed: true }));
  }

  #render() {
    const s = this.#strings;
    const headingId = `${this.id || this.#id}-heading`;
    const heading = document.createElement("div");
    heading.dataset.part = "heading";
    heading.id = headingId;
    heading.textContent = s.heading;

    const list = document.createElement("ol");
    list.dataset.part = "list";
    list.setAttribute("aria-labelledby", headingId);
    const limit = this.max;
    const shown = limit && !this.#expanded ? this.#sources.slice(0, limit) : this.#sources;
    shown.forEach((source, index) => list.append(this.#item(source, index + 1)));

    const parts: Node[] = [heading, list];
    if (limit && this.#sources.length > limit) {
      const toggle = document.createElement("ui-button");
      toggle.dataset.part = "more";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = this.#expanded ? s.showFewer : s.showMore(this.#sources.length - limit);
      button.setAttribute("aria-expanded", String(this.#expanded));
      toggle.append(button);
      toggle.addEventListener("action", () => {
        this.#expanded = !this.#expanded;
        this.#render();
        // Opening moves focus to the first source that appeared; closing keeps it on the button.
        const target = this.#expanded
          ? this.querySelector<HTMLElement>(`[data-part='source']:nth-child(${limit + 1}) [data-part='title']`)
          : this.querySelector<HTMLElement>("[data-part='more'] button");
        if (target instanceof HTMLSpanElement) target.tabIndex = -1;
        target?.focus();
      });
      parts.push(toggle);
    }
    parts.push(this.#card());
    this.replaceChildren(...parts);
    this.toggleAttribute("data-empty", this.#sources.length === 0);
  }

  #item(source: Source, number: number) {
    const item = document.createElement("li");
    item.dataset.part = "source";
    item.id = `${this.id || this.#id}-${number}`;
    const marker = document.createElement("span");
    marker.dataset.part = "number";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = String(number);
    const url = safeUrl(source.url);
    const title = document.createElement(url ? "a" : "span");
    title.dataset.part = "title";
    title.textContent = source.title;
    if (url && title instanceof HTMLAnchorElement) {
      title.href = url;
      title.target = "_blank";
      title.rel = "noopener noreferrer";
    }
    const site = document.createElement("span");
    site.dataset.part = "site";
    site.textContent = siteOf(source);
    item.append(marker, title, site);
    return item;
  }

  /** One preview card, shared by every citation that points at these sources. */
  #card() {
    const card = document.createElement("ui-hover-card") as HoverCard;
    card.id = this.cardId;
    card.dataset.part = "card";
    const content = document.createElement("ui-hover-card-content");
    content.dataset.part = "preview";
    content.hidden = true;
    const site = document.createElement("p");
    site.dataset.part = "preview-site";
    const title = document.createElement("p");
    title.dataset.part = "preview-title";
    const description = document.createElement("p");
    description.dataset.part = "preview-description";
    content.append(site, title, description);
    card.append(content);
    card.addEventListener("payloadchange", (event) => {
      const value = (event as CustomEvent<{ value?: { number: number; source: Source } }>).detail.value;
      if (!value) return;
      site.textContent = `${value.number} · ${siteOf(value.source)}`;
      title.textContent = value.source.title;
      description.textContent = value.source.description ?? "";
      description.hidden = !value.source.description;
    });
    return card;
  }
}

/** The events this element fires, by name. */
export type SourcesEvents = {
  sourceschange: CustomEvent<null>;
};

adoptStyles(styles);
define("ai-sources", AiSourcesElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-sources": AiSourcesElement;
  }
  interface HTMLElementEventMap extends SourcesEvents {}
}
