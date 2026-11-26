import "../../components/ai-composer/ai-composer.ts";
import "../../components/ai-message/ai-message.ts";
import "../../components/ai-thinking/ai-thinking.ts";
import "../../components/ai-transcript/ai-transcript.ts";
import {
  type ComposerCommands,
  type ComposerOption,
  type ComposerReferences,
  defaultModels,
  defaultModes,
  defaultThinkingLevels,
  type PromptSubmitDetail,
} from "../../components/ai-composer/ai-composer.ts";
import type { AiMessageElement } from "../../components/ai-message/ai-message.ts";

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

export const suggestions = [
  "Show me what a reply can look like",
  "/explain @src/main.ts",
  "Write a haiku about web components",
];

/** How long the pretend model thinks at each level, in milliseconds. */
const thinkingTime: Record<string, number> = { off: 0, low: 1500, medium: 3000, high: 5000 };

const labelOf = (options: ComposerOption[], value: unknown) => options.find((option) => option.value === value)?.label ?? "";

/** A pretend reply in Markdown, to show what replies can hold. */
export function pretendReply(detail: PromptSubmitDetail) {
  const model = labelOf(defaultModels, detail.model);
  const mode = labelOf(defaultModes, detail.mode);
  if (/haiku/i.test(detail.text)) {
    return `Custom tags bloom —\n*shadow roots hold quiet light,*\nslots wait to be filled.\n\n— pretend **${model}**`;
  }
  const rows = [
    ["Mode", mode],
    ["Model", model],
    ["Thinking", labelOf(defaultThinkingLevels, detail.thinking)],
    ...(detail.command ? [["Command", `\`/${detail.command}\``]] : []),
    ...(detail.references.length ? [["References", detail.references.map((reference) => `\`@${reference.label}\``).join(", ")]] : []),
    ...(detail.files.length ? [["Attachments", detail.files.map((file) => file.name).join(", ")]] : []),
  ];
  return [
    `This is a pretend reply from **${model}** in *${mode}* mode. A real app would send your prompt to the model and stream its answer here.`,
    "",
    "### What you sent",
    "",
    "| Setting | Value |",
    "|---|---|",
    ...rows.map(([name, value]) => `| ${name} | ${value} |`),
    "",
    "### Hooking up a real model",
    "",
    "1. Listen for `promptsubmit` on the composer.",
    "2. Stream the answer into an `<ai-message>` with `appendText()`.",
    "3. Call `done()` when it ends.",
    "",
    "```ts",
    'composer.addEventListener("promptsubmit", async (event) => {',
    '  const reply = document.createElement("ai-message");',
    "  reply.streaming = true;",
    "  transcript.append(reply);",
    "  for await (const chunk of streamFromYourServer(event.detail)) reply.appendText(chunk);",
    "  reply.done();",
    "});",
    "```",
    "",
    "> Replies are rendered safely: HTML in the text shows as text, like <b>this</b>.",
  ].join("\n");
}

/** `speed` scales every pretend delay; tests pass 0. */
export function mountChatShell(root: HTMLElement, { speed = 1 } = {}) {
  root.innerHTML = `
    <div class="chat-shell">
      <header class="chat-header">
        <a class="back" href="/showcase.html">← Showcase</a>
        <h1>AI chat</h1>
      </header>
      <ai-transcript class="transcript">
        <div slot="empty" class="transcript-empty">
          <h2>What can I help with?</h2>
          <p>Type <kbd>/</kbd> for commands or <kbd>@</kbd> to reference a file. Drop or paste files to attach them, and press <kbd>↑</kbd> for earlier prompts.</p>
          <ul class="suggestions" aria-label="Suggestions">
            ${suggestions.map((text) => `<li><button type="button" class="suggestion">${text}</button></li>`).join("")}
          </ul>
        </div>
      </ai-transcript>
      <ai-composer class="composer" attachments voice history persist="chat-shell" paste-as-file max-length="8000"
        default-mode="auto" default-model="sonnet-5.5" default-thinking="medium"></ai-composer>
    </div>
  `;

  const transcript = root.querySelector("ai-transcript")!;
  const composer = root.querySelector("ai-composer")!;
  composer.modes = defaultModes;
  composer.models = defaultModels;
  composer.thinkingLevels = defaultThinkingLevels;
  composer.commands = commands;
  composer.references = references;

  /** What each reply answered, so Retry can ask again. */
  const asked = new WeakMap<AiMessageElement, PromptSubmitDetail>();
  let stopReply: (() => void) | undefined;

  const wait = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms * speed);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });

  const meta = (text: string) => {
    const line = document.createElement("p");
    line.slot = "footer";
    line.className = "message-meta";
    line.textContent = text;
    return line;
  };

  /** A pretend reply: think for as long as the level asks, then stream Markdown in. */
  async function reply(detail: PromptSubmitDetail, replacing?: AiMessageElement) {
    const controller = new AbortController();
    const { signal } = controller;
    const message = document.createElement("ai-message");
    message.streaming = true;
    asked.set(message, detail);
    const thinking = thinkingTime[detail.thinking ?? "off"] ? document.createElement("ai-thinking") : undefined;
    if (thinking) {
      thinking.slot = "header";
      thinking.timer = true;
      message.append(thinking);
    }
    if (replacing) replacing.replaceWith(message);
    else transcript.append(message);
    stopReply = () => controller.abort();
    composer.busy = true;

    try {
      if (thinking) {
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
      // Stream a few characters at a time, the way a model's tokens arrive.
      const text = pretendReply(detail);
      for (let index = 0; index < text.length; index += 6) {
        await wait(12, signal);
        message.appendText(text.slice(index, index + 6));
      }
    } catch {
      thinking?.remove();
      message.append(meta("Stopped"));
    } finally {
      message.done();
      stopReply = undefined;
      composer.busy = false;
    }
  }

  composer.addEventListener("promptstop", () => stopReply?.());

  composer.addEventListener("promptsubmit", (event) => {
    const detail = event.detail;
    if (detail.command === "clear") {
      for (const message of transcript.querySelectorAll("ai-message")) message.remove();
      return;
    }

    const details = [
      `${labelOf(defaultModes, detail.mode)} · ${labelOf(defaultModels, detail.model)} · Thinking: ${labelOf(defaultThinkingLevels, detail.thinking)}`,
      detail.command && `Command: /${detail.command}`,
      detail.references.length > 0 && `References: ${detail.references.map((reference) => `@${reference.label}`).join(", ")}`,
      detail.files.length > 0 && `Attached: ${detail.files.map((file) => file.name).join(", ")}`,
    ].filter(Boolean);

    const message = document.createElement("ai-message");
    message.from = "user";
    message.text = detail.text;
    message.append(meta(details.join(" · ")));
    transcript.append(message);
    void reply(detail);
  });

  transcript.addEventListener("messageaction", (event) => {
    const message = event.target as AiMessageElement;
    if (event.detail.action === "retry" && !composer.busy) {
      const detail = asked.get(message);
      if (detail) void reply(detail, message);
    } else if (event.detail.action === "edit") {
      composer.value = event.detail.text;
      composer.focus();
    }
  });

  transcript.addEventListener("click", (event) => {
    const suggestion = (event.target as Element).closest(".suggestion");
    if (!suggestion || composer.busy) return;
    composer.value = suggestion.textContent ?? "";
    composer.submit();
    composer.focus();
  });
}
