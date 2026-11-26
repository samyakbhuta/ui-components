import "@ui-sdk/web/button";
import "@ui-sdk/web/file-input";
import "@ui-sdk/web/segmented-control";
import "@ui-sdk/web/select";
import "@ui-sdk/web/textarea";
import "@ui-sdk/web/toggle";
import "@ui-sdk/web/trigger-menu";
import { textFieldAdapter } from "@ui-sdk/web/trigger-menu";
import type { TriggerDefinition, TriggerMenuData } from "@ui-sdk/web/trigger-menu";

type Option = { value: string; label: string };

export const modes: Option[] = [
  { value: "auto", label: "Auto" },
  { value: "plan", label: "Plan" },
  { value: "accept-edits", label: "Accept-edits" },
];

export const models: Option[] = [
  { value: "opus-5.5", label: "Opus 5.5" },
  { value: "sonnet-5.5", label: "Sonnet 5.5" },
  { value: "haiku-5.5", label: "Haiku 5.5" },
];

export const thinkingLevels: Option[] = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const commands: TriggerMenuData = [
  { value: "summarize", label: "summarize" },
  { value: "explain", label: "explain" },
  {
    value: "translate",
    label: "translate",
    arguments: [
      {
        name: "language",
        hint: "<language>",
        required: true,
        items: ["English", "French", "German", "Hindi", "Japanese", "Spanish"],
      },
    ],
  },
  { value: "clear", label: "clear", after: "submit" },
];

const references: TriggerMenuData = [
  {
    type: "group",
    label: "Files",
    items: ["README.md", "package.json", "src/main.ts", "src/components/app-root.ts"],
  },
  {
    type: "group",
    label: "Docs",
    items: ["llms.txt", "trigger-menu.md", "button.md"],
  },
];

const triggers: TriggerDefinition[] = [
  { char: "/", boundary: "start", type: "command", items: commands },
  { char: "@", type: "reference", items: references },
];

const referenceLabels = references.flatMap((entry) =>
  typeof entry === "object" && "items" in entry ? entry.items.map(String) : [],
);

type SpeechResultEvent = { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function speechRecognition() {
  const speech = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
}

const labelOf = (options: Option[], value: unknown) => options.find((option) => option.value === value)?.label ?? "";

const optionItems = (prefix: string, options: Option[]) =>
  options.map((option) => `<ui-${prefix}-item value="${option.value}">${option.label}</ui-${prefix}-item>`).join("");

const icon = (paths: string) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const icons = {
  attach: icon('<path d="M12 5v14M5 12h14"/>'),
  voice: icon('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  send: icon('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  chevron: icon('<path d="m6 9 6 6 6-6"/>'),
};

function select(label: string, options: Option[], value: string) {
  return `
    <ui-select default-value="${value}">
      <ui-select-label class="visually-hidden">${label}</ui-select-label>
      <ui-select-trigger>
        <button type="button" class="ghost select-trigger">
          <span class="select-name" aria-hidden="true">${label}</span>
          <ui-select-value></ui-select-value>
          ${icons.chevron}
        </button>
      </ui-select-trigger>
      <ui-select-content>${optionItems("select", options)}</ui-select-content>
    </ui-select>`;
}

export function mountChatShell(root: HTMLElement) {
  const Recognition = speechRecognition();
  root.innerHTML = `
    <div class="chat-shell">
      <header class="chat-header">
        <a class="back" href="/showcase.html">← Showcase</a>
        <h1>AI chat</h1>
      </header>
      <section class="transcript" aria-label="Conversation">
        <div class="transcript-empty">
          <h2>What can I help with?</h2>
          <p>Type <kbd>/</kbd> for commands or <kbd>@</kbd> to reference a file. Drop or paste files to attach them.</p>
        </div>
        <ol class="messages" aria-live="polite"></ol>
      </section>
      <form class="composer">
        <ui-file-input multiple>
          <ui-file-input-dropzone class="composer-card" paste-target="#prompt-input">
            <ui-file-input-list class="attachments" aria-label="Attachments">
              <template>
                <ui-file-input-item class="attachment">
                  <span class="attachment-name" data-file="name"></span>
                  <span class="attachment-size" data-file="size"></span>
                  <ui-file-input-item-remove>
                    <button type="button" class="attachment-remove">×</button>
                  </ui-file-input-item-remove>
                </ui-file-input-item>
              </template>
            </ui-file-input-list>
            <ui-textarea auto-resize>
              <textarea
                id="prompt-input"
                name="prompt"
                rows="1"
                aria-label="Prompt"
                placeholder="Ask anything…"
              ></textarea>
            </ui-textarea>
            <ui-trigger-menu data-agent-hidden>
              <ui-trigger-menu-hint></ui-trigger-menu-hint>
              <div class="visually-hidden">
                <ui-trigger-menu-status></ui-trigger-menu-status>
              </div>
              <ui-trigger-menu-content>
                <ui-trigger-menu-empty>No matches</ui-trigger-menu-empty>
                <ui-trigger-menu-list></ui-trigger-menu-list>
              </ui-trigger-menu-content>
            </ui-trigger-menu>
            <div class="composer-bar">
              <div class="bar-group">
                <ui-file-input-trigger>
                  <button type="button" class="icon-button" aria-label="Attach files" title="Attach files">${icons.attach}</button>
                </ui-file-input-trigger>
                <ui-segmented-control class="modes" aria-label="Mode" default-value="auto">
                  <ui-segmented-control-indicator></ui-segmented-control-indicator>
                  ${optionItems("segmented-control", modes)}
                </ui-segmented-control>
              </div>
              <div class="bar-group">
                ${select("Model", models, "sonnet-5.5")}
                ${select("Thinking", thinkingLevels, "medium")}
                <ui-toggle class="voice" data-agent-hidden${Recognition ? "" : " disabled"}>
                  <button type="button" class="icon-button" aria-label="Voice input" title="${Recognition ? "Voice input" : "Voice input isn't supported in this browser"}">${icons.voice}</button>
                </ui-toggle>
                <ui-button class="send" disabled focusable-when-disabled>
                  <button type="submit" class="icon-button send-button" aria-label="Send" title="Send (Enter)">${icons.send}</button>
                </ui-button>
              </div>
            </div>
          </ui-file-input-dropzone>
        </ui-file-input>
        <p class="composer-hint">
          <span class="voice-status" role="status"></span>
          <span class="shortcuts">Enter to send · Shift+Enter for a new line</span>
        </p>
      </form>
    </div>
  `;

  const form = root.querySelector<HTMLFormElement>(".composer")!;
  const menu = root.querySelector("ui-trigger-menu")!;
  const prompt = root.querySelector("ui-textarea")!;
  const textarea = root.querySelector("textarea")!;
  const mode = root.querySelector("ui-segmented-control")!;
  const [model, thinking] = root.querySelectorAll("ui-select");
  const attachments = root.querySelector("ui-file-input")!;
  const voice = root.querySelector("ui-toggle")!;
  const voiceStatus = root.querySelector<HTMLSpanElement>(".voice-status")!;
  const messages = root.querySelector<HTMLOListElement>(".messages")!;
  const empty = root.querySelector<HTMLDivElement>(".transcript-empty")!;
  const send = root.querySelector("ui-button")!;
  // ui-textarea owns the field so agents can set its value. The menu reaches it through an
  // adapter and is hidden from agents, who can type commands and references into the prompt.
  menu.editor = textFieldAdapter(textarea);
  menu.triggers = triggers;

  let recognition: SpeechRecognitionLike | undefined;
  const stopListening = () => {
    voice.pressed = false;
    voiceStatus.textContent = "";
    recognition = undefined;
  };
  voice.addEventListener("pressedchange", (event) => {
    if (!Recognition) return;
    if (!event.detail.value) {
      recognition?.stop();
      return;
    }
    recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = document.documentElement.lang || "en";
    recognition.onresult = (result) => {
      for (let i = result.resultIndex; i < result.results.length; i++) {
        if (!result.results[i].isFinal) continue;
        const spoken = result.results[i][0].transcript.trim();
        const current = textarea.value;
        prompt.api.setValue(current && !/\s$/.test(current) ? `${current} ${spoken}` : current + spoken);
      }
    };
    recognition.onend = stopListening;
    recognition.onerror = stopListening;
    recognition.start();
    voiceStatus.textContent = "Listening…";
  });

  const updateSend = () => {
    send.disabled = !textarea.value.trim() && attachments.api.getValue().length === 0;
  };
  textarea.addEventListener("input", updateSend);
  attachments.addEventListener("valuechange", () => queueMicrotask(updateSend));

  textarea.addEventListener("keydown", (event) => {
    // While the suggestion list is open, the menu handles Enter first and marks it handled.
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.defaultPrevented) return;
    event.preventDefault();
    form.requestSubmit();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    recognition?.stop();
    const text = textarea.value.trim();
    const files = attachments.api.getValue();
    if (!text && files.length === 0) {
      textarea.focus();
      return;
    }
    prompt.api.clear();
    attachments.api.clear();
    textarea.focus();

    const command = text.match(/^\/(\S+)/)?.[1];
    if (command === "clear") {
      messages.replaceChildren();
      empty.hidden = false;
      return;
    }

    const referenced = referenceLabels.filter((label) => text.includes(`@${label}`));
    const details = [
      `${labelOf(modes, mode.api.getValue())} · ${labelOf(models, model.api.getValue())} · Thinking: ${labelOf(thinkingLevels, thinking.api.getValue())}`,
      command && `Command: /${command}`,
      referenced.length > 0 && `References: ${referenced.map((label) => `@${label}`).join(", ")}`,
      files.length > 0 && `Attached: ${files.map((file) => file.name).join(", ")}`,
    ].filter(Boolean);

    const item = document.createElement("li");
    item.className = "message";
    if (text) {
      const body = document.createElement("p");
      body.textContent = text;
      item.append(body);
    }
    const meta = document.createElement("p");
    meta.className = "message-meta";
    meta.textContent = details.join(" · ");
    item.append(meta);
    messages.append(item);
    empty.hidden = true;
    item.scrollIntoView({ block: "nearest" });
  });
}
