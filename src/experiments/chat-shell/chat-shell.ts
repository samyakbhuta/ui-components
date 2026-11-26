import "@ui-sdk/web/button";
import "@ui-sdk/web/textarea";
import "@ui-sdk/web/trigger-menu";
import { textFieldAdapter } from "@ui-sdk/web/trigger-menu";
import type { TriggerDefinition, TriggerMenuData } from "@ui-sdk/web/trigger-menu";

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
  {
    value: "model",
    label: "model",
    arguments: [
      {
        name: "model",
        hint: "<model>",
        required: true,
        items: ["fast", "balanced", "deep"],
        allowCustomValue: false,
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

function describePrompt(prompt: string) {
  const command = prompt.match(/^\/(\S+)/)?.[1];
  const referenced = referenceLabels.filter((label) => prompt.includes(`@${label}`));
  return { command, referenced };
}

export function mountChatShell(root: HTMLElement) {
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
        <div class="composer-actions">
          <span class="composer-tip">Enter to send, Shift+Enter for a new line</span>
          <ui-button><button type="submit">Send</button></ui-button>
        </div>
      </form>
    </div>
  `;

  const form = root.querySelector<HTMLFormElement>(".composer")!;
  const menu = root.querySelector("ui-trigger-menu")!;
  const textarea = root.querySelector("textarea")!;
  const messages = root.querySelector<HTMLOListElement>(".messages")!;
  const empty = root.querySelector<HTMLParagraphElement>(".transcript-empty")!;
  // ui-textarea owns the field so agents can set its value. The menu reaches it through an
  // adapter and is hidden from agents, who can type commands and references into the prompt.
  menu.editor = textFieldAdapter(textarea);
  menu.triggers = triggers;

  textarea.addEventListener("keydown", (event) => {
    // While the suggestion list is open, the menu handles Enter first and marks it handled.
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.defaultPrevented) return;
    event.preventDefault();
    form.requestSubmit();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const prompt = textarea.value.trim();
    textarea.value = "";
    textarea.focus();
    if (!prompt) return;

    const { command, referenced } = describePrompt(prompt);
    if (command === "clear") {
      messages.replaceChildren();
      empty.hidden = false;
      return;
    }

    const item = document.createElement("li");
    item.className = "message";
    const text = document.createElement("p");
    text.textContent = prompt;
    item.append(text);
    const details = [
      command && `Command: /${command}`,
      referenced.length > 0 && `References: ${referenced.map((label) => `@${label}`).join(", ")}`,
    ].filter(Boolean);
    if (details.length > 0) {
      const meta = document.createElement("p");
      meta.className = "message-meta";
      meta.textContent = details.join(" · ");
      item.append(meta);
    }
    messages.append(item);
    empty.hidden = true;
    item.scrollIntoView({ block: "nearest" });
  });
}
