import "../../styles/base.css";
import "./docs.css";
import "@samyakbhuta/ui-components/ai-message";
import "@samyakbhuta/ui-components/ai-thinking";
import "@samyakbhuta/ui-components/ai-tool-call";
import "@samyakbhuta/ui-components/ai-sources";
import "@samyakbhuta/ui-components/ai-suggestions";
import "@samyakbhuta/ui-components/ai-question";
import "@samyakbhuta/ui-components/ai-transcript";
import "@samyakbhuta/ui-components/ai-chat-list";
import { highlight } from "@samyakbhuta/ui-components/highlight";
import { mountPlayground } from "./playground.ts";
import {
  type AiComposerElement,
  defaultModels,
  defaultModes,
  defaultThinkingLevels,
} from "@samyakbhuta/ui-components/ai-composer";

type Demo = {
  id: string;
  title: string;
  intro: string;
  html: string;
  script?: string;
  setup?: (root: HTMLElement) => void;
  /** The example shows its own code. */
  noCode?: boolean;
};

const sampleReply = `Here's what a reply can hold:

- **Bold**, *italic*, \`inline code\` and [links](https://developer.mozilla.org/docs/Web/API/Web_components)
- Nested lists
  1. like this
  2. and this

| Part | Element |
|---|:-:|
| Input | \`<ai-composer>\` |
| Messages | \`<ai-message>\` |

\`\`\`html
<ai-message>**Markdown** goes here</ai-message>
\`\`\`

> HTML in a reply shows as text: <img src=x onerror=alert(1)> stays harmless.`;

/** Streams text into a message a few characters at a time. */
function stream(message: HTMLElementTagNameMap["ai-message"], text: string, signal?: AbortSignal) {
  message.text = "";
  message.streaming = true;
  let index = 0;
  const timer = setInterval(() => {
    if (signal?.aborted || index >= text.length) {
      clearInterval(timer);
      message.done();
      return;
    }
    message.appendText(text.slice(index, index + 5));
    index += 5;
  }, 16);
}

const files = ["README.md", "package.json", "src/main.ts", "packages/ui-components/src/ai-composer/ai-composer.ts"];

/** Logs each composer event under the demo, so people can see what their code would receive. */
function logEvents(root: HTMLElement) {
  const log = root.querySelector<HTMLElement>(".event-log")!;
  const types = [
    "promptsubmit",
    "promptstop",
    "modechange",
    "modelchange",
    "thinkingchange",
    "fileschange",
    "filereject",
    "voicestart",
    "voiceend",
    "chatselect",
    "chatnew",
    "chatrename",
    "chatexport",
    "chatdelete",
    "suggestionselect",
    "messagefeedback",
    "messageversion",
    "questionanswer",
    "questionskip",
  ];
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
    id: "playground",
    title: "Playground",
    intro: "Switch features on and off, change the look, and copy the code for what you've built.",
    html: "",
    noCode: true,
    setup: (root) => mountPlayground(root),
  },
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
    id: "extras",
    title: "History, drafts, long pastes and a counter",
    intro:
      "history: press ↑ in an empty box for earlier prompts. persist: the draft and choices survive a reload. paste-as-file: a paste of 500 characters or more becomes an attachment. max-length: a counter appears near the limit.",
    html: `<ai-composer history persist="docs-example" attachments paste-as-file="500" max-length="280"></ai-composer>`,
    setup: (root) => {
      const composer = root.querySelector("ai-composer")!;
      if (composer.history.length === 0) composer.history = ["What's a custom element?", "/explain @README.md"];
    },
  },
  {
    id: "messages",
    title: "<ai-message>",
    intro:
      "One message. Assistant messages render Markdown safely and offer Copy and Retry; yours show as typed and offer Copy and Edit. Text streams in with appendText().",
    html: `<ai-message from="user">Show me what a reply can look like</ai-message>
<ai-message class="sample-reply"></ai-message>
<button type="button" class="replay">Stream it again</button>`,
    script: `const reply = document.createElement("ai-message")
reply.streaming = true
transcript.append(reply)
for await (const chunk of stream) reply.appendText(chunk)
reply.done()

reply.addEventListener("messageaction", (event) => {
  if (event.detail.action === "retry") askAgain()
})`,
    setup: (root) => {
      const reply = root.querySelector<HTMLElementTagNameMap["ai-message"]>(".sample-reply")!;
      reply.text = sampleReply;
      root.querySelector(".replay")!.addEventListener("click", () => stream(reply, sampleReply));
      root.addEventListener("messageaction", (event) => {
        if (event.detail.action === "retry") stream(reply, sampleReply);
      });
    },
  },
  {
    id: "message-states",
    title: "Attachments, errors, feedback and versions",
    intro:
      "A message can show the files sent with it, a reply that failed part way, Good response and Bad response, and arrows to step between versions after Retry. Rate the reply or step through its versions: the event shows below.",
    html: `<ai-message from="user" class="with-files">What's in these?</ai-message>
<ai-message class="failed-reply"></ai-message>
<ai-message class="rated-reply" actions="copy retry feedback"></ai-message>`,
    script: `sent.attachments = event.detail.files // File objects, or { name, type, size, url }
reply.fail("The connection dropped. Try again.")

reply.setAttribute("actions", "copy retry feedback")
reply.versions = answers.length
reply.addEventListener("messageversion", (event) => {
  reply.text = answers[event.detail.version - 1]
})`,
    setup: (root) => {
      const sent = root.querySelector<HTMLElementTagNameMap["ai-message"]>(".with-files")!;
      const chart = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#e8eefc"/><rect x="14" y="52" width="14" height="30" fill="#2b5bc4"/><rect x="41" y="34" width="14" height="48" fill="#2b5bc4"/><rect x="68" y="18" width="14" height="64" fill="#2b5bc4"/></svg>');
      sent.attachments = [
        new File([chart], "chart.svg", { type: "image/svg+xml" }),
        { name: "quarterly-report.pdf", type: "application/pdf", size: 2_400_000 },
        { name: "notes.txt", type: "text/plain", size: 812 },
      ];
      const failed = root.querySelector<HTMLElementTagNameMap["ai-message"]>(".failed-reply")!;
      failed.text = "The chart shows sales rising each quarter, from";
      failed.fail("The connection dropped. Try again.");

      const answers = [
        "Sales rose in each of the three quarters.",
        "Sales grew every quarter, and the third quarter was the strongest.",
        "Sales grew steadily: each quarter beat the one before, and the third was more than double the first.",
      ];
      const rated = root.querySelector<HTMLElementTagNameMap["ai-message"]>(".rated-reply")!;
      rated.text = answers[2];
      rated.versions = answers.length;
      rated.addEventListener("messageversion", (event) => (rated.text = answers[event.detail.version - 1]));
      root.addEventListener("messageaction", (event) => {
        const message = event.target as HTMLElementTagNameMap["ai-message"];
        if (event.detail.action !== "retry") return;
        message.error = null;
        stream(message, message === rated ? answers[rated.version - 1] : "The chart shows sales rising each quarter, from about 30 to 64.");
      });
    },
  },
  {
    id: "tools",
    title: "<ai-tool-call>",
    intro:
      "One step an agent takes. It spins while it runs, then stays as a summary that opens to show what went in and what came back. The last call fails. Press the button to run them again.",
    html: `<ai-message class="agent-reply">
  <ai-tool-call slot="header" name="search_web" label="Searching the web…"></ai-tool-call>
  <ai-tool-call slot="header" name="read_file" label="Reading src/main.ts…"></ai-tool-call>
  <ai-tool-call slot="header" name="run_tests" label="Running the tests…"></ai-tool-call>
</ai-message>
<button type="button" class="rerun">Run them again</button>`,
    script: `const call = document.createElement("ai-tool-call")
call.slot = "header"
call.name = "search_web"
call.label = "Searching the web…"
call.input = { query: "custom elements lifecycle" }
reply.append(call)

call.summary = "Found 3 pages"
call.done(results) // or call.fail("Timed out after 30s")`,
    setup: (root) => {
      const reply = root.querySelector<HTMLElementTagNameMap["ai-message"]>(".agent-reply")!;
      const run = () => {
        const [search, read, tests] = root.querySelectorAll("ai-tool-call");
        for (const call of [search, read, tests]) {
          call.status = "running";
          call.removeAttribute("summary");
          call.output = undefined;
          call.error = "";
        }
        reply.text = "";
        search.input = { query: "custom elements lifecycle" };
        read.input = { path: "src/main.ts" };
        tests.input = { command: "npm test" };
        setTimeout(() => {
          search.summary = "Found 3 pages";
          search.done([
            { title: "Using custom elements", url: "https://developer.mozilla.org/docs/Web/API/Web_components/Using_custom_elements" },
            { title: "Custom element reactions", url: "https://html.spec.whatwg.org/multipage/custom-elements.html" },
            { title: "Lifecycle callbacks", url: "https://web.dev/articles/custom-elements-v1" },
          ]);
        }, 1200);
        setTimeout(() => {
          read.summary = "Read src/main.ts";
          read.done('import "./styles/base.css";\nimport { mountChatShell } from "./experiments/chat-shell/chat-shell.ts";\n\nmountChatShell(document.querySelector("#app")!);');
        }, 2000);
        setTimeout(() => {
          tests.fail("npm test exited with code 1: 2 of 98 tests failed.");
          stream(reply, "Custom elements get **connectedCallback** when they join the page and **disconnectedCallback** when they leave. The tests failed, so I haven't changed `src/main.ts` yet.");
        }, 3200);
      };
      run();
      root.querySelector(".rerun")!.addEventListener("click", run);
    },
  },
  {
    id: "sources",
    title: "<ai-sources>",
    intro:
      "The sources a reply drew on. In a message, its [1] markers become links to them, with a preview on hover or focus. max shows the first few, and the rest open from Show more.",
    html: `<ai-message class="cited-reply">
  Custom elements are part of the HTML Standard [3], and get callbacks when they join or leave the page [2]. Shadow DOM keeps their styles apart [1]. In code, \`items[1]\` stays as written.
  <ai-sources slot="footer" max="2"></ai-sources>
</ai-message>`,
    script: `const sources = document.createElement("ai-sources")
sources.slot = "footer"
sources.max = 2
sources.sources = [
  { title: "Web components", url: "https://developer.mozilla.org/…", description: "…" },
  …
]
reply.append(sources)`,
    setup: (root) => {
      root.querySelector("ai-sources")!.sources = [
        {
          title: "Web components",
          url: "https://developer.mozilla.org/docs/Web/API/Web_components",
          description: "A suite of technologies for creating reusable custom elements.",
        },
        {
          title: "Using custom elements",
          url: "https://developer.mozilla.org/docs/Web/API/Web_components/Using_custom_elements",
          description: "How to define a custom element, and the lifecycle callbacks it gets.",
        },
        {
          title: "Custom elements",
          url: "https://html.spec.whatwg.org/multipage/custom-elements.html",
          site: "HTML Standard",
          description: "The specification for defining and upgrading custom elements.",
        },
      ];
    },
  },
  {
    id: "suggestions",
    title: "<ai-suggestions>",
    intro:
      "Prompts people can send with one press. The first set sends through the composer it names with for; the second, a stacked list of follow-ups, only fills the box to edit first.",
    html: `<ai-suggestions for="suggestions-composer">
  <ul>
    <li>What's a custom element?</li>
    <li>Write a haiku about web components</li>
  </ul>
</ai-suggestions>
<ai-suggestions class="follow-up-list" for="suggestions-composer" action="fill" layout="list" label="Follow-up questions"></ai-suggestions>
<ai-composer id="suggestions-composer" label="Prompt with suggestions"></ai-composer>`,
    script: `followUps.suggestions = [
  "Show me a smaller example",
  { label: "Explain the README", value: "/explain @README.md", description: "Section by section" },
]`,
    setup: (root) => {
      root.querySelector<HTMLElementTagNameMap["ai-suggestions"]>(".follow-up-list")!.suggestions = [
        "Show me a smaller example",
        { label: "Explain the README", value: "/explain @README.md", description: "Section by section" },
      ];
    },
  },
  {
    id: "question",
    title: "<ai-question>",
    intro:
      "A question the model asks, with choices. One choice uses radio buttons; multiple uses checkboxes, and max caps how many. other adds a last choice with a text box for an answer of one's own. Once sent, it shows the answer and the choices stay readable.",
    html: `<ai-question class="city-question" question="Which city should the trip start in?" other skippable></ai-question>
<ai-question class="plans-question" question="What would you like to do there?" multiple max="2" other>
  <ul>
    <li>Museums</li>
    <li>Food</li>
    <li>Beaches</li>
    <li>Nightlife</li>
  </ul>
</ai-question>
<button type="button" class="reset-questions">Ask again</button>`,
    script: `question.options = ["Paris", "Rome", { value: "Lisbon", description: "The cheapest flights this month" }]
question.addEventListener("questionanswer", (event) => send(event.detail.labels.join(", ")))
question.answer = savedAnswer // shows a saved answer, like when a chat opens again`,
    setup: (root) => {
      root.querySelector<HTMLElementTagNameMap["ai-question"]>(".city-question")!.options = [
        "Paris",
        "Rome",
        { value: "Lisbon", description: "The cheapest flights this month" },
      ];
      root.querySelector(".reset-questions")!.addEventListener("click", () => {
        for (const question of root.querySelectorAll("ai-question")) question.reset();
      });
    },
  },
  {
    id: "syntax",
    title: "Syntax colouring",
    intro:
      "Code blocks are coloured by a small built-in highlighter that never parses code as HTML. Each colour passes 4.5:1 contrast in light and dark. Set highlighter to your own function, or to null for plain code.",
    html: `<ai-message class="syntax-sample"></ai-message>
<button type="button" class="toggle-colouring" aria-pressed="true">Colouring on</button>`,
    script: `message.highlighter = null // plain code
message.highlighter = (code, language) => myHighlighter(code, language) // your own`,
    setup: (root) => {
      const message = root.querySelector<HTMLElementTagNameMap["ai-message"]>(".syntax-sample")!;
      message.text = [
        "```ts",
        "interface Chat { id: string; title: string }",
        "export async function load(id: string): Promise<Chat | null> {",
        "  const response = await fetch(`/api/chats/${id}`); // one request",
        "  return response.ok ? response.json() : null;",
        "}",
        "```",
        "",
        "```css",
        "@media (prefers-color-scheme: dark) {",
        "  ai-message { --ai-message-max-width: 70ch; color: #e8e8e8; }",
        "}",
        "```",
        "",
        "```bash",
        "$ npm install --save-dev vitest # tests",
        'echo "Built in $SECONDS seconds"',
        "```",
        "",
        "```python",
        "@dataclass",
        "class Chat:",
        "    title: str = \"New chat\"  # shown in the sidebar",
        "    def rename(self, title: str) -> None:",
        "        self.title = title",
        "```",
        "",
        "```sql",
        "SELECT title, updated_at FROM chats WHERE owner = 'me' ORDER BY updated_at DESC LIMIT 20;",
        "```",
        "",
        "```diff",
        "@@ -1,2 +1,2 @@",
        "-<ai-composer></ai-composer>",
        "+<ai-composer attachments voice></ai-composer>",
        "```",
      ].join("\n");
      const toggle = root.querySelector<HTMLButtonElement>(".toggle-colouring")!;
      toggle.addEventListener("click", () => {
        const on = toggle.getAttribute("aria-pressed") !== "true";
        message.highlighter = on ? highlight : null;
        toggle.setAttribute("aria-pressed", String(on));
        toggle.textContent = on ? "Colouring on" : "Colouring off";
      });
    },
  },
  {
    id: "transcript",
    title: "<ai-transcript>",
    intro:
      "The scrolling conversation. It follows a streaming reply while you're at the bottom, stays put if you scroll up to read, and offers Jump to latest. Screen readers hear each finished reply once.",
    html: `<ai-transcript class="short-transcript">
  <p slot="empty">No messages yet.</p>
</ai-transcript>
<button type="button" class="add-reply">Add a long reply</button>`,
    script: `<ai-transcript>
  <p slot="empty">What can I help with?</p>
  <!-- <ai-message> elements go here -->
</ai-transcript>`,
    setup: (root) => {
      const transcript = root.querySelector("ai-transcript")!;
      let count = 0;
      root.querySelector(".add-reply")!.addEventListener("click", () => {
        count += 1;
        const question = Object.assign(document.createElement("ai-message"), { from: "user" as const, text: `Question ${count}` });
        const reply = document.createElement("ai-message");
        transcript.append(question, reply);
        const paragraphs = Array.from({ length: 8 }, (_, index) => `Paragraph ${index + 1} of reply ${count}. Scroll up while this streams: the view stays where you put it.`);
        stream(reply, paragraphs.join("\n\n"));
      });
    },
  },
  {
    id: "chat-list",
    title: "<ai-chat-list>",
    intro:
      "Saved chats for a sidebar: New chat, chats grouped by day, and Rename, Export and Delete in each chat's menu. Delete asks first. The list shows the chats you give it; saving them is up to your page.",
    html: `<ai-chat-list class="sample-chats" actions="rename export delete" selected="today"></ai-chat-list>`,
    script: `list.chats = [{ id: "today", title: "Web components", updatedAt: Date.now() }, …]
list.href = (chat) => \`#chat/\${chat.id}\` // optional: chats become links
list.addEventListener("chatnew", startNewChat)
list.addEventListener("chatrename", (event) => saveTitle(event.detail.id, event.detail.title))
list.addEventListener("chatdelete", (event) => removeChat(event.detail.id))`,
    setup: (root) => {
      const list = root.querySelector<HTMLElementTagNameMap["ai-chat-list"]>(".sample-chats")!;
      const now = Date.now();
      const dayLength = 24 * 60 * 60 * 1000;
      list.chats = [
        { id: "today", title: "Web components explained", updatedAt: now },
        { id: "haiku", title: "A haiku about custom elements", updatedAt: now - dayLength },
        { id: "theme", title: "Dark mode colours for the composer", updatedAt: now - 3 * dayLength },
        { id: "trip", title: "Trip ideas for the team offsite", updatedAt: now - 40 * dayLength },
      ];
      let count = 0;
      list.addEventListener("chatselect", (event) => (list.selected = event.detail.id));
      list.addEventListener("chatnew", () => {
        count += 1;
        const id = `new-${count}`;
        list.chats = [{ id, title: `New chat ${count}`, updatedAt: Date.now() }, ...list.chats];
        list.selected = id;
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
    <h1>AI chat components</h1>
    <p>Live examples of <code>&lt;ai-composer&gt;</code>, <code>&lt;ai-message&gt;</code>, <code>&lt;ai-transcript&gt;</code>, <code>&lt;ai-thinking&gt;</code>, <code>&lt;ai-tool-call&gt;</code>, <code>&lt;ai-sources&gt;</code>, <code>&lt;ai-suggestions&gt;</code>, <code>&lt;ai-question&gt;</code> and <code>&lt;ai-chat-list&gt;</code>. Each has a README with its full API in <code>packages/ui-components/</code>.</p>
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
      ${
        demo.noCode
          ? ""
          : `<details class="demo-code">
        <summary>Code</summary>
        <pre><code>${escape(demo.html)}</code></pre>
        ${demo.script ? `<pre><code>${escape(demo.script)}</code></pre>` : ""}
      </details>`
      }
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
