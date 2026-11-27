import { showValue } from "../format.ts";
import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-tool-call.css?inline";

/** Every word `<ai-tool-call>` shows or announces. Override any of them through `strings`. */
export type ToolCallStrings = {
  /** The summary while the tool runs, unless `label` says otherwise. */
  running: (name: string) => string;
  /** The summary once it's done, unless `summary` says otherwise. */
  done: (name: string) => string;
  /** The summary when it failed. */
  failed: (name: string) => string;
  input: string;
  output: string;
  error: string;
};

export const defaultToolCallStrings: ToolCallStrings = {
  running: (name) => `Running ${name || "a tool"}…`,
  done: (name) => `Ran ${name || "a tool"}`,
  failed: (name) => `${name || "The tool"} failed`,
  input: "Input",
  output: "Result",
  error: "Error",
};

export type ToolCallStatus = "running" | "done" | "error";

const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const doneIcon = icon('<path d="m5 12 5 5L20 7"/>');
const errorIcon = icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');

/** How long after connecting the start is announced, so the live region exists first. */
const announceDelay = 100;

const show = showValue;

/**
 * `<ai-tool-call>`: one step an AI agent takes, like searching the web or running code. Shows
 * whether it's running, done or failed, and opens to show what went in and what came back.
 * See README.md beside this file.
 *
 * @customElement ai-tool-call
 */
export class AiToolCallElement extends BaseElement {
  static observedAttributes = ["name", "label", "summary", "status"];

  #strings: ToolCallStrings = defaultToolCallStrings;
  #input: unknown = undefined;
  #output: unknown = undefined;
  #error = "";
  #rendered = false;
  #ran = false;
  #announce?: ReturnType<typeof setTimeout>;

  /** The tool's name, like `search_web`. */
  get name(): string {
    return this.getAttribute("name") ?? "";
  }
  set name(value: string) {
    this.setAttribute("name", value);
  }

  /** The summary while it runs, like "Searching the web…". */
  get label(): string {
    return this.getAttribute("label") ?? "";
  }
  set label(value: string) {
    this.setAttribute("label", value);
  }

  /** The summary once it's done, like "Searched 4 sites". */
  get summary(): string {
    return this.getAttribute("summary") ?? "";
  }
  set summary(value: string) {
    this.setAttribute("summary", value);
  }

  /** "running" (the default), "done" or "error". */
  get status(): ToolCallStatus {
    const status = this.getAttribute("status");
    return status === "done" || status === "error" ? status : "running";
  }
  set status(value: ToolCallStatus) {
    this.setAttribute("status", value);
  }

  /** What the tool was called with. Objects show as JSON. */
  get input(): unknown {
    return this.#input;
  }
  set input(value: unknown) {
    this.#input = value;
    if (this.#rendered) this.#render();
  }

  /** What the tool returned. Objects show as JSON. Text written inside the element is the starting output. */
  get output(): unknown {
    return this.#output;
  }
  set output(value: unknown) {
    this.#output = value;
    if (this.#rendered) this.#render();
  }

  /** Why it failed, shown when `status` is "error". */
  get error(): string {
    return this.#error;
  }
  set error(value: string) {
    this.#error = value ?? "";
    if (this.#rendered) this.#render();
  }

  get strings(): ToolCallStrings {
    return this.#strings;
  }
  set strings(value: Partial<ToolCallStrings>) {
    this.#strings = { ...defaultToolCallStrings, ...value };
    if (this.#rendered) this.#render();
  }

  /** Marks the call as done, with what it returned. */
  done(output?: unknown) {
    if (output !== undefined) this.#output = output;
    if (this.status === "done") this.#render();
    else this.status = "done";
  }

  /** Marks the call as failed, with why. */
  fail(error?: string) {
    if (error !== undefined) this.#error = error;
    if (this.status === "error") this.#render();
    else this.status = "error";
  }

  connectedCallback() {
    if (!this.#rendered) {
      const written = this.textContent!.trim();
      if (written && this.#output === undefined) this.#output = written;
      this.#rendered = true;
      this.#render();
    }
    if (this.status === "running") this.#start();
  }

  disconnectedCallback() {
    clearTimeout(this.#announce);
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null) {
    if (previous === next || !this.#rendered) return;
    this.#render();
    if (name !== "status") return;
    if (this.status === "running") this.#start();
    else if (this.#ran) {
      clearTimeout(this.#announce);
      this.#say(this.#summaryText());
    }
  }

  #start() {
    this.#ran = true;
    this.#say("");
    clearTimeout(this.#announce);
    this.#announce = setTimeout(() => this.#say(this.#summaryText()), announceDelay);
  }

  #summaryText() {
    const s = this.#strings;
    if (this.status === "running") return this.label || s.running(this.name);
    if (this.status === "error") return s.failed(this.name);
    return this.summary || s.done(this.name);
  }

  #render() {
    const open = this.querySelector("details")?.open ?? false;
    const focused = this.querySelector("[data-part='summary']") === document.activeElement;
    const announced = this.querySelector("[data-part='announcement']")?.textContent ?? "";
    const s = this.#strings;
    const status = this.status;
    const sections: [string, string, string][] = [];
    const input = show(this.#input);
    const output = show(this.#output);
    if (input) sections.push(["input", s.input, input]);
    if (status === "error" && this.#error) sections.push(["error", s.error, this.#error]);
    else if (status !== "running" && output) sections.push(["output", s.output, output]);

    const summary = document.createElement(sections.length ? "summary" : "div");
    summary.dataset.part = "summary";
    const mark = document.createElement("span");
    mark.dataset.part = "icon";
    mark.innerHTML = status === "done" ? doneIcon : status === "error" ? errorIcon : "";
    const label = document.createElement("span");
    label.dataset.part = "label";
    label.textContent = this.#summaryText();
    label.toggleAttribute("data-shimmer", status === "running");
    summary.append(mark, label);

    let root: HTMLElement = summary;
    if (sections.length) {
      const details = document.createElement("details");
      details.dataset.part = "details";
      details.open = open;
      const panel = document.createElement("div");
      panel.dataset.part = "panel";
      for (const [part, title, text] of sections) {
        const heading = document.createElement("div");
        heading.dataset.part = "section-label";
        heading.textContent = title;
        const pre = document.createElement("pre");
        pre.dataset.part = part;
        // A long result scrolls, so it has to be reachable from the keyboard.
        pre.tabIndex = 0;
        pre.setAttribute("aria-label", title);
        pre.textContent = text;
        panel.append(heading, pre);
      }
      details.append(summary, panel);
      root = details;
    }
    const announcement = document.createElement("span");
    announcement.dataset.part = "announcement";
    announcement.setAttribute("role", "status");
    announcement.textContent = announced;
    this.replaceChildren(root, announcement);
    if (focused && sections.length) summary.focus();
    this.toggleAttribute("data-running", status === "running");
    this.toggleAttribute("data-done", status === "done");
    this.toggleAttribute("data-error", status === "error");
    if (status === "running") this.setAttribute("aria-busy", "true");
    else this.removeAttribute("aria-busy");
  }

  #say(text: string) {
    const announcement = this.querySelector("[data-part='announcement']");
    if (announcement) announcement.textContent = text;
  }
}

adoptStyles(styles);
define("ai-tool-call", AiToolCallElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-tool-call": AiToolCallElement;
  }
}
