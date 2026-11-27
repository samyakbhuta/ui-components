import "@ui-sdk/web/button";
import "@ui-sdk/web/file-input";
import "@ui-sdk/web/segmented-control";
import "@ui-sdk/web/select";
import "@ui-sdk/web/textarea";
import "@ui-sdk/web/toggle";
import "@ui-sdk/web/trigger-menu";
import { formatFileSize } from "@ui-sdk/web/file-input";
import { textFieldAdapter } from "@ui-sdk/web/trigger-menu";
import type { TriggerDefinition, TriggerItemsLoader, TriggerMenuData } from "@ui-sdk/web/trigger-menu";
import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-composer.css?inline";

/** A choice in the Mode, Model or Thinking control. */
export type ComposerOption = {
  value: string;
  label: string;
  /** A second line in the Model and Thinking menus, or a tooltip on a mode. */
  description?: string;
  /** Shown but can't be chosen. */
  disabled?: boolean;
};

/** `/` commands: ui-sdk Trigger Menu data, so items can take `arguments` and `after: "submit"`. */
export type ComposerCommands = TriggerMenuData;

/** `@` references: a fixed list (groups allowed) or a search called as people type. */
export type ComposerReferences = TriggerMenuData | TriggerItemsLoader;

export type ComposerReference = { value: string; label: string };

/** What `promptsubmit` carries in `event.detail`. */
export type PromptSubmitDetail = {
  /** The prompt, trimmed. */
  text: string;
  /** The values of the chosen options, or undefined where that control is off. */
  mode?: string;
  model?: string;
  thinking?: string;
  files: File[];
  /** The `/` command at the start of the prompt, when it's one of `commands`. */
  command?: string;
  /** The `@` references still in the prompt. */
  references: ComposerReference[];
};

/** Every word the composer shows or announces. Override any of them through `strings`. */
export type ComposerStrings = {
  prompt: string;
  placeholder: string;
  send: string;
  sendDisabled: string;
  stop: string;
  attach: string;
  attachments: string;
  mode: string;
  model: string;
  thinking: string;
  voice: string;
  voiceUnsupported: string;
  listening: string;
  noMatches: string;
  enterHint: string;
  modEnterHint: (modifier: string) => string;
  fileRejected: (file: File, reason: string, limits: { maxFiles?: number; maxSize?: number }) => string;
  pastedAsFile: string;
  pastedFileName: string;
  counter: (length: number, max: number) => string;
  limitReached: string;
};

export const defaultStrings: ComposerStrings = {
  prompt: "Prompt",
  placeholder: "Ask anything…",
  send: "Send",
  sendDisabled: "Type a prompt or attach a file to send",
  stop: "Stop",
  attach: "Attach files",
  attachments: "Attachments",
  mode: "Mode",
  model: "Model",
  thinking: "Thinking",
  voice: "Voice input",
  voiceUnsupported: "Voice input isn't supported in this browser",
  listening: "Listening…",
  noMatches: "No matches",
  enterHint: "Enter to send · Shift+Enter for a new line",
  modEnterHint: (modifier) => `${modifier}+Enter to send · Enter for a new line`,
  fileRejected: (file, reason, limits) => {
    const why =
      reason === "file-type"
        ? "that type of file isn't accepted"
        : reason === "file-too-large"
          ? `it's larger than ${formatFileSize(limits.maxSize ?? 0)}`
          : reason === "too-many-files"
            ? limits.maxFiles === 1
              ? "only one file can be attached"
              : `only ${limits.maxFiles} files can be attached`
            : reason;
    return `${file.name} wasn't attached: ${why}.`;
  },
  pastedAsFile: "Long paste added as an attachment",
  pastedFileName: "Pasted text.txt",
  counter: (length, max) => `${length.toLocaleString()} / ${max.toLocaleString()}`,
  limitReached: "Character limit reached",
};

/** SVG markup for each icon. Icons are decorative: buttons are named by `strings`. */
export type ComposerIcons = { attach: string; voice: string; send: string; stop: string; chevron: string };

const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const defaultIcons: ComposerIcons = {
  attach: icon('<path d="M12 5v14M5 12h14"/>'),
  voice: icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  send: icon('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  stop: icon('<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>'),
  chevron: icon('<path d="m6 9 6 6 6-6"/>'),
};

export const defaultModes: ComposerOption[] = [
  { value: "auto", label: "Auto" },
  { value: "plan", label: "Plan" },
  { value: "accept-edits", label: "Accept-edits" },
];

export const defaultModels: ComposerOption[] = [
  { value: "opus-5.5", label: "Opus 5.5" },
  { value: "sonnet-5.5", label: "Sonnet 5.5" },
  { value: "haiku-5.5", label: "Haiku 5.5" },
];

export const defaultThinkingLevels: ComposerOption[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

/** A speech-to-text engine for voice input. The default uses the browser's Web Speech API. */
export interface SpeechRecognizer {
  readonly supported: boolean;
  start(options: {
    lang: string;
    /** Call with each finished phrase. */
    onText(text: string): void;
    /** Call once listening stops, for any reason. */
    onEnd(): void;
  }): { stop(): void };
}

type WebSpeechResult = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type WebSpeechSession = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: WebSpeechResult) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};

/** The browser's own speech recognition, where it has one. */
export function webSpeechRecognizer(): SpeechRecognizer {
  const speech = window as unknown as Record<string, (new () => WebSpeechSession) | undefined>;
  const Recognition = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
  return {
    supported: Boolean(Recognition),
    start({ lang, onText, onEnd }) {
      const session = new Recognition!();
      session.continuous = true;
      session.interimResults = false;
      session.lang = lang;
      session.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) onText(event.results[i][0].transcript.trim());
        }
      };
      session.onend = onEnd;
      session.onerror = onEnd;
      session.start();
      return { stop: () => session.stop() };
    },
  };
}

export type ComposerEvents = {
  promptsubmit: CustomEvent<PromptSubmitDetail>;
  promptstop: CustomEvent<null>;
  valuechange: CustomEvent<{ value: string }>;
  modechange: CustomEvent<{ value: string }>;
  modelchange: CustomEvent<{ value: string }>;
  thinkingchange: CustomEvent<{ value: string }>;
  fileschange: CustomEvent<{ value: File[] }>;
  filereject: CustomEvent<{ value: { file: File; reasons: string[] }[] }>;
  voicestart: CustomEvent<null>;
  voiceend: CustomEvent<null>;
};

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const flatten = (data: TriggerMenuData): ComposerReference[] =>
  data.flatMap((entry): ComposerReference[] => {
    if (typeof entry === "string") return [{ value: entry, label: entry }];
    if ("items" in entry) return flatten(entry.items as TriggerMenuData);
    if ("value" in entry) return [{ value: String(entry.value), label: entry.label ?? String(entry.value) }];
    return [];
  });

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

let instances = 0;

/** Attributes whose change rebuilds the inside; the rest update in place. */
const rebuildAttributes = ["attachments", "voice", "accept", "max-files", "max-size", "hint", "label"];
const liveAttributes = [
  "placeholder",
  "busy",
  "disabled",
  "max-length",
  "rows",
  "submit-on",
  "voice-lang",
  "history",
  "persist",
  "paste-as-file",
];

/** The most prompts `history` keeps. */
const historyLimit = 100;
/** Pastes at least this long become a file when `paste-as-file` has no number. */
const defaultPasteLimit = 2000;

type Saved = { value?: string; mode?: string; model?: string; thinking?: string; history?: string[] };

/**
 * `<ai-composer>`: the input box of an AI chat. A prompt and a Send button, plus whichever of
 * attachments, voice, Mode, Model, Thinking, `/` commands and `@` references you turn on.
 * See README.md beside this file.
 *
 * @customElement ai-composer
 * @fires promptsubmit - Send, Enter or submit(). Cancelable: preventDefault() keeps the prompt in the box.
 * @fires promptstop - Stop was pressed while busy.
 * @fires valuechange - The prompt's text changed.
 * @fires modechange - The mode changed.
 * @fires modelchange - The model changed.
 * @fires thinkingchange - The thinking level changed.
 * @fires fileschange - Files were attached or removed.
 * @fires filereject - Files broke accept, max-size or max-files.
 * @fires voicestart - Voice input started listening.
 * @fires voiceend - Voice input stopped listening.
 */
export class AiComposerElement extends BaseElement {
  static observedAttributes = [...rebuildAttributes, ...liveAttributes, "default-mode", "default-model", "default-thinking"];

  #id = `ai-composer-${++instances}`;
  #rendered = false;
  #scheduled = false;
  #slotted: HTMLElement[] = [];
  #observer = new MutationObserver((records) => this.#adopt(records));

  #modes: ComposerOption[] = [];
  #models: ComposerOption[] = [];
  #thinkingLevels: ComposerOption[] = [];
  #commands?: ComposerCommands;
  #references?: ComposerReferences;
  #strings: ComposerStrings = defaultStrings;
  #icons: ComposerIcons = defaultIcons;
  #speech?: SpeechRecognizer;

  /** Values set before the inside exists, or kept across a rebuild. */
  #pending: { value?: string; mode?: string; model?: string; thinking?: string; files?: File[]; focused?: boolean } = {};
  #picked = new Map<string, string>();
  #history: string[] = [];
  /** Where ArrowUp has got to in `history`, or -1 while not browsing it. */
  #historyIndex = -1;
  #draft = "";
  #recalling = false;
  #saveTimer?: ReturnType<typeof setTimeout>;
  #previews = new Map<File, string>();
  #restored = false;
  #atLimit = false;
  #namedGroup = false;
  #listening?: { stop(): void };
  #statusTimer?: ReturnType<typeof setTimeout>;

  // ---- Options -------------------------------------------------------------------------------

  /** Mode choices. An empty list (the default) leaves Mode out. */
  get modes() {
    return this.#modes;
  }
  set modes(value: ComposerOption[]) {
    this.#modes = value ?? [];
    this.#rebuild();
  }

  /** Model choices. An empty list (the default) leaves Model out. */
  get models() {
    return this.#models;
  }
  set models(value: ComposerOption[]) {
    this.#models = value ?? [];
    this.#rebuild();
  }

  /** Thinking levels. An empty list (the default) leaves Thinking out. */
  get thinkingLevels() {
    return this.#thinkingLevels;
  }
  set thinkingLevels(value: ComposerOption[]) {
    this.#thinkingLevels = value ?? [];
    this.#rebuild();
  }

  /** `/` commands, offered at the start of the prompt. Unset (the default) turns `/` off. */
  get commands() {
    return this.#commands;
  }
  set commands(value: ComposerCommands | undefined) {
    this.#commands = value?.length ? value : undefined;
    this.#updateTriggers();
  }

  /** `@` references: a list, or a search `(query, { signal }) => items`. Unset (the default) turns `@` off. */
  get references() {
    return this.#references;
  }
  set references(value: ComposerReferences | undefined) {
    this.#references = typeof value === "function" || value?.length ? value : undefined;
    this.#updateTriggers();
  }

  /** Words to replace. Missing keys keep their defaults. */
  get strings(): ComposerStrings {
    return this.#strings;
  }
  set strings(value: Partial<ComposerStrings>) {
    this.#strings = { ...defaultStrings, ...value };
    this.#rebuild();
  }

  /** Icons to replace, as SVG markup. Missing keys keep their defaults. */
  get icons(): ComposerIcons {
    return this.#icons;
  }
  set icons(value: Partial<ComposerIcons>) {
    this.#icons = { ...defaultIcons, ...value };
    this.#rebuild();
  }

  /** The speech engine for voice input. Defaults to the browser's own. */
  get speechRecognizer(): SpeechRecognizer {
    return (this.#speech ??= webSpeechRecognizer());
  }
  set speechRecognizer(value: SpeechRecognizer | undefined) {
    this.#speech = value;
    this.#rebuild();
  }

  // ---- State ---------------------------------------------------------------------------------

  /** The prompt's text. */
  get value(): string {
    return this.#textarea?.value ?? this.#pending.value ?? "";
  }
  set value(text: string) {
    if (this.#rendered) this.#prompt!.api.setValue(text);
    else this.#pending.value = text;
  }

  get mode(): string | undefined {
    return this.#current("mode");
  }
  set mode(value: string) {
    this.#choose("mode", value);
  }

  get model(): string | undefined {
    return this.#current("model");
  }
  set model(value: string) {
    this.#choose("model", value);
  }

  get thinking(): string | undefined {
    return this.#current("thinking");
  }
  set thinking(value: string) {
    this.#choose("thinking", value);
  }

  /** The attached files. */
  get files(): File[] {
    if (!this.#rendered) return this.#pending.files ?? [];
    return [...(this.#fileInput?.api.getValue() ?? [])];
  }

  /** Sent prompts, oldest first. With the `history` attribute, ArrowUp brings them back. */
  get history(): string[] {
    return [...this.#history];
  }
  set history(value: string[]) {
    this.#history = [...(value ?? [])].slice(-historyLimit);
    this.#historyIndex = -1;
    this.#save();
  }

  get busy() {
    return this.hasAttribute("busy");
  }
  set busy(value: boolean) {
    this.toggleAttribute("busy", value);
  }

  get disabled() {
    return this.hasAttribute("disabled");
  }
  set disabled(value: boolean) {
    this.toggleAttribute("disabled", value);
  }

  // ---- Methods -------------------------------------------------------------------------------

  override focus(options?: FocusOptions) {
    if (this.#textarea) this.#textarea.focus(options);
    else this.#pending.focused = true;
  }

  /** Empties the prompt and removes the attachments. */
  clear() {
    this.#picked.clear();
    if (!this.#rendered) {
      this.#pending.value = "";
      this.#pending.files = [];
      return;
    }
    this.#prompt!.api.clear();
    this.#fileInput?.api.clear();
    this.#updateSend();
  }

  /**
   * Sends what's in the box, like pressing Send. Fires `promptsubmit`; unless a listener calls
   * `preventDefault()`, the box empties. Returns false when nothing was sent.
   */
  submit(): boolean {
    if (!this.#rendered || this.disabled || this.busy) return false;
    const text = this.value.trim();
    const files = this.files;
    if (!text && files.length === 0) return false;
    this.#listening?.stop();

    const command = text.match(/^\/(\S+)/)?.[1];
    const commands = this.#commands ? flatten(this.#commands).map((item) => item.value) : [];
    const known = [...(this.#references && typeof this.#references !== "function" ? flatten(this.#references) : [])];
    for (const [value, label] of this.#picked) known.push({ value, label });
    const references = known.filter(
      (reference, index) =>
        text.includes(`@${reference.label}`) && known.findIndex((other) => other.value === reference.value) === index,
    );

    const detail: PromptSubmitDetail = {
      text,
      mode: this.mode,
      model: this.model,
      thinking: this.thinking,
      files,
      command: command && commands.includes(command) ? command : undefined,
      references,
    };
    const sent = this.#emit("promptsubmit", detail, true);
    if (sent) {
      if (text && this.#history.at(-1) !== text) this.#history = [...this.#history, text].slice(-historyLimit);
      this.#historyIndex = -1;
      this.clear();
      this.#save();
    }
    return sent;
  }

  /** Types text at the caret, as if pasted. */
  insert(text: string) {
    const textarea = this.#textarea;
    if (!textarea) {
      this.#pending.value = (this.#pending.value ?? "") + text;
      return;
    }
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    this.#prompt!.api.setValue(textarea.value.slice(0, start) + text + textarea.value.slice(end));
    textarea.setSelectionRange(start + text.length, start + text.length);
  }

  /** Attaches files through the same checks as a drop. Returns false when attachments are off. */
  addFiles(files: File[] | FileList): boolean {
    if (!this.hasAttribute("attachments")) return false;
    if (!this.#rendered) {
      this.#pending.files = [...(this.#pending.files ?? []), ...files];
      return true;
    }
    return this.#fileInput!.api.addFiles(files);
  }

  // ---- Lifecycle -----------------------------------------------------------------------------

  connectedCallback() {
    if (!this.hasAttribute("role")) this.setAttribute("role", "group");
    this.#observer.observe(this, { childList: true });
    if (!this.#rendered) this.#rebuild();
  }

  disconnectedCallback() {
    this.#observer.disconnect();
    this.#listening?.stop();
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null) {
    if (previous === next || !this.#rendered) return;
    if (rebuildAttributes.includes(name)) this.#rebuild();
    else if (liveAttributes.includes(name)) this.#sync();
  }

  // ---- Rendering -----------------------------------------------------------------------------

  get #textarea() {
    return this.querySelector<HTMLTextAreaElement>(`#${this.#id}-prompt`);
  }
  get #prompt() {
    return this.querySelector<HTMLElementTagNameMap["ui-textarea"]>(":scope [data-part='prompt']");
  }
  get #fileInput() {
    return this.querySelector<HTMLElementTagNameMap["ui-file-input"]>(":scope > ui-file-input");
  }
  get #menu() {
    return this.querySelector<HTMLElementTagNameMap["ui-trigger-menu"]>(":scope [data-part='menu']");
  }
  get #send() {
    return this.querySelector<HTMLElementTagNameMap["ui-button"]>(":scope [data-part='send']");
  }
  #control(part: "mode" | "model" | "thinking") {
    return this.querySelector<HTMLElement & { api: { getValue(): unknown; setValue(value: string): boolean } }>(
      `:scope [data-part='${part}']`,
    );
  }
  #options(part: "mode" | "model" | "thinking") {
    return part === "mode" ? this.#modes : part === "model" ? this.#models : this.#thinkingLevels;
  }

  #current(part: "mode" | "model" | "thinking"): string | undefined {
    const control = this.#control(part);
    if (control) return (control.api.getValue() as string | null) ?? undefined;
    if (this.#rendered) return undefined;
    return this.#pending[part];
  }

  #choose(part: "mode" | "model" | "thinking", value: string) {
    const control = this.#control(part);
    if (control) control.api.setValue(value);
    else this.#pending[part] = value;
  }

  /** The value a control starts on: the one it had, the `default-*` attribute, or the first choice. */
  #initial(part: "mode" | "model" | "thinking") {
    const options = this.#options(part).filter((option) => !option.disabled);
    const wanted = [this.#pending[part], this.getAttribute(`default-${part}`)];
    return wanted.find((value) => options.some((option) => option.value === value)) ?? options[0]?.value ?? "";
  }

  #rebuild() {
    if (this.#scheduled || !this.isConnected) return;
    this.#scheduled = true;
    // Coalesce the attribute and property writes made in the same task into one build.
    queueMicrotask(() => {
      this.#scheduled = false;
      if (this.isConnected) this.#render();
    });
  }

  #render() {
    if (this.#rendered) {
      this.#pending = {
        value: this.value,
        mode: this.mode,
        model: this.model,
        thinking: this.thinking,
        files: this.files,
        focused: this.contains(document.activeElement),
      };
      this.#listening?.stop();
    } else {
      this.#slotted = [...this.children].filter((child): child is HTMLElement => child.hasAttribute("slot"));
    }
    this.#slotted = this.#slotted.filter((child) => child.isConnected || !this.#rendered);
    // A saved draft comes back first, so the controls start on its choices.
    if (!this.#restored) {
      this.#restored = true;
      const saved = this.#load();
      if (saved) {
        this.#pending.value ??= saved.value;
        for (const part of ["mode", "model", "thinking"] as const) this.#pending[part] ??= saved[part];
        if (saved.history && this.#history.length === 0) this.#history = saved.history.slice(-historyLimit);
      }
    }

    const s = this.#strings;
    const id = this.#id;
    const attachments = this.hasAttribute("attachments");
    const speech = this.hasAttribute("voice") ? this.speechRecognizer : undefined;
    const showVoice = speech && (speech.supported || this.getAttribute("voice") !== "hide");
    const label = this.getAttribute("label") || s.prompt;
    // Name the group after the prompt, unless the page named it itself.
    if (!this.hasAttribute("aria-label") || this.#namedGroup) {
      this.setAttribute("aria-label", label);
      this.#namedGroup = true;
    }

    const select = (part: "model" | "thinking", name: string) => {
      const options = this.#options(part);
      if (options.length === 0) return "";
      const items = options
        .map(
          (option) => `
            <ui-select-item value="${escape(option.value)}" label="${escape(option.label)}"${option.disabled ? " disabled" : ""}>
              <span data-part="option-label">${escape(option.label)}</span>
              ${option.description ? `<span data-part="option-description">${escape(option.description)}</span>` : ""}
            </ui-select-item>`,
        )
        .join("");
      return `
        <ui-select data-part="${part}" default-value="${escape(this.#initial(part))}">
          <ui-select-label data-part="visually-hidden">${escape(name)}</ui-select-label>
          <ui-select-trigger>
            <button type="button" data-part="${part}-trigger" data-button="ghost">
              <span data-part="select-name" aria-hidden="true">${escape(name)}</span>
              <ui-select-value></ui-select-value>
              <span data-part="chevron" aria-hidden="true">${this.#icons.chevron}</span>
            </button>
          </ui-select-trigger>
          <ui-select-content data-part="popup">${items}</ui-select-content>
        </ui-select>`;
    };

    const modes = this.#modes.length
      ? `
        <ui-segmented-control data-part="mode" aria-label="${escape(s.mode)}" default-value="${escape(this.#initial("mode"))}">
          <ui-segmented-control-indicator></ui-segmented-control-indicator>
          ${this.#modes
            .map(
              (option) =>
                `<ui-segmented-control-item value="${escape(option.value)}"${option.disabled ? " disabled" : ""}${
                  option.description ? ` title="${escape(option.description)}"` : ""
                }>${escape(option.label)}</ui-segmented-control-item>`,
            )
            .join("")}
        </ui-segmented-control>`
      : "";

    const card = `
      ${
        attachments
          ? `<ui-file-input-list data-part="attachments" aria-label="${escape(s.attachments)}">
              <template>
                <ui-file-input-item data-part="attachment">
                  <img data-part="attachment-preview" alt="" hidden>
                  <span data-part="attachment-name" data-file="name"></span>
                  <span data-part="attachment-size" data-file="size"></span>
                  <ui-file-input-item-remove>
                    <button type="button" data-part="attachment-remove">×</button>
                  </ui-file-input-item-remove>
                </ui-file-input-item>
              </template>
            </ui-file-input-list>`
          : ""
      }
      <ui-textarea data-part="prompt" auto-resize>
        <textarea id="${id}-prompt" rows="1" aria-label="${escape(label)}"></textarea>
      </ui-textarea>
      <ui-trigger-menu data-part="menu" data-agent-hidden>
        <ui-trigger-menu-hint data-part="menu-hint"></ui-trigger-menu-hint>
        <div data-part="visually-hidden"><ui-trigger-menu-status></ui-trigger-menu-status></div>
        <ui-trigger-menu-content data-part="popup">
          <ui-trigger-menu-empty>${escape(s.noMatches)}</ui-trigger-menu-empty>
          <ui-trigger-menu-list></ui-trigger-menu-list>
        </ui-trigger-menu-content>
      </ui-trigger-menu>
      <div data-part="bar">
        <div data-part="start">
          ${
            attachments
              ? `<ui-file-input-trigger>
                  <button type="button" data-part="attach" data-button="icon" aria-label="${escape(s.attach)}" title="${escape(s.attach)}">${this.#icons.attach}</button>
                </ui-file-input-trigger>`
              : ""
          }
          ${modes}
        </div>
        <div data-part="end">
          ${select("model", s.model)}
          ${select("thinking", s.thinking)}
          ${
            showVoice
              ? `<ui-toggle data-part="voice" data-agent-hidden${speech.supported ? "" : " disabled"}>
                  <button type="button" data-button="icon" aria-label="${escape(s.voice)}" title="${escape(
                    speech.supported ? s.voice : s.voiceUnsupported,
                  )}">${this.#icons.voice}</button>
                </ui-toggle>`
              : ""
          }
          <span data-part="counter" id="${id}-counter" hidden></span>
          <ui-button data-part="send" disabled focusable-when-disabled>
            <button type="button" data-button="icon" data-part="send-button"></button>
          </ui-button>
        </div>
      </div>`;

    const footerSlot = this.#slotted.some((child) => child.slot === "footer");
    this.innerHTML = `
      ${
        attachments
          ? `<ui-file-input multiple${["accept", "max-files", "max-size"]
              .filter((name) => this.hasAttribute(name))
              .map((name) => ` ${name}="${escape(this.getAttribute(name)!)}"`)
              .join("")}>
              <ui-file-input-dropzone data-part="card" paste-target="#${id}-prompt">${card}</ui-file-input-dropzone>
            </ui-file-input>`
          : `<div data-part="card">${card}</div>`
      }
      <div data-part="footer">
        <span data-part="status" role="status"></span>
        ${footerSlot ? "" : `<span data-part="hint"></span>`}
      </div>`;

    for (const child of this.#slotted) this.#place(child);
    this.#rendered = true;
    this.#wire();

    const restore = this.#pending;
    this.#pending = {};
    if (restore.value) this.#prompt!.api.setValue(restore.value);
    if (restore.files?.length && this.#fileInput) this.#fileInput.api.addFiles(restore.files);
    this.#updateTriggers();
    this.#sync();
    if (restore.focused) this.#textarea!.focus();
  }

  /** Moves a `slot`ted child into its place in the bar or footer. */
  #place(child: HTMLElement) {
    const region =
      child.slot === "start"
        ? this.querySelector("[data-part='start']")
        : child.slot === "end"
          ? this.querySelector("[data-part='end']")
          : child.slot === "footer"
            ? this.querySelector("[data-part='footer']")
            : null;
    if (!region) return;
    if (child.slot === "end") {
      const builtIn = [...region.children].find((other) => ["voice", "counter", "send"].includes((other as HTMLElement).dataset.part ?? ""));
      region.insertBefore(child, builtIn ?? null);
    }
    else region.append(child);
  }

  #adopt(records: MutationRecord[]) {
    if (!this.#rendered) return;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement) || node.parentElement !== this || !node.hasAttribute("slot")) continue;
        this.#slotted.push(node);
        if (node.slot === "footer") this.querySelector("[data-part='hint']")?.remove();
        this.#place(node);
      }
    }
  }

  #wire() {
    const textarea = this.#textarea!;
    const prompt = this.#prompt!;
    const send = this.#send!;
    const files = this.#fileInput;
    const menu = this.#menu!;

    const adapter = textFieldAdapter(textarea);
    // Commands with `after: "submit"` send through the composer.
    adapter.submit = () => {
      this.submit();
    };
    menu.editor = adapter;

    textarea.addEventListener("input", () => {
      // Typing over a recalled prompt makes it the draft.
      if (!this.#recalling) this.#historyIndex = -1;
      this.#updateSend();
      this.#updateCounter();
    });
    prompt.addEventListener("valuechange", () =>
      queueMicrotask(() => {
        this.#emit("valuechange", { value: this.value });
        this.#save();
      }),
    );
    textarea.addEventListener("keydown", (event) => {
      if ((event.key === "ArrowUp" || event.key === "ArrowDown") && this.#browseHistory(event)) return;
      if (event.key !== "Enter" || event.isComposing || event.defaultPrevented) return;
      const modEnter = this.getAttribute("submit-on") === "mod-enter";
      if (modEnter ? !(event.metaKey || event.ctrlKey) : event.shiftKey) return;
      // While the suggestion list is open, the menu takes Enter first and marks it handled.
      event.preventDefault();
      this.submit();
    });

    send.addEventListener("action", () => {
      if (this.busy) this.#emit("promptstop", null);
      else this.submit();
      // Back to the prompt, so the next message can be typed straight away.
      textarea.focus();
    });

    menu.addEventListener("itemselect", (event) => {
      if (event.detail.trigger === "@") this.#picked.set(String(event.detail.item.value), event.detail.item.label);
    });

    for (const part of ["mode", "model", "thinking"] as const) {
      this.#control(part)?.addEventListener("valuechange", () =>
        queueMicrotask(() => {
          this.#emit(`${part}change`, { value: this.#current(part) });
          this.#save();
        }),
      );
    }

    if (files) {
      files.addEventListener("valuechange", () =>
        queueMicrotask(() => {
          this.#updateSend();
          this.#emit("fileschange", { value: this.files });
          this.#releasePreviews();
        }),
      );
      // Image attachments show a thumbnail.
      const list = this.querySelector("[data-part='attachments']");
      if (list) {
        new MutationObserver(() => this.#showPreviews()).observe(list, { childList: true, subtree: true });
      }
      textarea.addEventListener("paste", (event) => this.#pasteAsFile(event));
      files.addEventListener("reject", (event) => {
        const rejected = event.detail.value as { file: File; reasons: string[] }[];
        const limits = {
          maxFiles: Number(this.getAttribute("max-files")) || undefined,
          maxSize: Number(this.getAttribute("max-size")) || undefined,
        };
        this.#status(rejected.map(({ file, reasons }) => this.#strings.fileRejected(file, reasons[0], limits)).join(" "), 6000);
        this.#emit("filereject", { value: rejected });
      });
    }

    const voice = this.querySelector<HTMLElementTagNameMap["ui-toggle"]>(":scope [data-part='voice']");
    voice?.addEventListener("pressedchange", (event) => {
      if (!event.detail.value) {
        this.#listening?.stop();
        return;
      }
      if (!this.speechRecognizer.supported) return;
      this.#listening = this.speechRecognizer.start({
        lang: this.getAttribute("voice-lang") || this.closest("[lang]")?.getAttribute("lang") || navigator.language,
        onText: (spoken) => {
          const current = this.value;
          prompt.api.setValue(current && !/\s$/.test(current) ? `${current} ${spoken}` : current + spoken);
          this.#updateSend();
        },
        onEnd: () => {
          voice.pressed = false;
          this.#listening = undefined;
          this.#status("");
          this.#emit("voiceend", null);
        },
      });
      this.#status(this.#strings.listening);
      this.#emit("voicestart", null);
    });
  }

  /** ArrowUp and ArrowDown walk through sent prompts. Returns true when the key was used. */
  #browseHistory(event: KeyboardEvent) {
    if (!this.hasAttribute("history") || event.defaultPrevented || event.isComposing) return false;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    const textarea = this.#textarea!;
    const { selectionStart: start, selectionEnd: end, value } = textarea;
    if (start !== end || this.#history.length === 0) return false;
    const browsing = this.#historyIndex !== -1;

    let next: number;
    if (event.key === "ArrowUp") {
      // Start from an empty box or the very start, and keep going from the first line.
      const onFirstLine = !value.slice(0, start).includes("\n");
      if (browsing ? !onFirstLine : value !== "" && start !== 0) return false;
      if (browsing && this.#historyIndex === 0) return true;
      if (!browsing) this.#draft = value;
      next = browsing ? this.#historyIndex - 1 : this.#history.length - 1;
    } else {
      if (!browsing || value.slice(end).includes("\n")) return false;
      next = this.#historyIndex + 1;
    }

    event.preventDefault();
    const text = next >= this.#history.length ? this.#draft : this.#history[next];
    this.#historyIndex = next >= this.#history.length ? -1 : next;
    this.#recalling = true;
    this.#prompt!.api.setValue(text);
    this.#recalling = false;
    textarea.setSelectionRange(text.length, text.length);
    this.#updateSend();
    this.#updateCounter();
    return true;
  }

  get #storageKey() {
    const name = this.getAttribute("persist");
    return name ? `ai-composer:${name}` : null;
  }

  #load(): Saved | null {
    const key = this.#storageKey;
    if (!key) return null;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      return saved && typeof saved === "object" ? (saved as Saved) : null;
    } catch {
      return null;
    }
  }

  /** Saves the draft, the choices and the history, a moment after the last change. */
  #save() {
    const key = this.#storageKey;
    if (!key || !this.#rendered) return;
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      const saved: Saved = {
        value: this.value,
        mode: this.mode,
        model: this.model,
        thinking: this.thinking,
        history: this.hasAttribute("history") ? this.#history : undefined,
      };
      try {
        localStorage.setItem(key, JSON.stringify(saved));
      } catch {
        // Storage can be full or blocked; the composer works without it.
      }
    }, 250);
  }

  #pasteAsFile(event: ClipboardEvent) {
    const setting = this.getAttribute("paste-as-file");
    if (setting === null || !this.hasAttribute("attachments") || this.disabled) return;
    const limit = Number(setting) > 0 ? Number(setting) : defaultPasteLimit;
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (text.length < limit || (event.clipboardData?.files.length ?? 0) > 0) return;
    event.preventDefault();
    const file = new File([text], this.#strings.pastedFileName, { type: "text/plain", lastModified: Date.now() });
    if (this.addFiles([file])) this.#status(this.#strings.pastedAsFile, 4000);
  }

  #showPreviews() {
    for (const item of this.querySelectorAll<HTMLElement & { file?: File }>("[data-part='attachment']")) {
      const file = item.file;
      const image = item.querySelector<HTMLImageElement>("[data-part='attachment-preview']");
      if (!file || !image || image.getAttribute("src") || !file.type.startsWith("image/")) continue;
      if (typeof URL.createObjectURL !== "function") continue;
      let url = this.#previews.get(file);
      if (!url) {
        url = URL.createObjectURL(file);
        this.#previews.set(file, url);
      }
      image.src = url;
      image.hidden = false;
    }
  }

  /** Frees the thumbnails of files that are no longer attached. */
  #releasePreviews() {
    const attached = new Set(this.files);
    for (const [file, url] of this.#previews) {
      if (attached.has(file)) continue;
      URL.revokeObjectURL?.(url);
      this.#previews.delete(file);
    }
  }

  #updateCounter() {
    const counter = this.querySelector<HTMLElement>("[data-part='counter']");
    const textarea = this.#textarea;
    if (!counter || !textarea) return;
    const max = Number(this.getAttribute("max-length"));
    const length = textarea.value.length;
    // Shown from 80% of the limit, so it only appears when it matters.
    counter.hidden = !(max > 0 && length >= max * 0.8);
    counter.textContent = max > 0 ? this.#strings.counter(length, max) : "";
    const atLimit = max > 0 && length >= max;
    counter.toggleAttribute("data-limit", atLimit);
    if (atLimit && !this.#atLimit) this.#status(this.#strings.limitReached, 4000);
    this.#atLimit = atLimit;
    if (max > 0) textarea.setAttribute("aria-describedby", counter.id);
    else textarea.removeAttribute("aria-describedby");
  }

  #updateTriggers() {
    const menu = this.#menu;
    if (!menu) return;
    const triggers: TriggerDefinition[] = [];
    if (this.#commands) triggers.push({ char: "/", boundary: "start", type: "command", items: this.#commands });
    const references = this.#references;
    if (references) {
      triggers.push({
        char: "@",
        type: "reference",
        items: references,
      });
    }
    menu.triggers = triggers;
  }

  /** Applies the attributes that don't need a rebuild. */
  #sync() {
    const textarea = this.#textarea;
    if (!textarea) return;
    const s = this.#strings;
    textarea.placeholder = this.getAttribute("placeholder") ?? s.placeholder;
    const maxLength = Number(this.getAttribute("max-length"));
    if (maxLength > 0) textarea.maxLength = maxLength;
    else textarea.removeAttribute("maxlength");
    this.style.setProperty("--ai-composer-rows", String(Math.max(1, Number(this.getAttribute("rows")) || 1)));

    const disabled = this.disabled;
    textarea.disabled = disabled;
    for (const selector of ["ui-file-input", "[data-part='mode']", "[data-part='model']", "[data-part='thinking']"]) {
      const control = this.querySelector<HTMLElement & { disabled: boolean }>(`:scope ${selector}`);
      if (control) control.disabled = disabled;
    }
    const voice = this.querySelector<HTMLElement & { disabled: boolean }>(":scope [data-part='voice']");
    if (voice) voice.disabled = disabled || !this.speechRecognizer.supported;
    if (disabled) this.#listening?.stop();

    const hint = this.querySelector("[data-part='hint']");
    if (hint) {
      const custom = this.getAttribute("hint");
      hint.textContent =
        custom ?? (this.getAttribute("submit-on") === "mod-enter" ? s.modEnterHint(isMac() ? "⌘" : "Ctrl") : s.enterHint);
    }
    this.#updateSend();
    this.#updateCounter();
  }

  #updateSend() {
    const send = this.#send;
    const button = send?.querySelector("button");
    if (!send || !button) return;
    const busy = this.busy;
    const empty = !this.value.trim() && this.files.length === 0;
    send.disabled = this.disabled || (!busy && empty);
    const name = busy ? this.#strings.stop : this.#strings.send;
    if (button.getAttribute("aria-label") !== name) {
      button.setAttribute("aria-label", name);
      button.innerHTML = busy ? this.#icons.stop : this.#icons.send;
    }
    button.title = busy ? name : empty ? this.#strings.sendDisabled : name;
    button.toggleAttribute("data-busy", busy);
  }

  #status(message: string, clearAfter?: number) {
    const status = this.querySelector("[data-part='status']");
    if (!status) return;
    clearTimeout(this.#statusTimer);
    status.textContent = message;
    if (clearAfter) this.#statusTimer = setTimeout(() => (status.textContent = ""), clearAfter);
  }

  #emit(type: keyof ComposerEvents, detail: unknown, cancelable = false) {
    return this.dispatchEvent(new CustomEvent(type, { detail, cancelable, bubbles: true, composed: true }));
  }
}

adoptStyles(styles);
define("ai-composer", AiComposerElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-composer": AiComposerElement;
  }
  interface HTMLElementEventMap {
    promptsubmit: CustomEvent<PromptSubmitDetail>;
    promptstop: CustomEvent<null>;
    modechange: CustomEvent<{ value: string }>;
    modelchange: CustomEvent<{ value: string }>;
    thinkingchange: CustomEvent<{ value: string }>;
    fileschange: CustomEvent<{ value: File[] }>;
    filereject: CustomEvent<{ value: { file: File; reasons: string[] }[] }>;
    voicestart: CustomEvent<null>;
    voiceend: CustomEvent<null>;
  }
}
