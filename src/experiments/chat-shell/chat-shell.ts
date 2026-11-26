import "../../components/ai-composer/ai-composer.ts";
import "../../components/ai-thinking/ai-thinking.ts";
import {
  type ComposerCommands,
  type ComposerOption,
  type ComposerReferences,
  defaultModels,
  defaultModes,
  defaultThinkingLevels,
  type PromptSubmitDetail,
} from "../../components/ai-composer/ai-composer.ts";

const commands: ComposerCommands = [
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

const references: ComposerReferences = [
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

/** How long the pretend model thinks at each level, in milliseconds. */
const thinkingTime: Record<string, number> = { off: 0, low: 1500, medium: 3000, high: 5000 };

const labelOf = (options: ComposerOption[], value: unknown) => options.find((option) => option.value === value)?.label ?? "";

/** `speed` scales every pretend delay; tests pass 0. */
export function mountChatShell(root: HTMLElement, { speed = 1 } = {}) {
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
      <ai-composer class="composer" attachments voice default-mode="auto" default-model="sonnet-5.5" default-thinking="medium"></ai-composer>
    </div>
  `;

  const transcript = root.querySelector<HTMLElement>(".transcript")!;
  const messages = root.querySelector<HTMLOListElement>(".messages")!;
  const empty = root.querySelector<HTMLDivElement>(".transcript-empty")!;
  const composer = root.querySelector("ai-composer")!;
  composer.modes = defaultModes;
  composer.models = defaultModels;
  composer.thinkingLevels = defaultThinkingLevels;
  composer.commands = commands;
  composer.references = references;

  let stopReply: (() => void) | undefined;
  const wait = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms * speed);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });

  const setBusy = (busy: boolean) => {
    composer.busy = busy;
    transcript.toggleAttribute("aria-busy", busy);
  };

  const add = (className: string) => {
    const item = document.createElement("li");
    item.className = `message ${className}`;
    messages.append(item);
    empty.hidden = true;
    return item;
  };

  const paragraph = (item: HTMLElement, text: string, className = "") => {
    const p = document.createElement("p");
    if (className) p.className = className;
    p.textContent = text;
    item.append(p);
    item.scrollIntoView({ block: "nearest" });
    return p;
  };

  /** A pretend reply: think for as long as the level asks, then write a sentence word by word. */
  async function reply(detail: PromptSubmitDetail) {
    const controller = new AbortController();
    const { signal } = controller;
    const item = add("reply");
    let body: HTMLParagraphElement | undefined;
    const thinking = thinkingTime[detail.thinking ?? "off"] ? document.createElement("ai-thinking") : undefined;
    stopReply = () => controller.abort();
    setBusy(true);

    try {
      if (thinking) {
        thinking.timer = true;
        item.append(thinking);
        const steps = [
          detail.references.length > 0 && `Reading ${detail.references.map((reference) => `@${reference.label}`).join(", ")}…`,
          detail.files.length > 0 && `Looking at ${detail.files.length === 1 ? detail.files[0].name : `${detail.files.length} files`}…`,
          "Thinking…",
        ].filter((step): step is string => Boolean(step));
        const reasoning: string[] = [];
        for (const step of steps) {
          thinking.label = step;
          reasoning.push(step.replace(/…$/, "."));
          thinking.reasoning = reasoning.join("\n");
          await wait(thinkingTime[detail.thinking!] / steps.length, signal);
        }
        thinking.done();
      }

      const words = `This is a pretend reply from ${labelOf(defaultModels, detail.model)} in ${labelOf(
        defaultModes,
        detail.mode,
      )} mode. A real app would send your prompt${detail.files.length ? " and attachments" : ""} to the model here and stream its answer.`.split(" ");
      body = paragraph(item, "");
      for (const word of words) {
        await wait(40, signal);
        body.textContent = body.textContent ? `${body.textContent} ${word}` : word;
      }
    } catch {
      thinking?.remove();
      if (body && !body.textContent) body.remove();
      paragraph(item, "Stopped", "message-meta");
    } finally {
      stopReply = undefined;
      setBusy(false);
    }
  }

  composer.addEventListener("promptstop", () => stopReply?.());

  composer.addEventListener("promptsubmit", (event) => {
    const detail = event.detail;
    if (detail.command === "clear") {
      messages.replaceChildren();
      empty.hidden = false;
      return;
    }

    const details = [
      `${labelOf(defaultModes, detail.mode)} · ${labelOf(defaultModels, detail.model)} · Thinking: ${labelOf(defaultThinkingLevels, detail.thinking)}`,
      detail.command && `Command: /${detail.command}`,
      detail.references.length > 0 && `References: ${detail.references.map((reference) => `@${reference.label}`).join(", ")}`,
      detail.files.length > 0 && `Attached: ${detail.files.map((file) => file.name).join(", ")}`,
    ].filter(Boolean);

    const item = add("user");
    if (detail.text) paragraph(item, detail.text);
    paragraph(item, details.join(" · "), "message-meta");
    void reply(detail);
  });
}
