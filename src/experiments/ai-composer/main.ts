import "../../styles/base.css";
import "./docs.css";
import "../../components/ai-thinking/ai-thinking.ts";
import {
  type AiComposerElement,
  defaultModels,
  defaultModes,
  defaultThinkingLevels,
} from "../../components/ai-composer/ai-composer.ts";

type Demo = {
  id: string;
  title: string;
  intro: string;
  html: string;
  script?: string;
  setup?: (root: HTMLElement) => void;
};

const files = ["README.md", "package.json", "src/main.ts", "src/components/ai-composer/ai-composer.ts"];

/** Logs each composer event under the demo, so people can see what their code would receive. */
function logEvents(root: HTMLElement) {
  const log = root.querySelector<HTMLElement>(".event-log")!;
  const types = ["promptsubmit", "promptstop", "modechange", "modelchange", "thinkingchange", "fileschange", "filereject", "voicestart", "voiceend"];
  for (const type of types) {
    root.addEventListener(type, (event) => {
      const detail = (event as CustomEvent).detail;
      const shown = JSON.stringify(detail, (key, value) =>
        value instanceof File ? `File(${value.name})` : key === "value" && Array.isArray(value) && value[0]?.file ? value.map((entry: { file: File; reasons: string[] }) => `${entry.file.name}: ${entry.reasons}`) : value,
      );
      log.textContent = `${type} ${shown ?? ""}`;
    });
  }
}

const demos: Demo[] = [
  {
    id: "minimal",
    title: "Minimal",
    intro: "With no options, it's a prompt box and a Send button. Everything else is opt-in.",
    html: `<ai-composer></ai-composer>`,
    script: `composer.addEventListener("promptsubmit", (event) => {
  console.log(event.detail.text)
})`,
  },
  {
    id: "everything",
    title: "Everything on",
    intro:
      "Attributes turn on attachments and voice; lists turn on Mode, Model, Thinking, / and @. The default-* attributes pick the starting choices.",
    html: `<ai-composer attachments voice
  default-mode="auto" default-model="sonnet-5.5" default-thinking="medium">
</ai-composer>`,
    script: `import { defaultModes, defaultModels, defaultThinkingLevels } from "./ai-composer"

composer.modes = defaultModes
composer.models = defaultModels
composer.thinkingLevels = defaultThinkingLevels
composer.commands = [{ value: "summarize", label: "summarize" }, { value: "explain", label: "explain" }]
composer.references = [{ type: "group", label: "Files", items: ["README.md", "package.json"] }]`,
    setup: (root) => {
      const composer = root.querySelector("ai-composer")!;
      composer.modes = defaultModes;
      composer.models = defaultModels;
      composer.thinkingLevels = defaultThinkingLevels;
      composer.commands = [
        { value: "summarize", label: "summarize" },
        { value: "explain", label: "explain" },
      ];
      composer.references = [{ type: "group", label: "Files", items: ["README.md", "package.json"] }];
    },
  },
  {
    id: "attachments",
    title: "Attachment rules, without voice",
    intro: "Only images and PDFs, up to 3 files of 5 MB each. Try attaching something else: it's turned away with a message.",
    html: `<ai-composer attachments accept="image/*,.pdf" max-files="3" max-size="5000000"
  placeholder="Describe the image…">
</ai-composer>`,
  },
  {
    id: "search",
    title: "@ search and options with descriptions",
    intro: "references can be a function that searches as people type. Options can carry a description, or be disabled.",
    html: `<ai-composer default-model="haiku"></ai-composer>`,
    script: `composer.references = async (query, { signal }) => {
  const response = await fetch(\`/api/files?q=\${query}\`, { signal })
  return response.json() // ["README.md", …] or [{ value, label }]
}
composer.models = [
  { value: "opus", label: "Opus 5.5", description: "Most capable" },
  { value: "haiku", label: "Haiku 5.5", description: "Fastest" },
  { value: "legacy", label: "Legacy", description: "Retired", disabled: true },
]`,
    setup: (root) => {
      const composer = root.querySelector("ai-composer")!;
      composer.references = async (query: string) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return files.filter((file) => file.toLowerCase().includes(query.toLowerCase()));
      };
      composer.models = [
        { value: "opus", label: "Opus 5.5", description: "Most capable" },
        { value: "haiku", label: "Haiku 5.5", description: "Fastest" },
        { value: "legacy", label: "Legacy", description: "Retired", disabled: true },
      ];
    },
  },
  {
    id: "streaming",
    title: "A streaming reply with Stop",
    intro:
      "Set busy while the answer streams: Send becomes Stop and fires promptstop. <ai-thinking> shows the model working, then stays as a summary.",
    html: `<ol class="mini-transcript" aria-label="Replies"></ol>
<ai-composer default-thinking="medium"></ai-composer>`,
    script: `composer.addEventListener("promptsubmit", async (event) => {
  const thinking = document.createElement("ai-thinking")
  thinking.timer = true
  transcript.append(thinking)
  composer.busy = true
  const controller = new AbortController()
  composer.addEventListener("promptstop", () => controller.abort(), { once: true })
  try {
    for await (const part of streamReply(event.detail, controller.signal)) {
      thinking.done() // on the first token
      // …append the text
    }
  } finally {
    composer.busy = false
  }
})`,
    setup: (root) => {
      const composer = root.querySelector("ai-composer")!;
      const transcript = root.querySelector(".mini-transcript")!;
      composer.thinkingLevels = defaultThinkingLevels;
      let stop: (() => void) | undefined;
      composer.addEventListener("promptstop", () => stop?.());
      composer.addEventListener("promptsubmit", (event) => {
        const item = document.createElement("li");
        const thinking = document.createElement("ai-thinking");
        thinking.timer = true;
        item.append(thinking);
        transcript.append(item);
        composer.busy = true;
        const seconds = { off: 0, low: 1, medium: 2, high: 4 }[event.detail.thinking ?? "off"] ?? 0;
        const timers: ReturnType<typeof setTimeout>[] = [];
        const finish = (text: string) => {
          const p = document.createElement("p");
          p.textContent = text;
          item.append(p);
          composer.busy = false;
          stop = undefined;
        };
        stop = () => {
          timers.forEach(clearTimeout);
          thinking.remove();
          finish("Stopped");
        };
        timers.push(
          setTimeout(() => {
            thinking.done();
            finish(`You said “${event.detail.text}”. A real model would answer here.`);
          }, seconds * 1000 + 300),
        );
      });
    },
  },
  {
    id: "slots",
    title: "Your own buttons and footer",
    intro: 'Children with slot="start" or slot="end" go into the bar; slot="footer" replaces the hint line.',
    html: `<ai-composer>
  <ui-toggle slot="start">
    <button type="button" data-button="ghost">🌐 Web search</button>
  </ui-toggle>
  <small slot="footer">AI can make mistakes. Check important info.</small>
</ai-composer>`,
  },
  {
    id: "theme",
    title: "Theming",
    intro: "Custom properties change the colors, corners and size. The component's CSS sits in a cascade layer, so your rules always win.",
    html: `<ai-composer class="branded" rows="3"></ai-composer>`,
    script: `.branded {
  --ai-composer-accent: #6d28d9;
  --ai-composer-accent-text: white;
  --ai-composer-radius: 0.5rem;
  --ai-composer-border: 2px solid #6d28d9;
  --ai-composer-max-height: 20rem;
}`,
  },
  {
    id: "localized",
    title: "Translated, and Ctrl+Enter to send",
    intro: "strings replaces every built-in word. submit-on=\"mod-enter\" suits long prompts: Enter adds a line.",
    html: `<ai-composer lang="fr" voice attachments submit-on="mod-enter"
  label="Message" placeholder="Posez une question…">
</ai-composer>`,
    script: `composer.strings = {
  send: "Envoyer", stop: "Arrêter", attach: "Joindre des fichiers",
  voice: "Dictée", listening: "Écoute…", mode: "Mode",
  modEnterHint: (key) => \`\${key}+Entrée pour envoyer · Entrée pour un saut de ligne\`,
}`,
    setup: (root) => {
      const composer = root.querySelector("ai-composer")!;
      composer.strings = {
        send: "Envoyer",
        stop: "Arrêter",
        sendDisabled: "Écrivez un message pour l'envoyer",
        attach: "Joindre des fichiers",
        attachments: "Pièces jointes",
        voice: "Dictée",
        voiceUnsupported: "La dictée n'est pas disponible dans ce navigateur",
        listening: "Écoute…",
        mode: "Mode",
        modEnterHint: (key) => `${key}+Entrée pour envoyer · Entrée pour un saut de ligne`,
      };
      composer.modes = [
        { value: "auto", label: "Auto" },
        { value: "plan", label: "Plan" },
      ];
    },
  },
  {
    id: "rtl",
    title: "Right to left",
    intro: "Layouts follow dir, so the bar mirrors for Arabic, Hebrew and Persian.",
    html: `<ai-composer dir="rtl" lang="ar" label="الرسالة" placeholder="اسأل أي شيء…" attachments></ai-composer>`,
    setup: (root) => {
      const composer = root.querySelector("ai-composer")!;
      composer.strings = { send: "إرسال", attach: "إرفاق ملفات", attachments: "المرفقات", enterHint: "Enter للإرسال · Shift+Enter لسطر جديد" };
      composer.modes = [
        { value: "auto", label: "تلقائي" },
        { value: "plan", label: "خطة" },
      ];
    },
  },
  {
    id: "two",
    title: "Two on one page",
    intro: "Each composer has its own ids. label names the prompt and the group around it, so screen readers and agents can tell them apart.",
    html: `<ai-composer label="Prompt"></ai-composer>
<ai-composer label="Reply to review" placeholder="Leave a comment…"></ai-composer>`,
  },
  {
    id: "thinking",
    title: "<ai-thinking>",
    intro:
      "Shimmering text while the model works, an optional timer, and optional reasoning that opens from the summary. The last one shows what people who turn on Reduce motion see.",
    html: `<ai-thinking></ai-thinking>
<ai-thinking timer label="Searching files…"></ai-thinking>
<ai-thinking timer>Reading the question. Checking the files it mentions.</ai-thinking>
<ai-thinking timer data-finishes-after="3s">Weighing two approaches. Picking the simpler one.</ai-thinking>
<ai-thinking class="reduced-motion-preview"></ai-thinking>`,
    setup: (root) => {
      // This one finishes after 3 seconds, leaving "Thought for 3s".
      const finishing = root.querySelector<HTMLElementTagNameMap["ai-thinking"]>("[data-finishes-after]")!;
      setTimeout(() => finishing.done(), 3000);
    },
  },
];

const escape = (text: string) => text.replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!);

const main = document.querySelector<HTMLElement>("#app")!;
main.innerHTML = `
  <header class="docs-header">
    <a class="back" href="/showcase.html">← Showcase</a>
    <h1>&lt;ai-composer&gt; and &lt;ai-thinking&gt;</h1>
    <p>Live examples. The full reference is in <code>src/components/ai-composer/README.md</code> and <code>src/components/ai-thinking/README.md</code>.</p>
    <nav aria-label="Examples"><ul>${demos.map((demo) => `<li><a href="#${demo.id}">${escape(demo.title)}</a></li>`).join("")}</ul></nav>
  </header>
  ${demos
    .map(
      (demo) => `
    <section class="demo" id="${demo.id}" aria-labelledby="${demo.id}-title">
      <h2 id="${demo.id}-title">${escape(demo.title)}</h2>
      <p>${escape(demo.intro)}</p>
      <div class="demo-stage">${demo.html}</div>
      <p class="event-log" aria-live="off"></p>
      <details class="demo-code">
        <summary>Code</summary>
        <pre><code>${escape(demo.html)}</code></pre>
        ${demo.script ? `<pre><code>${escape(demo.script)}</code></pre>` : ""}
      </details>
    </section>`,
    )
    .join("")}
`;

for (const demo of demos) {
  const section = document.getElementById(demo.id)!;
  demo.setup?.(section);
  logEvents(section);
}

// For the browser console: try composer.value = "…" or composer.busy = true.
(window as unknown as { composers: AiComposerElement[] }).composers = [...document.querySelectorAll("ai-composer")];
