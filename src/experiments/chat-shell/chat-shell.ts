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
  { value: "execute", label: "Execute" },
  { value: "trade", label: "Trade" },
];

export const models: Option[] = [
  { value: "fast", label: "Fast" },
  { value: "balanced", label: "Balanced" },
  { value: "deep", label: "Deep" },
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

function select(label: string, options: Option[], value: string) {
  return `
    <ui-select default-value="${value}">
      <ui-select-label class="visually-hidden">${label}</ui-select-label>
      <ui-select-trigger>
        <button type="button" class="select-trigger">
          <span class="select-name" aria-hidden="true">${label}:</span>
          <ui-select-value></ui-select-value>
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
        <a href="/showcase.html">Showcase</a>
        <h1>AI chat</h1>
      </header>
      <section class="transcript" aria-label="Conversation">
        <p class="transcript-empty">Send a prompt to start. Type / for commands or @ to reference a file.</p>
        <ol class="messages" aria-live="polite"></ol>
      </section>
      <form class="composer">
        <ui-segmented-control class="modes" aria-label="Mode" default-value="auto">
          <ui-segmented-control-indicator></ui-segmented-control-indicator>
          ${optionItems("segmented-control", modes)}
        </ui-segmented-control>
        <ui-textarea>
          <textarea
            name="prompt"
            rows="3"
            aria-label="Prompt"
            placeholder="Ask anything. / for commands, @ to reference"
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
        <ui-file-input multiple class="attachments">
          <ui-file-input-list aria-label="Attachments">
            <template>
              <ui-file-input-item class="attachment">
                <span data-file="name"></span>
                <span class="attachment-size" data-file="size"></span>
                <ui-file-input-item-remove>
                  <button type="button" class="attachment-remove">×</button>
                </ui-file-input-item-remove>
              </ui-file-input-item>
            </template>
          </ui-file-input-list>
          <div class="composer-toolbar">
            <ui-file-input-trigger>
              <button type="button">Attach files</button>
            </ui-file-input-trigger>
            ${select("Model", models, "balanced")}
            ${select("Thinking", thinkingLevels, "medium")}
            <ui-toggle class="voice" data-agent-hidden${Recognition ? "" : " disabled"}>
              <button type="button"${Recognition ? "" : ' title="Voice input isn\'t supported in this browser"'}>Voice input</button>
            </ui-toggle>
            <span class="voice-status" role="status"></span>
            <ui-button><button type="submit">Send</button></ui-button>
          </div>
        </ui-file-input>
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
  const empty = root.querySelector<HTMLParagraphElement>(".transcript-empty")!;
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
