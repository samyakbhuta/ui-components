import "@ui-sdk/web/button";
import "@ui-sdk/web/drawer";
import "@samyakbhuta/ui-components/ai-chat-list";
import "@samyakbhuta/ui-components/ai-composer";
import "@samyakbhuta/ui-components/ai-message";
import "@samyakbhuta/ui-components/ai-thinking";
import "@samyakbhuta/ui-components/ai-tool-call";
import "@samyakbhuta/ui-components/ai-sources";
import "@samyakbhuta/ui-components/ai-suggestions";
import "@samyakbhuta/ui-components/ai-question";
import "@samyakbhuta/ui-components/ai-approval";
import "@samyakbhuta/ui-components/ai-plan";
import type { QuestionElementEventMap } from "@samyakbhuta/ui-components/ai-question";
import type { ApprovalElementEventMap } from "@samyakbhuta/ui-components/ai-approval";
import type { PlanElementEventMap } from "@samyakbhuta/ui-components/ai-plan";
import "@samyakbhuta/ui-components/ai-notice";
import { type NoticeElementEventMap, resetDate } from "@samyakbhuta/ui-components/ai-notice";
import "@samyakbhuta/ui-components/ai-questions";
import type { Source } from "@samyakbhuta/ui-components/ai-sources";
import "@samyakbhuta/ui-components/ai-transcript";
import {
  type ComposerCommands,
  type ComposerOption,
  type ComposerReferences,
  defaultModels,
  defaultModes,
  defaultThinkingLevels,
  type PromptSubmitDetail,
  quotesToMarkdown,
} from "@samyakbhuta/ui-components/ai-composer";
import type { AiMessageElement } from "@samyakbhuta/ui-components/ai-message";
import {
  ChatStore,
  chatToMarkdown,
  download,
  markdownFileName,
  newChatId,
  type StoredChat,
  type StoredMessage,
  type StoredApproval,
  type StoredPlan,
  type StoredNotice,
  type StoredQuestionSet,
  type StoredPrompt,
  type StoredQuestion,
  type StoredScript,
  type StoredToolCall,
  titleFrom,
} from "./chat-store.ts";

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
  "Show me a reply that fails",
  "What are web components? Cite your sources",
  "Plan a weekend trip for me",
  "Clean up my project's build folder",
  "Plan a surprise birthday party",
  "Help me pick a gift",
  "Show me the usage limit",
];

/** Asking about the usage limit makes the pretend assistant hit one, with <ai-notice>. */
const limiting = (text: string) => /\blimit\b/i.test(text);

/** The usage limit the pretend assistant hits. It resets two minutes from now, so the unlock can be seen. */
export function usageLimit(): StoredNotice {
  return {
    heading: "You've reached your usage limit",
    text: "You've used this plan's messages for now. Upgrade, or carry on another way.",
    resetsAt: new Date(Date.now() + 2 * 60_000).toISOString(),
    actions: [
      { value: "upgrade", label: "Upgrade plan", href: "#pricing", primary: true },
      { value: "smaller-model", label: "Switch to a smaller model" },
      { value: "extra", label: "Use extra credits" },
      { value: "notify", label: "Notify me" },
    ],
  };
}

/** What the pretend assistant says after a way round the limit. */
export function limitReply(step: NonNullable<StoredScript["limit"]>) {
  if (step === "smaller-model") return "Switched to **Haiku 5.5**, which has its own allowance. You can carry on.";
  if (step === "extra") return "Extra usage is on, so you can carry on. It's billed per message until your limit resets.";
  return "";
}

/** Asking for help with a gift makes the pretend assistant ask three questions at once, with <ai-questions>. */
const gifting = (text: string) => /\bgift\b/i.test(text);

/** The questions the pretend assistant asks about the gift. */
export const giftQuestions: StoredQuestionSet = {
  label: "About the gift",
  questions: [
    { question: "Who is it for?", options: ["A friend", "A parent", "A child"], other: true },
    { question: "What do they enjoy?", options: ["Books", "Cooking", "Games", "Gardening"], multiple: true, max: 2 },
    { question: "What's your budget?", options: ["Under £20", "£20 to £50", "Over £50"], skippable: true },
  ],
};

/** What the pretend assistant says about the gift, before and after the answers. */
export function giftReply(answers?: StoredQuestionSet["answers"]) {
  if (!answers) return "Happy to help. Three quick questions first, so the ideas fit.";
  const said = (index: number) => {
    const answer = answers[index];
    return answer && !("skipped" in answer) ? answer.labels.join(" and ").toLowerCase() : "";
  };
  const who = said(0) || "them";
  const likes = said(1) || "a bit of everything";
  const budget = said(2) ? ` and ${said(2).replace(/^under/, "under").replace(/^over/, "over")}` : "";
  return `Some ideas for ${who}, who enjoys ${likes}${budget}:\n\n- A beautiful book about what they love.\n- A class or workshop you could do together.\n- A handmade voucher for a day out, with a small treat to open on the day.`;
}

/** Asking for a party makes the pretend agent propose a plan first, with <ai-plan>. */
const throwingParty = (text: string) => /\bparty\b/i.test(text);

/** The plan the pretend agent proposes for the party. */
export const partyPlan: StoredPlan = {
  heading: "Surprise party for Sam's 40th",
  summary: "Five steps, about three weeks. Nothing is booked yet.",
  plan: [
    "## Steps",
    "",
    "1. Pick a date: the Saturday after Sam's birthday.",
    "2. Make a guest list, and send invites by message.",
    "3. Book the back room at a local restaurant.",
    "4. Order a cake and some decorations.",
    "5. Keep it secret: a cover story for the evening.",
    "",
    "## Not doing",
    "",
    "- Spending more than the budget you set.",
    "- Telling Sam.",
  ].join("\n"),
  accepts: [{ value: "auto", label: "auto mode" }],
};

/** What the pretend agent says at each step of the party plan. */
export function partyReply(step: NonNullable<StoredScript["party"]>, mode?: string, feedback?: string) {
  if (step === "ask") return "Lovely idea! Here's how I'd plan it. Open the plan to read the steps.";
  if (step === "accepted")
    return mode === "auto"
      ? "Starting in **Auto** mode, so I'll go through all five steps and only check back if something needs you. First up: the guest list."
      : "Starting with the guest list. I'll check with you after each step.";
  if (step === "rejected") return "OK, no party plans for now.";
  return `Got it: *${(feedback ?? "").replace(/[*_\\`]/g, "\\$&")}*. A real assistant would rework the plan around that and show it to you again.`;
}

/** Asking to clean up makes the pretend agent ask before it deletes anything, with <ai-approval>. */
const cleaning = (text: string) => /\bclean\s*up\b|\bbuild folder\b/i.test(text);

/** What the pretend agent asks to run when cleaning up. */
export const cleanupApproval: StoredApproval = {
  name: "run_command",
  label: "Run a command",
  description: "This deletes files in your project, and can't be undone.",
  input: "rm -rf dist",
  always: true,
  reason: true,
};

/** What the pretend agent says at each step of the cleanup. */
export function cleanupReply(step: NonNullable<StoredScript["cleanup"]>, reason?: string) {
  if (step === "ask") return "I can clear out the build folder, `dist/`. It holds 42 files left over from old builds.";
  if (step === "allowed") return "Done. The build folder is gone, and your next build will make it again.";
  return reason
    ? `OK, I won't run that. You suggested instead: *${reason.replace(/[*_\\`]/g, "\\$&")}*. A real agent would try that next.`
    : "OK, I won't run that. The build folder stays as it is.";
}

/** Asking to plan a trip makes the pretend model ask questions first, with <ai-question>. */
const planning = (text: string) => /\btrip\b/i.test(text);

/** The questions of the pretend trip planner, by step. */
export const tripQuestions: Record<number, StoredQuestion> = {
  1: {
    step: 1,
    question: "Which city should the trip start in?",
    options: ["Paris", "Rome", { value: "Lisbon", description: "The cheapest flights this month" }],
    other: true,
    skippable: true,
  },
  2: {
    step: 2,
    question: "What would you like to do there?",
    options: ["Museums", "Food", "Beaches", "Nightlife"],
    multiple: true,
    max: 3,
    other: true,
  },
};

const waitingPlaceholder = {
  question: "Answer the question above, or type your answer",
  approval: "Allow or deny above, or tell it what to do instead",
  plan: "Accept or reject the plan above, or say what to change",
};

/** What a chat's last reply is waiting on: an answer, an approval, or nothing. */
const waitsOn = (messages: StoredMessage[]) => {
  const last = messages.at(-1);
  if (last?.from !== "assistant") return null;
  if (last.question && !last.question.answer) return "Needs your answer";
  if (last.approval && !last.approval.decision) return "Needs your approval";
  if (last.plan && !last.plan.decision) return "Needs your review";
  if (last.questionSet && !last.questionSet.answers) return "Needs your answers";
  return null;
};

/** An answer typed in the composer: the choice it names, or else an answer of one's own. */
export function typedAnswer(question: { options: StoredQuestion["options"]; multiple: boolean }, text: string) {
  const typed = text.trim();
  const choices = question.options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : { value: option.value, label: option.label ?? option.value },
  );
  const match = choices.find((choice) => choice.label.toLowerCase() === typed.toLowerCase());
  const answer = match
    ? { value: match.value, labels: [match.label], other: null }
    : { value: typed, labels: [typed], other: typed };
  return question.multiple ? { ...answer, value: [answer.value] } : answer;
}

/** What the pretend trip planner says at each step: ask, ask again, then plan. */
export function tripReply(step: number, answer: string, city: string) {
  if (step === 1) return "Happy to help plan a weekend away! First, a couple of questions.";
  if (step === 2) return `${city} it is. One more question.`;
  const plans = answer.split(/,\s*/).filter(Boolean);
  return [
    `## A weekend in ${city}`,
    "",
    `**Saturday:** start with ${plans[0]?.toLowerCase() ?? "a walk"} in the morning, then a long lunch.`,
    `**Sunday:** ${plans[1] ? `${plans[1].toLowerCase()} in the afternoon` : "a slow morning"}${plans[2] ? `, and ${plans[2].toLowerCase()} to finish` : ""}.`,
    "",
    "— pretend trip planner",
  ].join("\n");
}

/** Asking for sources makes the pretend model cite these. */
const citing = (text: string) => /\b(?:cite|sources?)\b/i.test(text);

export const pretendSources: Source[] = [
  {
    title: "Web components",
    url: "https://developer.mozilla.org/docs/Web/API/Web_components",
    description: "A suite of technologies for creating reusable custom elements, with their functionality kept away from the rest of your code.",
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

/** Follow-up questions offered under the newest reply. */
const followUps = (detail: PromptSubmitDetail) =>
  /haiku/i.test(detail.text)
    ? ["Write another one", "Make it about shadow DOM"]
    : ["Show me a smaller example", "How do I test this?"];

/** Asking for a failure makes the pretend model stop half way, to show an error. */
const failing = (text: string) => /\bfails?\b/i.test(text);

/** Pretend contents for files people reference with @. */
const pretendFile = (path: string) =>
  path.endsWith(".json")
    ? '{\n  "name": "web-components-app",\n  "type": "module"\n}'
    : path.endsWith(".md")
      ? "# Web components\n\nA showcase of AI chat components built on ui-sdk."
      : 'import "./styles/base.css";\nimport { mountChatShell } from "./experiments/chat-shell/chat-shell.ts";';

/** How long the pretend model thinks at each level, in milliseconds. */
const thinkingTime: Record<string, number> = { off: 0, low: 1500, medium: 3000, high: 5000 };

const labelOf = (options: ComposerOption[], value: unknown) => options.find((option) => option.value === value)?.label ?? "";

const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const icons = {
  chats: icon('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  close: icon('<path d="M18 6 6 18M6 6l12 12"/>'),
  download: icon('<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>'),
  newChat: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
};

/** A pretend reply in Markdown, to show what replies can hold. */
export function pretendReply(detail: PromptSubmitDetail) {
  const model = labelOf(defaultModels, detail.model);
  const mode = labelOf(defaultModes, detail.mode);
  const quotes = detail.quotes ?? [];
  if (quotes.length) {
    return [
      "You wrote, with your quotes in place:",
      "",
      quotesToMarkdown(detail.text, quotes),
      "",
      "A real model would answer that, about the words you quoted.",
      "",
      `— pretend **${model}**`,
    ].join("\n");
  }
  if (citing(detail.text)) {
    return [
      "Web components are a set of browser features for making your own reusable HTML elements [1].",
      "",
      "- **Custom elements** let you define a tag, like `<ai-message>`, and react when it joins or leaves the page [2].",
      "- **Shadow DOM** keeps an element's markup and styles apart from the page's.",
      "- The rules for defining and upgrading elements are in the HTML Standard [3].",
      "",
      `— pretend **${model}**`,
    ].join("\n");
  }
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
    "Then start the page:",
    "",
    "```bash",
    "npm run dev # opens http://localhost:5173",
    "```",
    "",
    "> Replies are rendered safely: HTML in the text shows as text, like <b>this</b>.",
  ].join("\n");
}

type Options = {
  /** Scales every pretend delay; tests pass 0. */
  speed?: number;
  store?: ChatStore;
};

/** Mounts the chat page. Returns a function that removes its page-wide listeners. */
export function mountChatShell(root: HTMLElement, { speed = 1, store = new ChatStore() }: Options = {}) {
  root.innerHTML = `
    <div class="chat-app">
      <div class="chat-sidebar"></div>
      <div class="chat-shell">
        <header class="chat-header">
          <ui-drawer class="chats-drawer" side="start">
            <ui-drawer-trigger>
              <button type="button" class="header-button" aria-label="Chats" title="Chats">${icons.chats}</button>
            </ui-drawer-trigger>
            <ui-drawer-backdrop class="drawer-backdrop" hidden></ui-drawer-backdrop>
            <ui-drawer-content class="drawer-sheet" hidden>
              <div class="drawer-header">
                <ui-drawer-title class="drawer-title">Chats</ui-drawer-title>
                <ui-drawer-close>
                  <button type="button" class="header-button" aria-label="Close" title="Close">${icons.close}</button>
                </ui-drawer-close>
              </div>
              <div class="drawer-list"></div>
              <a class="drawer-back" href="/showcase.html">← Showcase</a>
            </ui-drawer-content>
          </ui-drawer>
          <a class="back" href="/showcase.html">← Showcase</a>
          <h1 class="chat-title">New chat</h1>
          <div class="header-actions">
            <ui-button class="export-chat" disabled>
              <button type="button" class="header-button" aria-label="Export as Markdown" title="Export as Markdown">${icons.download}</button>
            </ui-button>
            <ui-button class="header-new-chat">
              <button type="button" class="header-button" aria-label="Start a new chat" title="New chat">${icons.newChat}</button>
            </ui-button>
          </div>
        </header>
        <ai-transcript class="transcript" quotable for="chat-composer">
          <div slot="empty" class="transcript-empty">
            <h2>What can I help with?</h2>
            <p>Type <kbd>/</kbd> for commands or <kbd>@</kbd> to reference a file. Drop or paste files to attach them, and press <kbd>↑</kbd> for earlier prompts.</p>
            <ai-suggestions class="starters" for="chat-composer"></ai-suggestions>
          </div>
        </ai-transcript>
        <ai-composer id="chat-composer" class="composer" attachments voice history persist="chat-shell" paste-as-file max-length="8000"
          default-mode="auto" default-model="sonnet-5.5" default-thinking="medium"></ai-composer>
      </div>
    </div>
  `;

  const page = new AbortController();
  const list = document.createElement("ai-chat-list");
  list.setAttribute("actions", "rename export delete");
  list.href = (chat) => `#chat/${encodeURIComponent(chat.id)}`;
  const sidebar = root.querySelector<HTMLElement>(".chat-sidebar")!;
  const drawer = root.querySelector("ui-drawer")!;
  const drawerList = root.querySelector<HTMLElement>(".drawer-list")!;
  const heading = root.querySelector<HTMLElement>(".chat-title")!;
  const exportButton = root.querySelector<HTMLElementTagNameMap["ui-button"]>(".export-chat")!;
  const transcript = root.querySelector("ai-transcript")!;
  const composer = root.querySelector("ai-composer")!;
  composer.modes = defaultModes;
  composer.models = defaultModels;
  composer.thinkingLevels = defaultThinkingLevels;
  composer.commands = commands;
  composer.references = references;
  root.querySelector("ai-suggestions")!.suggestions = suggestions;

  // On narrow screens the chat list lives in a drawer; on wide ones, in the sidebar.
  const narrow = window.matchMedia?.("(max-width: 52rem)");
  const placeList = () => {
    const target = narrow?.matches ? drawerList : sidebar;
    if (list.parentElement !== target) target.append(list);
  };
  placeList();
  narrow?.addEventListener("change", placeList, { signal: page.signal });

  const blankChat = (id = newChatId()): StoredChat => ({ id, title: "", createdAt: Date.now(), updatedAt: Date.now(), messages: [] });
  let current = blankChat();
  /** What each reply answered, so Retry can ask again. */
  const asked = new WeakMap<AiMessageElement, PromptSubmitDetail>();
  /** The settings each prompt went with, for saving. */
  const prompts = new WeakMap<AiMessageElement, StoredPrompt>();
  /** Every version of a reply after Retry, oldest first. */
  const versionTexts = new WeakMap<AiMessageElement, string[]>();
  /** Why the newest version of a reply failed, to show again when people step back to it. */
  const latestError = new WeakMap<AiMessageElement, string | null>();
  /** Which scripted conversation a reply belongs to, and where in it, so Retry continues it. */
  const scripts = new WeakMap<AiMessageElement, StoredScript>();
  let stopReply: (() => void) | undefined;
  let replying: Promise<void> | undefined;

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

  const messages = () => [...transcript.querySelectorAll<AiMessageElement>("ai-message")];

  // ---- Saving and opening chats ---------------------------------------------------------------

  /** The newest reply's question or approval, while it waits on the person. */
  const openRequest = () =>
    messages().at(-1)?.querySelector<HTMLElementTagNameMap["ai-question"] | HTMLElementTagNameMap["ai-approval"] | HTMLElementTagNameMap["ai-plan"] | HTMLElementTagNameMap["ai-questions"]>(
      "ai-questions:not([answered]), ai-question:not([answered]):not(ai-questions ai-question), ai-approval:not([decided]), ai-plan:not([decided])",
    ) ?? null;

  function showTitle() {
    syncLock();
    const title = current.title || "New chat";
    heading.textContent = title;
    // While the agent waits on an answer, say so in the box, and in the tab's title when it's in the background.
    const request = openRequest();
    const waiting = request !== null;
    if (request) composer.setAttribute("placeholder", waitingPlaceholder[request.localName === "ai-approval" ? "approval" : request.localName === "ai-plan" ? "plan" : "question"]);
    else composer.removeAttribute("placeholder");
    // What's typed while an approval or a plan waits decides it, so an agent's Send needs the person too.
    const send = composer.querySelector<HTMLElement>("[data-part='send']");
    const confirm =
      request?.localName === "ai-approval"
        ? `Denies ${(request as HTMLElementTagNameMap["ai-approval"]).name || "this action"}, and tells it what's typed instead`
        : request?.localName === "ai-plan"
          ? "Asks for changes to the plan, as typed"
          : "";
    if (send && confirm) send.dataset.agentConfirm = confirm;
    else if (send) delete send.dataset.agentConfirm;
    document.title = `${waiting && document.hidden ? "Waiting for you · " : ""}${title} · AI chat`;
    exportButton.disabled = current.messages.length === 0;
  }

  function refreshList() {
    list.chats = store.list().map(({ id, title, updatedAt, messages }) => ({
      id,
      title,
      updatedAt,
      status: waitsOn(messages) ?? undefined,
    }));
    list.selected = store.get(current.id) ? current.id : null;
  }

  /** Reads the conversation back out of the page. */
  function serialize(): StoredMessage[] {
    return messages()
      .filter((message) => !message.streaming)
      .map((message) => {
        const thinking = message.querySelector("ai-thinking");
        const tools = [...message.querySelectorAll("ai-tool-call")]
          .filter((call) => call.status !== "running")
          .map((call): StoredToolCall => ({
            name: call.name,
            summary: call.summary,
            input: call.input,
            output: call.status === "done" ? call.output : undefined,
            error: call.status === "error" ? call.error : undefined,
          }));
        const texts = versionTexts.get(message);
        return {
          from: message.from,
          text: message.text,
          meta: message.querySelector(".message-meta")?.textContent ?? undefined,
          createdAt: message.getAttribute("time") ?? undefined,
          quotes: message.quotes.length ? message.quotes : undefined,
          model: message.model || undefined,
          prompt: prompts.get(message),
          thinking: thinking
            ? { seconds: thinking.duration ?? Math.round(thinking.elapsed / 1000), reasoning: thinking.reasoning }
            : undefined,
          tools: tools.length ? tools : undefined,
          sources: message.querySelector("ai-sources")?.sources,
          error: message.error ?? undefined,
          feedback: message.feedback ?? undefined,
          versions: texts && texts.length > 1 ? [...texts] : undefined,
          version: texts && texts.length > 1 ? message.version : undefined,
          question: questionOf(message),
          approval: approvalOf(message),
          plan: planOf(message),
          notice: noticeOf(message),
          questionSet: questionSetOf(message),
          script: scripts.get(message),
        };
      });
  }

  function questionOf(message: AiMessageElement): StoredQuestion | undefined {
    // A set's questions are saved with the set.
    const asking = message.querySelector("ai-question:not(ai-questions ai-question)") as HTMLElementTagNameMap["ai-question"] | null;
    if (!asking) return undefined;
    return {
      question: asking.question,
      options: asking.options,
      multiple: asking.multiple || undefined,
      other: asking.other || undefined,
      max: asking.max ?? undefined,
      skippable: asking.skippable || undefined,
      step: Number(asking.dataset.step) || undefined,
      answer: asking.answer ?? undefined,
    };
  }

  function questionFor(stored: StoredQuestion) {
    const asking = document.createElement("ai-question");
    asking.slot = "footer";
    asking.question = stored.question;
    asking.options = stored.options;
    asking.multiple = stored.multiple ?? false;
    asking.other = stored.other ?? false;
    asking.max = stored.max ?? null;
    asking.skippable = stored.skippable ?? false;
    if (stored.step) asking.dataset.step = String(stored.step);
    if (stored.answer) asking.answer = stored.answer;
    return asking;
  }

  function approvalOf(message: AiMessageElement): StoredApproval | undefined {
    const asking = message.querySelector("ai-approval");
    if (!asking) return undefined;
    return {
      name: asking.name,
      label: asking.label || undefined,
      description: asking.description || undefined,
      input: asking.input,
      always: asking.always || undefined,
      reason: asking.reason || undefined,
      decision: asking.decision ?? undefined,
    };
  }

  function approvalFor(stored: StoredApproval) {
    const asking = document.createElement("ai-approval");
    asking.slot = "footer";
    asking.name = stored.name;
    if (stored.label) asking.label = stored.label;
    if (stored.description) asking.description = stored.description;
    asking.input = stored.input;
    asking.always = stored.always ?? false;
    asking.reason = stored.reason ?? false;
    if (stored.decision) asking.decision = stored.decision;
    return asking;
  }

  function questionSetOf(message: AiMessageElement): StoredQuestionSet | undefined {
    const set = message.querySelector("ai-questions");
    if (!set) return undefined;
    return { label: set.label || undefined, questions: set.questions, answers: set.answers ?? undefined };
  }

  function questionSetFor(stored: StoredQuestionSet) {
    const set = document.createElement("ai-questions");
    set.slot = "footer";
    if (stored.label) set.label = stored.label;
    set.questions = stored.questions;
    if (stored.answers) set.answers = stored.answers;
    return set;
  }

  function planOf(message: AiMessageElement): StoredPlan | undefined {
    const proposed = message.querySelector("ai-plan");
    if (!proposed) return undefined;
    return {
      heading: proposed.heading || undefined,
      summary: proposed.summary || undefined,
      plan: proposed.plan,
      accepts: proposed.accepts.length ? proposed.accepts : undefined,
      decision: proposed.decision ?? undefined,
    };
  }

  function noticeOf(message: AiMessageElement): StoredNotice | undefined {
    const notice = message.querySelector("ai-notice");
    if (!notice) return undefined;
    return {
      heading: notice.heading,
      text: notice.text || undefined,
      tone: notice.getAttribute("tone") ? notice.tone : undefined,
      resetsAt: resetDate(notice.resetsAt)?.toISOString(),
      actions: notice.actions.length ? notice.actions.map((action) => ({ ...action })) : undefined,
      unlocked: notice.hasAttribute("data-unlocked") || undefined,
    };
  }

  function noticeFor(stored: StoredNotice) {
    const notice = document.createElement("ai-notice");
    notice.slot = "footer";
    notice.heading = stored.heading;
    if (stored.tone) notice.tone = stored.tone;
    notice.text = stored.text ?? "";
    notice.actions = stored.actions ?? [];
    if (stored.resetsAt) notice.resetsAt = stored.resetsAt;
    notice.toggleAttribute("data-unlocked", Boolean(stored.unlocked));
    return notice;
  }

  /**
   * While a usage limit applies, the box is locked and says until when. Choosing a way round it,
   * or the reset time passing, unlocks it.
   */
  const unlockedHint = composer.getAttribute("hint");
  function syncLock() {
    const notices = [...transcript.querySelectorAll("ai-notice")];
    const latest = notices.at(-1);
    const locking = latest && !latest.hasAttribute("expired") && !latest.hasAttribute("data-unlocked") ? latest : null;
    composer.disabled = locking !== null;
    if (locking) {
      const until = resetDate(locking.resetsAt);
      composer.setAttribute(
        "hint",
        until ? `Sending is paused until ${until.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : "Sending is paused. See the notice above.",
      );
    } else if (unlockedHint === null) composer.removeAttribute("hint");
    else composer.setAttribute("hint", unlockedHint);
  }

  function planFor(stored: StoredPlan) {
    const proposed = document.createElement("ai-plan");
    proposed.slot = "footer";
    if (stored.heading) proposed.heading = stored.heading;
    if (stored.summary) proposed.summary = stored.summary;
    proposed.plan = stored.plan;
    proposed.accepts = stored.accepts ?? [];
    if (stored.decision) proposed.decision = stored.decision;
    return proposed;
  }

  /** Saves the open chat once it has a message, and gives it a link. */
  function save() {
    current.messages = serialize();
    if (current.messages.length === 0 && !store.get(current.id)) return showTitle();
    if (!current.title) current.title = titleFrom(current.messages.find((message) => message.from === "user")?.text ?? "") || "New chat";
    current.updatedAt = Date.now();
    store.put({ ...current, messages: [...current.messages] });
    const link = `#chat/${encodeURIComponent(current.id)}`;
    if (location.hash !== link) history.replaceState(null, "", link);
    refreshList();
    showTitle();
  }

  const detailFrom = (text: string, prompt: StoredPrompt): PromptSubmitDetail => ({
    text,
    mode: prompt.mode,
    model: prompt.model,
    thinking: prompt.thinking,
    command: prompt.command,
    references: prompt.references,
    files: prompt.files.map((name) => new File([], name)),
  });

  function userMessage(text: string, line: string, prompt?: StoredPrompt, files?: File[]) {
    const message = document.createElement("ai-message");
    message.from = "user";
    message.text = text;
    message.attachments = files ?? prompt?.files.map((name) => ({ name })) ?? [];
    message.append(meta(line));
    if (prompt) prompts.set(message, prompt);
    return message;
  }

  /** A reply's message, with Good response and Bad response. */
  function replyMessage() {
    const message = document.createElement("ai-message");
    message.setAttribute("actions", "copy retry feedback");
    return message;
  }

  function sourcesFor(list: Source[]) {
    const sources = document.createElement("ai-sources");
    sources.slot = "footer";
    sources.max = 2;
    sources.sources = list;
    return sources;
  }

  /** Follow-up questions go under the newest reply only. */
  function offerFollowUps(message: AiMessageElement, questions: string[]) {
    for (const old of transcript.querySelectorAll("ai-suggestions.follow-ups")) old.remove();
    const offer = document.createElement("ai-suggestions");
    offer.className = "follow-ups";
    offer.slot = "footer";
    offer.layout = "list";
    offer.setAttribute("label", "Follow-up questions");
    offer.for = "chat-composer";
    offer.suggestions = questions;
    message.append(offer);
  }

  function toolCall(name: string, label: string, input: unknown) {
    const call = document.createElement("ai-tool-call");
    call.slot = "header";
    call.name = name;
    call.label = label;
    call.input = input;
    return call;
  }

  /** The thinking and tool calls belong to the newest version, so hide them while an older one shows. */
  function showWork(message: AiMessageElement, newest: boolean) {
    for (const part of message.querySelectorAll<HTMLElement>(":scope > ai-thinking, :scope > ai-tool-call")) part.hidden = !newest;
  }

  function savedReply(stored: StoredMessage) {
    const message = replyMessage();
    message.text = stored.text;
    if (stored.versions && stored.versions.length > 1) {
      versionTexts.set(message, [...stored.versions]);
      message.versions = stored.versions.length;
      message.version = stored.version ?? stored.versions.length;
    }
    if (stored.feedback) message.feedback = stored.feedback;
    if (stored.error !== undefined) message.error = stored.error;
    latestError.set(message, stored.versions && stored.version !== stored.versions.length ? null : (stored.error ?? null));
    if (stored.thinking) {
      const thinking = document.createElement("ai-thinking");
      thinking.slot = "header";
      thinking.status = "done";
      thinking.timer = true;
      thinking.duration = stored.thinking.seconds;
      thinking.reasoning = stored.thinking.reasoning;
      message.append(thinking);
    }
    for (const tool of stored.tools ?? []) {
      const call = toolCall(tool.name, "", tool.input);
      call.summary = tool.summary;
      if (tool.error !== undefined) {
        call.error = tool.error;
        call.status = "error";
      } else {
        call.output = tool.output;
        call.status = "done";
      }
      message.append(call);
    }
    if (stored.sources?.length) message.append(sourcesFor(stored.sources));
    if (stored.question) message.append(questionFor(stored.question));
    if (stored.approval) message.append(approvalFor(stored.approval));
    if (stored.questionSet) message.append(questionSetFor(stored.questionSet));
    if (stored.plan) message.append(planFor(stored.plan));
    if (stored.notice) message.append(noticeFor(stored.notice));
    if (stored.script) scripts.set(message, stored.script);
    if (stored.meta) message.append(meta(stored.meta));
    if (stored.createdAt) message.time = stored.createdAt;
    if (stored.model) message.model = stored.model;
    showWork(message, message.version === message.versions);
    return message;
  }

  /** Stops a reply that's streaming, and waits until it has been saved as stopped. */
  async function settleReply() {
    if (!stopReply) return;
    stopReply();
    await replying;
  }

  function show(chat: StoredChat) {
    current = { ...chat, messages: [...chat.messages] };
    for (const message of messages()) message.remove();
    let lastPrompt: PromptSubmitDetail | undefined;
    for (const stored of chat.messages) {
      if (stored.from === "user") {
        const message = userMessage(stored.text, stored.meta ?? "", stored.prompt);
        if (stored.createdAt) message.time = stored.createdAt;
        if (stored.quotes) message.quotes = stored.quotes;
        lastPrompt = stored.prompt ? detailFrom(stored.text, stored.prompt) : undefined;
        transcript.append(message);
      } else {
        const message = savedReply(stored);
        if (lastPrompt) asked.set(message, lastPrompt);
        transcript.append(message);
      }
    }
    transcript.scrollToLatest();
    refreshList();
    showTitle();
  }

  async function openChat(id: string) {
    await settleReply();
    const chat = store.get(id);
    show(chat ?? blankChat(id));
  }

  async function newChat() {
    await settleReply();
    if (store.get(current.id) || location.hash) history.pushState(null, "", location.pathname + location.search);
    if (store.get(current.id) || current.messages.length) show(blankChat());
    composer.focus();
  }

  /** Opens the chat named in the address, like #chat/1234. */
  function route() {
    const id = location.hash.match(/^#chat\/(.+)$/)?.[1];
    if (id) {
      const decoded = decodeURIComponent(id);
      if (decoded !== current.id) void openChat(decoded);
    } else if (store.get(current.id)) {
      void settleReply().then(() => show(blankChat()));
    }
  }
  window.addEventListener("hashchange", route, { signal: page.signal });

  // ---- Replies --------------------------------------------------------------------------------

  /** A pretend reply: think for as long as the level asks, then stream Markdown in. */
  async function reply(detail: PromptSubmitDetail, replacing?: AiMessageElement, script?: StoredScript) {
    const controller = new AbortController();
    const { signal } = controller;
    const message = replyMessage();
    message.streaming = true;
    message.time = new Date();
    if (detail.model) message.model = labelOf(defaultModels, detail.model);
    asked.set(message, detail);
    if (script) scripts.set(message, script);
    const earlier = replacing ? (versionTexts.get(replacing) ?? [replacing.text]) : [];
    if (earlier.length) {
      message.versions = earlier.length + 1;
      message.version = earlier.length + 1;
    }
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
      // Each @reference is read with a tool, the way an agent would.
      for (const reference of detail.references) {
        const call = toolCall("read_file", `Reading ${reference.label}…`, { path: reference.label });
        message.append(call);
        await wait(600, signal);
        call.summary = `Read ${reference.label}`;
        call.done(pretendFile(reference.label));
      }
      // With Always allow chosen in this chat, the cleanup runs without asking again.
      const preapproved = script?.cleanup === "ask" && (current.allowed ?? []).includes(cleanupApproval.name);
      if (script?.cleanup === "allowed" || preapproved) {
        const call = toolCall(cleanupApproval.name, "Running rm -rf dist…", cleanupApproval.input);
        message.append(call);
        await wait(600, signal);
        call.summary = "Ran rm -rf dist";
        call.done("Removed dist/ (42 files)");
        if (preapproved) message.append(meta(`Allowed without asking: you chose Always allow for ${cleanupApproval.name}`));
      }
      // Stream a few characters at a time, the way a model's tokens arrive.
      const text = script?.trip
        ? tripReply(script.trip, detail.text, firstAnswer() ?? "Lisbon")
        : script?.cleanup
          ? cleanupReply(preapproved ? "allowed" : script.cleanup, script.reason)
          : script?.party
            ? partyReply(script.party, script.mode, script.reason)
            : script?.gift
              ? giftReply(script.gift === "answered" ? giftAnswers() : undefined)
            : script?.limit
              ? limitReply(script.limit)
            : pretendReply(detail);
      const end = failing(detail.text) ? Math.floor(text.length / 3) : text.length;
      for (let index = 0; index < end; index += 6) {
        await wait(12, signal);
        message.appendText(text.slice(index, Math.min(index + 6, end)));
      }
      if (end < text.length) message.error = "The connection dropped. Press Retry to try again.";
      else {
        if (citing(detail.text)) message.append(sourcesFor(pretendSources));
        const asking = script?.trip && tripQuestions[script.trip]
          ? questionFor(tripQuestions[script.trip])
          : script?.cleanup === "ask" && !preapproved
            ? approvalFor(cleanupApproval)
            : script?.party === "ask"
              ? planFor(partyPlan)
              : script?.gift === "ask"
                ? questionSetFor(giftQuestions)
              : script?.limit === "ask"
                ? noticeFor(usageLimit())
              : undefined;
        if (asking) {
          // A question or an approval takes the place of follow-ups until it's settled.
          for (const old of transcript.querySelectorAll("ai-suggestions.follow-ups")) old.remove();
          message.append(asking);
          // An agent proposes a plan in Plan mode; accepting can switch it to another.
          if (asking.localName === "ai-plan") composer.mode = "plan";
        } else offerFollowUps(message, followUps(detail));
      }
    } catch {
      thinking?.remove();
      for (const call of message.querySelectorAll("ai-tool-call")) if (call.status === "running") call.fail("Stopped");
      message.append(meta("Stopped"));
    } finally {
      versionTexts.set(message, [...earlier, message.text]);
      latestError.set(message, message.error);
      message.done();
      stopReply = undefined;
      composer.busy = false;
      save();
    }
  }

  const startReply = (detail: PromptSubmitDetail, replacing?: AiMessageElement, script?: StoredScript) => {
    replying = reply(detail, replacing, script);
  };

  /** The city chosen in the trip planner's first question, if it was answered. */
  function firstAnswer() {
    const answer = transcript.querySelector<HTMLElementTagNameMap["ai-question"]>("ai-question[data-step='1']")?.answer;
    return answer && !("skipped" in answer) ? answer.labels[0] : undefined;
  }

  composer.addEventListener("promptstop", () => stopReply?.());

  composer.addEventListener("promptsubmit", (event) => {
    const detail = event.detail;
    if (detail.command === "clear") {
      for (const message of messages()) message.remove();
      save();
      return;
    }
    const request = openRequest();
    // With an approval open, what's typed denies it, as what to do instead.
    if (request?.localName === "ai-approval") {
      (request as HTMLElementTagNameMap["ai-approval"]).decision = { decision: "deny", reason: detail.text };
      return send(detail, { cleanup: "denied", reason: detail.text });
    }
    // With a set of questions open, what's typed answers the one showing.
    if (request?.localName === "ai-questions") {
      const set = request as HTMLElementTagNameMap["ai-questions"];
      const question = set.querySelectorAll("ai-question")[set.index];
      if (question) {
        const answer = typedAnswer(question, detail.text);
        if (!("skipped" in answer)) {
          question.value = answer.value;
          question.api.submit();
        }
      }
      return;
    }
    // With a plan open, what's typed asks for changes.
    if (request?.localName === "ai-plan") {
      (request as HTMLElementTagNameMap["ai-plan"]).decision = { decision: "revise", mode: null, feedback: detail.text };
      return send(detail, { party: "revised", reason: detail.text });
    }
    // With a question open, what's typed answers it, as if chosen or typed into Other.
    if (request) {
      const asking = request as HTMLElementTagNameMap["ai-question"];
      asking.answer = typedAnswer(asking, detail.text);
      const step = Number(asking.dataset.step);
      return send(detail, step ? { trip: step + 1 } : undefined);
    }
    send(
      detail,
      planning(detail.text)
        ? { trip: 1 }
        : cleaning(detail.text)
          ? { cleanup: "ask" }
          : throwingParty(detail.text)
            ? { party: "ask" }
            : gifting(detail.text)
              ? { gift: "ask" }
              : limiting(detail.text)
                ? { limit: "ask" }
                : undefined,
    );
  });

  document.addEventListener("visibilitychange", showTitle, { signal: page.signal });

  /** Shows what was sent as your message, and starts the reply. */
  function send(detail: PromptSubmitDetail, script?: StoredScript) {

    const line = [
      `${labelOf(defaultModes, detail.mode)} · ${labelOf(defaultModels, detail.model)} · Thinking: ${labelOf(defaultThinkingLevels, detail.thinking)}`,
      detail.command && `Command: /${detail.command}`,
      detail.references.length > 0 && `References: ${detail.references.map((reference) => `@${reference.label}`).join(", ")}`,
      detail.files.length > 0 && `Attached: ${detail.files.map((file) => file.name).join(", ")}`,
    ]
      .filter(Boolean)
      .join(" · ");
    const prompt: StoredPrompt = {
      mode: detail.mode,
      model: detail.model,
      thinking: detail.thinking,
      command: detail.command,
      references: detail.references,
      files: detail.files.map((file) => file.name),
    };
    const sent = userMessage(detail.text, line, prompt, detail.files);
    sent.time = new Date();
    if (detail.quotes?.length) sent.quotes = detail.quotes;
    transcript.append(sent);
    save();
    startReply(detail, undefined, script);
  }

  /** An answer to the trip planner's question goes in as your next message, with the composer's settings. */
  const answerWith = (text: string, step: number) =>
    send({ text, mode: composer.mode, model: composer.model, thinking: composer.thinking, references: [], files: [] }, { trip: step + 1 });

  // Quote: the words go into the box as a card, with the message they came from, so the quote can take you back.
  transcript.addEventListener("messagequote", (event) => {
    event.preventDefault();
    const index = messages().indexOf(event.detail.message as AiMessageElement);
    const { text, from, source } = event.detail;
    composer.addQuote({ text, from, ...(source ? { source } : {}), id: String(index) });
  });
  transcript.addEventListener("quoteopen", (event) => {
    const quoted = messages()[Number(event.detail.quote.id)];
    if (!quoted) return;
    quoted.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    quoted.tabIndex = -1;
    quoted.focus({ preventScroll: true });
    quoted.setAttribute("data-highlighted", "");
    setTimeout(() => quoted.removeAttribute("data-highlighted"), 2000);
  });

  // An answer continues the same turn. It doesn't bubble, so the transcript hears it on the way
  // down, before a set of questions around it does: those are the set's to send.
  transcript.addEventListener(
    "answerchange",
    (changed) => {
      if (!(changed.target instanceof HTMLElement) || changed.target.localName !== "ai-question" || changed.target.closest("ai-questions")) return;
      const event = changed as QuestionElementEventMap["answerchange"];
      const answer = event.detail.value;
      if (!answer) return;
      if (composer.busy) return event.preventDefault();
      const step = Number((event.target as HTMLElement).dataset.step);
      // The event comes before the question shows as answered; send once it has.
      queueMicrotask(() => (step ? answerWith("skipped" in answer ? "Surprise me" : answer.labels.join(", "), step) : save()));
    },
    { capture: true },
  );

  // A decision continues the same turn: the agent runs the command, or says it won't.
  // ui-sdk change events don't bubble, so the transcript hears them on the way down.
  transcript.addEventListener(
    "decisionchange",
    (changed) => {
    if (!(changed.target instanceof HTMLElement) || changed.target.localName !== "ai-approval") return;
    const event = changed as ApprovalElementEventMap["decisionchange"];
    if (composer.busy) return event.preventDefault();
    const message = (event.target as HTMLElement).closest("ai-message") as AiMessageElement | null;
    const detail = message ? asked.get(message) : undefined;
    if (!event.detail.value) return;
    const { decision, reason } = event.detail.value;
    if (decision === "always") current.allowed = [...new Set([...(current.allowed ?? []), (event.target as HTMLElementTagNameMap["ai-approval"]).name])];
    queueMicrotask(() => {
      if (!detail) return save();
      startReply(detail, undefined, decision === "deny" ? { cleanup: "denied", reason: reason ?? undefined } : { cleanup: "allowed" });
    });
    },
    { capture: true },
  );

  /** The answers sent with the newest set of questions. */
  function giftAnswers() {
    return [...transcript.querySelectorAll("ai-questions")].at(-1)?.answers ?? undefined;
  }

  // The answers to a set of questions continue the same turn.
  transcript.addEventListener("questionsanswer", (event) => {
    if (composer.busy) return event.preventDefault();
    const message = (event.target as HTMLElement).closest("ai-message") as AiMessageElement | null;
    const detail = message ? asked.get(message) : undefined;
    queueMicrotask(() => (detail ? startReply(detail, undefined, { gift: "answered" }) : save()));
  });

  // A plan's decision continues the same turn. Accepting with a mode switches the composer to it.
  // Like the approval's, it doesn't bubble, so the transcript hears it on the way down.
  transcript.addEventListener(
    "decisionchange",
    (changed) => {
    if (!(changed.target instanceof HTMLElement) || changed.target.localName !== "ai-plan") return;
    const event = changed as PlanElementEventMap["decisionchange"];
    if (composer.busy) return event.preventDefault();
    const message = (event.target as HTMLElement).closest("ai-message") as AiMessageElement | null;
    const detail = message ? asked.get(message) : undefined;
    if (!event.detail.value) return;
    const { decision, mode, feedback } = event.detail.value;
    if (mode) composer.mode = mode;
    queueMicrotask(() => {
      if (!detail) return save();
      const script: StoredScript =
        decision === "accept"
          ? { party: "accepted", mode: mode ?? undefined }
          : decision === "reject"
            ? { party: "rejected" }
            : { party: "revised", reason: feedback ?? undefined };
      startReply(detail, undefined, script);
    });
    },
    { capture: true },
  );

  // The usage limit's buttons. Each way round it unlocks the box and carries on.
  // ui-sdk events don't bubble, so the transcript hears them on the way down.
  transcript.addEventListener(
    "noticeaction",
    (pressed) => {
    const event = pressed as NoticeElementEventMap["noticeaction"];
    const notice = event.target as HTMLElementTagNameMap["ai-notice"];
    const message = notice.closest("ai-message") as AiMessageElement | null;
    const { value } = event.detail;
    if (value === "upgrade") {
      // A real app would open its pricing page.
      event.preventDefault();
      if (!message?.querySelector(".upgrade-note")) message?.append(Object.assign(meta("A real app would open its pricing page here."), { className: "message-meta upgrade-note" }));
      return;
    }
    if (value === "notify") {
      notice.actions = notice.actions.map((action) => (action.value === "notify" ? { ...action, label: "We'll remind you", disabled: true } : action));
      return save();
    }
    if (composer.busy) return event.preventDefault();
    notice.toggleAttribute("data-unlocked", true);
    if (value === "smaller-model") composer.model = "haiku-5.5";
    syncLock();
    const detail = message ? asked.get(message) : undefined;
    queueMicrotask(() => (detail ? startReply(detail, undefined, { limit: value === "extra" ? "extra" : "smaller-model" }) : save()));
    },
    { capture: true },
  );

  transcript.addEventListener(
    "noticeexpire",
    () => {
      syncLock();
      save();
    },
    { capture: true },
  );

  transcript.addEventListener("messageaction", (event) => {
    const message = event.target as AiMessageElement;
    if (event.detail.action === "retry" && !composer.busy) {
      const detail = asked.get(message);
      if (detail) startReply(detail, message, scripts.get(message));
    } else if (event.detail.action === "edit") {
      composer.value = event.detail.text;
      composer.focus();
    }
  });

  transcript.addEventListener("messageversion", (event) => {
    const message = event.target as AiMessageElement;
    const text = versionTexts.get(message)?.[event.detail.version - 1];
    if (text === undefined || composer.busy) return event.preventDefault();
    message.text = text;
    // Only the newest version can have failed, thought or used tools.
    const newest = event.detail.version === event.detail.versions;
    message.error = newest ? (latestError.get(message) ?? null) : null;
    showWork(message, newest);
    queueMicrotask(save);
  });

  // The event comes before the rating changes, so it can be cancelled; save once it has.
  transcript.addEventListener("messagefeedback", () => queueMicrotask(save));


  // ---- The chat list, the header and export ---------------------------------------------------

  const closeDrawer = () => {
    if (drawer.api.isOpen()) drawer.api.close();
  };

  const exportChat = (chat: StoredChat | undefined) => {
    if (chat && chat.messages.length) download(markdownFileName(chat.title), chatToMarkdown(chat));
  };

  list.addEventListener("chatselect", closeDrawer);
  list.addEventListener("chatnew", () => {
    closeDrawer();
    void newChat();
  });
  list.addEventListener("chatrename", (event) => {
    store.rename(event.detail.id, event.detail.title);
    if (event.detail.id === current.id) current.title = event.detail.title;
    refreshList();
    showTitle();
  });
  list.addEventListener("chatexport", (event) => exportChat(event.detail.id === current.id ? current : store.get(event.detail.id)));
  list.addEventListener("chatdelete", (event) => {
    const { id } = event.detail;
    store.remove(id);
    if (id === current.id) {
      void settleReply().then(() => {
        history.pushState(null, "", location.pathname + location.search);
        show(blankChat());
      });
    } else {
      refreshList();
    }
  });
  root.querySelector(".header-new-chat")!.addEventListener("action", () => void newChat());
  exportButton.addEventListener("action", () => exportChat(current));

  refreshList();
  route();
  showTitle();

  return () => page.abort();
}
