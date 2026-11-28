import "../ai-approval/ai-approval.ts";
import "../ai-composer/ai-composer.ts";
import "../ai-message/ai-message.ts";
import "../ai-notice/ai-notice.ts";
import "../ai-plan/ai-plan.ts";
import "../ai-question/ai-question.ts";
import "../ai-questions/ai-questions.ts";
import "../ai-sources/ai-sources.ts";
import "../ai-suggestions/ai-suggestions.ts";
import "../ai-thinking/ai-thinking.ts";
import "../ai-tool-call/ai-tool-call.ts";
import "../ai-transcript/ai-transcript.ts";
import type { AiApprovalElement, ApprovalDecisionDetail, ApprovalStrings } from "../ai-approval/ai-approval.ts";
import { needsPerson } from "../agent.ts";
import { type AiComposerElement, type PromptSubmitDetail, quotesToMarkdown } from "../ai-composer/ai-composer.ts";
import type { AiMessageElement, MessageAttachment, MessageFeedback, MessageStrings } from "../ai-message/ai-message.ts";
import type { AiNoticeElement, NoticeAction, NoticeStrings, NoticeTone } from "../ai-notice/ai-notice.ts";
import type { AiPlanElement, PlanAcceptOption, PlanDecisionDetail, PlanStrings } from "../ai-plan/ai-plan.ts";
import type { AiQuestionsElement, QuestionsAnswerDetail, QuestionsItem, QuestionsStrings } from "../ai-questions/ai-questions.ts";
import type { AiQuestionElement, QuestionAnswer, QuestionOption, QuestionStrings } from "../ai-question/ai-question.ts";
import type { Source, SourcesStrings } from "../ai-sources/ai-sources.ts";
import type { Suggestion } from "../ai-suggestions/ai-suggestions.ts";
import type { AiThinkingElement, ThinkingStrings } from "../ai-thinking/ai-thinking.ts";
import type { AiToolCallElement, ToolCallStrings } from "../ai-tool-call/ai-tool-call.ts";
import type { AiTranscriptElement } from "../ai-transcript/ai-transcript.ts";
import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-chat.css?inline";

/** A question the model asks. `yield` it, and the person's answer comes back as the value of the `yield`. */
export type ChatQuestion = {
  type: "question";
  question: string;
  options: QuestionOption[];
  multiple?: boolean;
  other?: boolean;
  max?: number;
  skippable?: boolean;
};

/** A request to act. `yield` it, and the person's decision comes back as the value of the `yield`. */
export type ChatApproval = {
  type: "approval";
  name: string;
  label?: string;
  description?: string;
  input?: unknown;
  always?: boolean;
  reason?: boolean;
};

/** A plan to review before the work starts. `yield` it, and the decision comes back as the value of the `yield`. */
export type ChatPlan = {
  type: "plan";
  /** The plan's title. Defaults to "Proposed plan". */
  heading?: string;
  summary?: string;
  /** The full plan, as Markdown, shown when the person opens it. */
  plan?: string;
  /** A link to your app's own page for the plan, instead of opening it in the card. */
  href?: string;
  /** More ways to accept, each switching the composer's Mode: `{ value: "auto", label: "auto mode" }`. */
  accepts?: PlanAcceptOption[];
};

/** Several questions at once, shown one at a time. `yield` it, and every answer comes back together. */
export type ChatQuestions = {
  type: "questions";
  /** The set's accessible name. Defaults to "Questions". */
  label?: string;
  questions: QuestionsItem[];
};

/**
 * Something that stops the conversation and needs action, like a usage limit. `yield` it, then
 * return: the reply shows the card, and with `lock` the message box locks until it resets.
 */
export type ChatNotice = {
  type: "notice";
  heading: string;
  text?: string;
  /** `warning` (the default), `error` or `info`. */
  tone?: NoticeTone;
  /** When it stops applying, as an ISO time like `"2026-11-28T15:00:00Z"`. The box unlocks then. */
  resetsAt?: string;
  actions?: NoticeAction[];
  dismissible?: boolean;
  /** Locks the message box until it resets, it's dismissed, or you call `unlock()`. Defaults to true, except for `info`. */
  lock?: boolean;
};

/** One piece of a reply, as the model yields it. A string is text to add. */
export type ChatChunk =
  | string
  | { type: "text"; text: string }
  | { type: "thinking"; text?: string; done?: boolean }
  | { type: "tool"; id: string; name: string; label?: string; input?: unknown }
  | { type: "tool-result"; id: string; summary?: string; output?: unknown; error?: string }
  | { type: "sources"; sources: Source[] }
  | { type: "suggestions"; suggestions: Suggestion[] }
  | { type: "model"; name: string }
  | ChatQuestion
  | ChatApproval
  | ChatPlan
  | ChatQuestions
  | ChatNotice;

/** What comes back from a question, an approval or a plan, as the value of its `yield`. */
export type ChatAnswer = QuestionAnswer | ApprovalDecisionDetail | PlanDecisionDetail | QuestionsAnswerDetail;

/** A tool the reply ran. */
export type ChatToolCall = { id: string; name: string; label?: string; summary?: string; input?: unknown; output?: unknown; error?: string };

/** One message of the conversation, as `messages` holds it: plain data, to save and set again. */
export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  /** When it was sent, or when the reply started, as an ISO time. */
  createdAt?: string;
  /** The model that wrote a reply, as its label: the composer's chosen model, or a `model` chunk. */
  model?: string;
  /** Words a message of yours quoted from earlier in the chat. `id` is the quoted message's index in `messages`. */
  quotes?: { text: string; from?: "user" | "assistant"; id?: string; source?: string }[];
  attachments?: MessageAttachment[];
  /** Why the reply failed. */
  error?: string;
  /** Stop was pressed while it came in. */
  stopped?: boolean;
  feedback?: MessageFeedback;
  thinking?: { text: string; seconds?: number };
  tools?: ChatToolCall[];
  sources?: Source[];
  question?: ChatQuestion & { answer?: QuestionAnswer };
  approval?: ChatApproval & { decision?: ApprovalDecisionDetail };
  plan?: ChatPlan & { decision?: PlanDecisionDetail };
  questions?: ChatQuestions & { answers?: QuestionAnswer[] };
  /** `unlocked` is true once its lock was lifted, so a saved chat doesn't lock again. */
  notice?: ChatNotice & { unlocked?: boolean };
};

/** What `model` gets. `messages` ends with the newest message; `signal` aborts when Stop is pressed. */
export type ChatRequest = { messages: ChatMessage[]; prompt: PromptSubmitDetail; signal: AbortSignal };

/**
 * Your model: given the conversation, it streams the reply. Return an async generator (or any
 * async iterable) of chunks, or a promise of the whole text.
 */
export type ChatModel = (
  request: ChatRequest,
) => AsyncIterable<ChatChunk> | AsyncGenerator<ChatChunk, unknown, ChatAnswer | undefined> | Promise<string> | string;

/** Every word `<ai-chat>` shows or announces. Override any of them through `strings`. */
export type ChatStrings = {
  stopped: string;
  error: string;
  noModel: string;
  starters: string;
  followUps: string;
  /** The composer's placeholder while a question waits for an answer. */
  answerPlaceholder: string;
  /** The composer's placeholder while an approval waits for a decision. */
  approvalPlaceholder: string;
  /** The composer's placeholder while a plan waits for a decision. */
  planPlaceholder: string;
  /** While an approval waits, what an agent pressing Send would do, asked of the person first. Empty lets it. */
  approvalSendConfirm: (name: string) => string;
  /** While a plan waits, what an agent pressing Send would do, asked of the person first. Empty lets it. */
  planSendConfirm: string;
  /** Under the message box while a notice locks it, with the reset time when there is one. */
  locked: (resetsAt: Date | null) => string;
  /**
   * Words for the parts the chat makes, passed on to each one as its `strings`: the messages
   * (Copy, Retry…), thinking, tool calls, sources, questions and approvals. Leave one out and
   * that part keeps its own defaults. The composer and transcript have theirs through
   * `chat.composer.strings` and `chat.transcript.strings`.
   */
  message?: Partial<MessageStrings>;
  thinking?: Partial<ThinkingStrings>;
  toolCall?: Partial<ToolCallStrings>;
  sources?: Partial<SourcesStrings>;
  question?: Partial<QuestionStrings>;
  approval?: Partial<ApprovalStrings>;
  plan?: Partial<PlanStrings>;
  questions?: Partial<QuestionsStrings>;
  notice?: Partial<NoticeStrings>;
};

export const defaultChatStrings: ChatStrings = {
  stopped: "Stopped",
  error: "Something went wrong. Press Retry to try again.",
  noModel: "No model is connected. Set the chat's model property.",
  starters: "Suggestions",
  followUps: "Follow-up questions",
  answerPlaceholder: "Answer the question above, or type your answer",
  approvalPlaceholder: "Allow or deny above, or tell it what to do instead",
  planPlaceholder: "Accept or reject the plan above, or say what to change",
  approvalSendConfirm: (name) => `Denies ${name || "this action"}, and tells it what's typed instead`,
  planSendConfirm: "Asks for changes to the plan, as typed",
  locked: (resetsAt) =>
    resetsAt
      ? `Sending is paused until ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(resetsAt)}.`
      : "Sending is paused. See the notice above.",
};

/** The events this element fires, by name. */
export type ChatEvents = {
  chatchange: CustomEvent<{ messages: ChatMessage[] }>;
  chaterror: CustomEvent<{ error: unknown }>;
};

type Turn = { data: ChatMessage; element: AiMessageElement };

/** A card the model waits on. */
type Card = AiQuestionElement | AiApprovalElement | AiPlanElement | AiQuestionsElement;

/** The parts the chat makes, and which key of `strings` holds each one's words. */
const partWords = {
  "ai-message": "message",
  "ai-thinking": "thinking",
  "ai-tool-call": "toolCall",
  "ai-sources": "sources",
  "ai-question": "question",
  "ai-approval": "approval",
  "ai-plan": "plan",
  "ai-questions": "questions",
  "ai-notice": "notice",
} as const;
type Part = keyof typeof partWords;

let count = 0;

const copy = (message: ChatMessage): ChatMessage => ({
  ...message,
  attachments: message.attachments ? [...message.attachments] : undefined,
  tools: message.tools?.map((tool) => ({ ...tool })),
  sources: message.sources ? [...message.sources] : undefined,
  question: message.question ? { ...message.question } : undefined,
  approval: message.approval ? { ...message.approval } : undefined,
  plan: message.plan ? { ...message.plan } : undefined,
  questions: message.questions ? { ...message.questions } : undefined,
  notice: message.notice ? { ...message.notice, actions: message.notice.actions?.map((action) => ({ ...action })) } : undefined,
});

/** An answer typed in the composer: the choice it names, or else an answer of one's own. */
function typedAnswer(question: ChatQuestion, text: string): QuestionAnswer {
  const typed = text.trim();
  const choices = question.options.map((option) =>
    typeof option === "string" ? { value: option, label: option } : { value: option.value, label: option.label ?? option.value },
  );
  const match = choices.find((choice) => choice.label.toLowerCase() === typed.toLowerCase());
  const answer = match ? { value: match.value, labels: [match.label], other: null } : { value: typed, labels: [typed], other: typed };
  return question.multiple ? { ...answer, value: [answer.value] } : answer;
}

/**
 * `<ai-chat>`: a whole chat in one tag. Give it a `model` that streams a reply, and it runs the
 * conversation: your messages, streaming replies, Stop, Retry, errors, thinking, tool calls,
 * sources, follow-ups, and questions and approvals that wait for the person. See README.md
 * beside this file.
 *
 * @customElement ai-chat
 * @fires chatchange - The conversation changed and is worth saving.
 * @fires chaterror - The model threw.
 */
export class AiChatElement extends BaseElement {
  static observedAttributes = ["actions"];

  #model: ChatModel | null = null;
  #strings: ChatStrings = defaultChatStrings;
  #suggestions: Suggestion[] = [];
  #allowed = new Set<string>();
  #turns: Turn[] = [];
  #controller: AbortController | null = null;
  /** Settles the question or approval the model is waiting on, from a press or typing. */
  #answer: ((value: ChatAnswer) => void) | null = null;
  #waitingOn: Card | null = null;
  #placeholder: string | null = null;
  /** The notice locking the message box, and what the box was like before. */
  #lock: { notice: AiNoticeElement; disabled: boolean; hint: string | null } | null = null;
  #rendered = false;
  #id = `ai-chat-${++count}`;

  /** Your model. See `ChatModel`. */
  get model(): ChatModel | null {
    return this.#model;
  }
  set model(value: ChatModel | null) {
    this.#model = value ?? null;
  }

  /** The conversation, as plain data. Set it to show a saved one; it stops any reply that's coming in. */
  get messages(): ChatMessage[] {
    return this.#turns.map(({ data }) => copy(data));
  }
  set messages(value: ChatMessage[]) {
    this.#cancel();
    // A notice from the conversation being replaced no longer locks the box.
    if (this.#lock) this.#release();
    for (const { element } of this.#turns) element.remove();
    this.#turns = [];
    if (this.#rendered) for (const message of value ?? []) this.#turns.push(this.#show(copy(message)));
    else this.#pending = [...(value ?? [])];
    this.#syncRetry();
    this.#syncWaiting();
  }
  #pending: ChatMessage[] = [];

  /** Starters, shown while the chat is empty. */
  get suggestions(): Suggestion[] {
    return this.#suggestions;
  }
  set suggestions(value: Suggestion[]) {
    this.#suggestions = [...(value ?? [])];
    const starters = this.querySelector<HTMLElementTagNameMap["ai-suggestions"]>(":scope ai-suggestions[data-part='starters']");
    if (starters) starters.suggestions = this.#suggestions;
  }

  /** Tools chosen with Always allow, which aren't asked about again. */
  get alwaysAllowed(): string[] {
    return [...this.#allowed];
  }
  set alwaysAllowed(value: string[]) {
    this.#allowed = new Set(value ?? []);
  }

  /** The actions each reply offers, as for `<ai-message>`. Defaults to `copy retry`. */
  get actions(): string {
    return this.getAttribute("actions") ?? "copy retry";
  }
  set actions(value: string | string[]) {
    this.setAttribute("actions", Array.isArray(value) ? value.join(" ") : String(value));
  }

  get strings(): ChatStrings {
    return this.#strings;
  }
  set strings(value: Partial<ChatStrings>) {
    const previous = this.#strings;
    this.#strings = { ...defaultChatStrings, ...value };
    const starters = this.querySelector(":scope ai-suggestions[data-part='starters']");
    starters?.setAttribute("label", this.#strings.starters);
    // Parts already shown take their new words, but only where those changed.
    for (const [tag, key] of Object.entries(partWords) as [Part, (typeof partWords)[Part]][]) {
      if (previous[key] === this.#strings[key]) continue;
      for (const { element } of this.#turns) {
        for (const part of element.localName === tag ? [element] : element.querySelectorAll(tag)) {
          // The questions in a set take their button words from the set.
          if (!part.parentElement?.closest("ai-questions")) this.#giveWords(part);
        }
      }
    }
  }

  /** True while a reply comes in. */
  get busy(): boolean {
    return this.#controller !== null && this.#answer === null;
  }

  /** True while a question or an approval waits on the person. */
  get waiting(): boolean {
    return this.#answer !== null;
  }

  /** True while a notice locks the message box. */
  get locked(): boolean {
    return this.#lock !== null;
  }

  /** Unlocks the message box a notice locked, like once people choose a way round a limit. Returns false when it wasn't locked. */
  unlock(): boolean {
    const lock = this.#release();
    if (!lock) return false;
    const turn = this.#turns.find(({ element }) => element.contains(lock.notice));
    if (turn?.data.notice) turn.data.notice = { ...turn.data.notice, unlocked: true };
    this.#changed();
    return true;
  }

  /** The composer inside, to set up modes, models, attachments and the like. */
  get composer(): AiComposerElement {
    return this.querySelector<AiComposerElement>(":scope > ai-composer")!;
  }

  /** The transcript inside. */
  get transcript(): AiTranscriptElement {
    return this.querySelector<AiTranscriptElement>(":scope > ai-transcript")!;
  }

  connectedCallback() {
    if (this.#rendered) return;
    this.#rendered = true;
    // Use a transcript and a composer written inside, so they can be set up in markup.
    let transcript = this.querySelector<AiTranscriptElement>(":scope > ai-transcript");
    let composer = this.querySelector<AiComposerElement>(":scope > ai-composer");
    if (!transcript) transcript = document.createElement("ai-transcript");
    if (!composer) composer = document.createElement("ai-composer");
    if (!composer.id) composer.id = `${this.#id}-composer`;
    for (const empty of this.querySelectorAll<HTMLElement>(":scope > [slot='empty']")) transcript.append(empty);

    const starters = document.createElement("ai-suggestions");
    starters.dataset.part = "starters";
    starters.slot = "empty";
    starters.for = composer.id;
    starters.setAttribute("label", this.#strings.starters);
    starters.suggestions = this.#suggestions;
    transcript.append(starters);
    this.append(transcript, composer);

    composer.addEventListener("promptsubmit", (event) => this.#submit(event.detail));
    composer.addEventListener("promptstop", () => this.stop());
    transcript.addEventListener("messageaction", (event) => {
      const message = event.target as AiMessageElement;
      if (event.detail.action === "retry") this.#retryFrom(message);
      else if (event.detail.action === "edit") {
        this.composer.value = event.detail.text;
        // Its quotes come back too.
        const turn = this.#turns.find(({ element }) => element === message);
        if (turn?.data.quotes?.length) this.composer.quotes = turn.data.quotes;
        this.composer.focus();
      }
    });
    // Selected words in a message can be quoted into the box, and a quote takes you back to them.
    transcript.quotable = true;
    transcript.addEventListener("messagequote", (event) => {
      event.preventDefault();
      const index = this.#turns.findIndex(({ element }) => element === event.detail.message);
      const { text, from, source } = event.detail;
      this.composer.addQuote({ text, from, ...(source ? { source } : {}), ...(index >= 0 ? { id: String(index) } : {}) });
    });
    transcript.addEventListener("quoteopen", (event) => {
      const turn = this.#turns[Number(event.detail.quote.id)];
      if (!turn || !turn.element.isConnected) return;
      this.#highlight(turn.element);
    });
    transcript.addEventListener("messagefeedback", (event) => {
      const turn = this.#turns.find(({ element }) => element === event.target);
      if (!turn) return;
      turn.data.feedback = event.detail.feedback ?? undefined;
      queueMicrotask(() => this.#changed());
    });

    const saved = this.#pending;
    this.#pending = [];
    if (saved.length) this.messages = saved;
  }

  /** Scrolls to a message and marks it for a moment, moving focus there so screen readers read it. */
  #highlight(message: AiMessageElement) {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    message.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    if (!message.hasAttribute("tabindex")) message.tabIndex = -1;
    message.focus({ preventScroll: true });
    message.setAttribute("data-highlighted", "");
    clearTimeout(this.#highlightTimer);
    this.#highlightTimer = setTimeout(() => message.removeAttribute("data-highlighted"), 2000);
  }
  #highlightTimer?: ReturnType<typeof setTimeout>;

  /** Sends a prompt, as typing it and pressing Send does. */
  send(text: string) {
    const composer = this.composer;
    composer.value = text;
    return composer.submit();
  }

  /** Stops the reply that's coming in. */
  stop() {
    this.#controller?.abort();
  }

  /** Empties the conversation. */
  clear() {
    this.messages = [];
    this.#changed();
  }

  /** Asks again for the newest reply. Returns false when there's nothing to retry. */
  retry(): boolean {
    const last = [...this.#turns].reverse().find(({ data }) => data.role === "assistant");
    if (!last || this.busy) return false;
    return this.#retryFrom(last.element);
  }

  // ---- Running a turn ------------------------------------------------------------------------

  #submit(prompt: PromptSubmitDetail) {
    // With a question or an approval open, what's typed answers it.
    if (this.#waitingOn && this.#answer) {
      const card = this.#waitingOn;
      // An answer has no room for quote cards, so they go into its text, as > lines, where they were.
      if (prompt.quotes?.length) prompt = { ...prompt, text: quotesToMarkdown(prompt.text, prompt.quotes), quotes: [] };
      if (card instanceof HTMLElement && card.localName === "ai-question") {
        const question = card as AiQuestionElement;
        const answer = typedAnswer(this.#questionOf(question), prompt.text);
        question.answer = answer;
        this.#settle(answer);
      } else if (card.localName === "ai-questions") {
        // What's typed answers the question showing; the set moves on, or sends them all.
        const set = card as AiQuestionsElement;
        const question = set.querySelectorAll<AiQuestionElement>("ai-question")[set.index];
        const answer = question ? typedAnswer(this.#questionOf(question), prompt.text) : null;
        if (question && answer && !("skipped" in answer)) {
          question.value = answer.value;
          question.submit();
        }
      } else if (card.localName === "ai-plan") {
        const decision: PlanDecisionDetail = { decision: "revise", mode: null, feedback: prompt.text };
        (card as AiPlanElement).decision = decision;
        this.#settle(decision);
      } else {
        const decision: ApprovalDecisionDetail = { decision: "deny", reason: prompt.text };
        (card as AiApprovalElement).decision = decision;
        this.#settle(decision);
      }
      return;
    }
    const message: ChatMessage = { role: "user", text: prompt.text, createdAt: new Date().toISOString() };
    if (prompt.quotes?.length) message.quotes = prompt.quotes.map((quote) => ({ ...quote }));
    if (prompt.files.length) message.attachments = [...prompt.files];
    this.#turns.push(this.#show(message));
    void this.#run(prompt);
  }

  #retryFrom(reply: AiMessageElement): boolean {
    if (this.#controller) return false;
    const index = this.#turns.findIndex(({ element }) => element === reply);
    // The user message this reply answers, and everything after it, is asked again.
    let start = index;
    while (start >= 0 && this.#turns[start].data.role !== "user") start--;
    if (start < 0) return false;
    for (const { element } of this.#turns.splice(start + 1)) element.remove();
    const user = this.#turns[start].data;
    void this.#run({ text: user.text, files: (user.attachments ?? []).filter((file): file is File => file instanceof File), references: [] });
    return true;
  }

  /** Runs the model for one turn, from the newest message. */
  async #run(prompt: PromptSubmitDetail) {
    const controller = new AbortController();
    this.#controller = controller;
    const composer = this.composer;
    composer.busy = true;
    // The model chosen when it was sent, by its label, for the reply's line.
    let chosenModel = composer.models.find((option) => option.value === composer.model)?.label;
    this.#syncRetry();

    let turn: Turn | null = null;
    let thinking: AiThinkingElement | null = null;
    let thinkingStarted = 0;
    const tools = new Map<string, { call: AiToolCallElement; data: ChatToolCall }>();
    const reply = () => {
      if (turn) return turn;
      const data: ChatMessage = { role: "assistant", text: "", createdAt: new Date().toISOString() };
      if (chosenModel) data.model = chosenModel;
      const element = this.#messageElement(data);
      element.streaming = true;
      this.transcript.append(element);
      turn = { data, element };
      this.#turns.push(turn);
      return turn;
    };
    const endThinking = () => {
      if (!thinking || thinking.status === "done") return;
      thinking.done();
      turn!.data.thinking = { text: thinking.reasoning, seconds: Math.round((Date.now() - thinkingStarted) / 1000) };
    };
    const finish = () => {
      if (!turn) return;
      endThinking();
      turn.data.text = turn.element.text;
      turn.element.done();
    };

    try {
      const model = this.#model;
      if (!model) throw new Error(this.#strings.noModel);
      const request: ChatRequest = { messages: this.messages, prompt, signal: controller.signal };
      const result = model(request);
      if (typeof result === "string" || result instanceof Promise) {
        const text = await result;
        if (controller.signal.aborted) throw controller.signal.reason;
        reply().element.appendText(String(text ?? ""));
      } else {
        const iterator = result[Symbol.asyncIterator]() as AsyncIterator<ChatChunk, unknown, ChatAnswer | undefined>;
        controller.signal.addEventListener("abort", () => void iterator.return?.(undefined)?.catch(() => {}), { once: true });
        let answer: ChatAnswer | undefined;
        while (true) {
          const step = await iterator.next(answer);
          answer = undefined;
          if (controller.signal.aborted) throw controller.signal.reason;
          if (step.done) break;
          const chunk = typeof step.value === "string" ? { type: "text" as const, text: step.value } : step.value;
          switch (chunk.type) {
            case "model": {
              // Before the reply shows, only remember it, so the reply doesn't appear early.
              chosenModel = chunk.name || undefined;
              const current = turn as Turn | null;
              if (!current) break;
              if (chosenModel) current.data.model = chosenModel;
              else delete current.data.model;
              current.element.model = chosenModel ?? null;
              break;
            }
            case "text": {
              endThinking();
              reply().element.appendText(chunk.text);
              break;
            }
            case "thinking": {
              const { element } = reply();
              if (!thinking) {
                thinking = this.#part("ai-thinking");
                thinking.slot = "header";
                thinking.timer = true;
                thinkingStarted = Date.now();
                element.prepend(thinking);
              }
              if (chunk.text) thinking.reasoning = thinking.reasoning + chunk.text;
              if (chunk.done) endThinking();
              break;
            }
            case "tool": {
              endThinking();
              const { element, data } = reply();
              const call = this.#part("ai-tool-call");
              call.slot = "header";
              call.name = chunk.name;
              if (chunk.label) call.label = chunk.label;
              call.input = chunk.input;
              element.append(call);
              const tool: ChatToolCall = { id: chunk.id, name: chunk.name, label: chunk.label, input: chunk.input };
              (data.tools ??= []).push(tool);
              tools.set(chunk.id, { call, data: tool });
              break;
            }
            case "tool-result": {
              const found = tools.get(chunk.id);
              if (!found) break;
              if (chunk.summary) found.call.summary = found.data.summary = chunk.summary;
              if (chunk.error !== undefined) {
                found.call.fail(chunk.error);
                found.data.error = chunk.error;
              } else {
                found.call.done(chunk.output);
                found.data.output = chunk.output;
              }
              break;
            }
            case "sources": {
              const { element, data } = reply();
              data.sources = [...chunk.sources];
              element.querySelector(":scope > ai-sources")?.remove();
              element.append(this.#sourcesElement(data.sources));
              break;
            }
            case "suggestions": {
              const { element } = reply();
              this.#followUps(element, chunk.suggestions);
              break;
            }
            case "question":
            case "approval": {
              // The card goes with the reply so far; anything after it starts a new message.
              const current = reply();
              const asked = chunk.type === "question" ? { ...chunk } : { ...chunk };
              if (chunk.type === "question") current.data.question = asked as ChatQuestion;
              else current.data.approval = asked as ChatApproval;
              const card = chunk.type === "question" ? this.#questionElement(chunk) : this.#approvalElement(chunk);
              current.element.append(card);
              finish();
              turn = null;
              thinking = null;
              this.#changed();
              answer = await this.#wait(card, controller.signal);
              if (chunk.type === "question") current.data.question = { ...(asked as ChatQuestion), answer: answer as QuestionAnswer };
              else current.data.approval = { ...(asked as ChatApproval), decision: answer as ApprovalDecisionDetail };
              break;
            }
            case "questions": {
              const current = reply();
              const asked: ChatQuestions = { ...chunk, questions: [...chunk.questions] };
              current.data.questions = asked;
              const card = this.#questionsElement(chunk);
              current.element.append(card);
              finish();
              turn = null;
              thinking = null;
              this.#changed();
              answer = await this.#wait(card, controller.signal);
              current.data.questions = { ...asked, answers: (answer as QuestionsAnswerDetail).answers };
              break;
            }
            case "notice": {
              const current = reply();
              current.data.notice = { ...chunk, actions: chunk.actions?.map((action) => ({ ...action })) };
              const card = this.#noticeElement(current.data.notice);
              current.element.append(card);
              if (this.#locks(current.data.notice)) this.#lockFor(card);
              break;
            }
            case "plan": {
              // Like a question: the card ends the reply so far, and the model waits for the decision.
              const current = reply();
              const asked: ChatPlan = { ...chunk };
              current.data.plan = asked;
              const card = this.#planElement(chunk);
              current.element.append(card);
              finish();
              turn = null;
              thinking = null;
              this.#changed();
              answer = await this.#wait(card, controller.signal);
              current.data.plan = { ...asked, decision: answer as PlanDecisionDetail };
              break;
            }
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        const current = turn ?? (this.#turns.at(-1)?.data.role === "user" ? reply() : null);
        if (current) {
          current.data.stopped = true;
          current.element.append(this.#stoppedNote());
          for (const { call, data } of tools.values()) if (call.status === "running") {
            call.fail(this.#strings.stopped);
            data.error = this.#strings.stopped;
          }
        }
      } else {
        const message = error instanceof Error && error.message ? error.message : this.#strings.error;
        const current = reply();
        current.element.fail(message);
        current.data.error = message;
        this.dispatchEvent(new CustomEvent("chaterror", { detail: { error }, bubbles: true, composed: true }));
      }
    } finally {
      finish();
      if (this.#controller === controller) this.#controller = null;
      this.#answer = null;
      this.#waitingOn = null;
      composer.busy = false;
      this.#syncWaiting();
      this.#syncRetry();
      this.#changed();
    }
  }

  /** Waits for the person to answer a question or decide an approval. Always allowed tools don't wait. */
  #wait(card: Card, signal: AbortSignal): Promise<ChatAnswer> {
    if (card.localName === "ai-approval" && this.#allowed.has((card as AiApprovalElement).name)) {
      const decision: ApprovalDecisionDetail = { decision: "always", reason: null };
      (card as AiApprovalElement).decision = decision;
      return Promise.resolve(decision);
    }
    return new Promise<ChatAnswer>((resolve, reject) => {
      this.#waitingOn = card;
      this.#answer = resolve;
      this.composer.busy = false;
      this.#syncWaiting();
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }).finally(() => {
      this.#answer = null;
      this.#waitingOn = null;
      this.composer.busy = this.#controller !== null && !this.#controller.signal.aborted;
      this.#syncWaiting();
    });
  }

  #settle(answer: ChatAnswer) {
    this.#answer?.(answer);
  }

  #cancel() {
    this.#controller?.abort();
    this.#controller = null;
  }

  // ---- Showing messages ----------------------------------------------------------------------

  /** Makes one of the chat's parts, with the words `strings` has for it. */
  #part<T extends Part>(tag: T): HTMLElementTagNameMap[T] {
    const element = document.createElement(tag);
    if (this.#strings[partWords[tag]]) this.#giveWords(element);
    return element;
  }

  /** Sets a part's `strings` from the chat's, or back to its own defaults when there are none. */
  #giveWords(element: Element) {
    const words = this.#strings[partWords[element.localName as Part]];
    (element as Element & { strings: object }).strings = words ?? {};
  }

  #messageElement(data: ChatMessage) {
    const element = this.#part("ai-message");
    element.from = data.role;
    if (data.role === "assistant") element.setAttribute("actions", this.actions);
    if (data.createdAt) element.time = data.createdAt;
    if (data.model) element.model = data.model;
    return element;
  }

  /** Shows a message from data, finished: a saved one, or one just sent. */
  #show(data: ChatMessage): Turn {
    const element = this.#messageElement(data);
    element.text = data.text;
    if (data.quotes?.length) element.quotes = data.quotes;
    if (data.attachments?.length) element.attachments = data.attachments;
    if (data.feedback) element.feedback = data.feedback;
    if (data.thinking) {
      const thinking = this.#part("ai-thinking");
      thinking.slot = "header";
      thinking.status = "done";
      thinking.timer = true;
      if (data.thinking.seconds !== undefined) thinking.duration = data.thinking.seconds;
      thinking.reasoning = data.thinking.text;
      element.append(thinking);
    }
    for (const tool of data.tools ?? []) {
      const call = this.#part("ai-tool-call");
      call.slot = "header";
      call.name = tool.name;
      if (tool.label) call.label = tool.label;
      if (tool.summary) call.summary = tool.summary;
      call.input = tool.input;
      if (tool.error !== undefined) call.fail(tool.error);
      else call.done(tool.output);
      element.append(call);
    }
    if (data.sources?.length) element.append(this.#sourcesElement(data.sources));
    if (data.question) {
      const card = this.#questionElement(data.question);
      if (data.question.answer) card.answer = data.question.answer;
      else this.#resumeOn(card);
      element.append(card);
    }
    if (data.approval) {
      const card = this.#approvalElement(data.approval);
      if (data.approval.decision) card.decision = data.approval.decision;
      else this.#resumeOn(card);
      element.append(card);
    }
    if (data.questions) {
      const card = this.#questionsElement(data.questions);
      if (data.questions.answers) card.answers = data.questions.answers;
      else this.#resumeOn(card);
      element.append(card);
    }
    if (data.plan) {
      const card = this.#planElement(data.plan);
      if (data.plan.decision) card.decision = data.plan.decision;
      else this.#resumeOn(card);
      element.append(card);
    }
    if (data.notice) {
      const card = this.#noticeElement(data.notice);
      element.append(card);
      if (this.#locks(data.notice)) this.#lockFor(card);
    }
    if (data.stopped) element.append(this.#stoppedNote());
    if (data.error !== undefined) element.error = data.error;
    this.transcript.append(element);
    return { data, element };
  }

  /**
   * A saved question or approval that was never answered: answering it now asks the model again,
   * with the answer in the last message.
   */
  #resumeOn(card: Card) {
    const resume = () => {
      if (this.#controller) return;
      queueMicrotask(() => {
        const turn = this.#turns.find(({ element }) => element.contains(card));
        if (!turn) return;
        if (card.localName === "ai-question" && turn.data.question) {
          turn.data.question = { ...turn.data.question, answer: (card as AiQuestionElement).answer ?? undefined };
        }
        if (card.localName === "ai-approval" && turn.data.approval) {
          const decision = (card as AiApprovalElement).decision ?? undefined;
          turn.data.approval = { ...turn.data.approval, decision };
          if (decision?.decision === "always") this.#allowed.add(turn.data.approval.name);
        }
        if (card.localName === "ai-questions" && turn.data.questions) {
          turn.data.questions = { ...turn.data.questions, answers: (card as AiQuestionsElement).answers ?? undefined };
        }
        if (card.localName === "ai-plan" && turn.data.plan) {
          turn.data.plan = { ...turn.data.plan, decision: (card as AiPlanElement).decision ?? undefined };
        }
        const user = [...this.#turns].reverse().find(({ data }) => data.role === "user")?.data;
        void this.#run({ text: user?.text ?? "", files: [], references: [] });
      });
    };
    const event = { "ai-question": "questionanswer", "ai-approval": "decisionchange", "ai-plan": "plandecision", "ai-questions": "questionsanswer" }[card.localName]!;
    card.addEventListener(event, resume, { once: true });
    if (card.localName === "ai-question") card.addEventListener("questionskip", resume, { once: true });
  }

  #questionElement(chunk: ChatQuestion) {
    const card = this.#part("ai-question");
    card.slot = "footer";
    card.question = chunk.question;
    card.options = chunk.options;
    card.multiple = chunk.multiple ?? false;
    card.other = chunk.other ?? false;
    card.max = chunk.max ?? null;
    card.skippable = chunk.skippable ?? false;
    const settle = (event: Event) => {
      if (card !== this.#waitingOn) return;
      const answer: QuestionAnswer = event.type === "questionskip" ? { skipped: true } : (event as CustomEvent).detail;
      // The event comes before the card shows its answer; continue once it has.
      queueMicrotask(() => this.#settle(answer));
    };
    card.addEventListener("questionanswer", settle);
    card.addEventListener("questionskip", settle);
    return card;
  }

  #approvalElement(chunk: ChatApproval) {
    const card = this.#part("ai-approval");
    card.slot = "footer";
    card.name = chunk.name;
    if (chunk.label) card.label = chunk.label;
    if (chunk.description) card.description = chunk.description;
    card.input = chunk.input;
    card.always = chunk.always ?? false;
    card.reason = chunk.reason ?? false;
    card.addEventListener("decisionchange", (event) => {
      if (card !== this.#waitingOn || !event.detail.value) return;
      const decision = event.detail.value;
      if (decision.decision === "always") this.#allowed.add(chunk.name);
      queueMicrotask(() => this.#settle(decision));
    });
    return card;
  }

  #questionsElement(chunk: ChatQuestions) {
    const card = this.#part("ai-questions");
    card.slot = "footer";
    if (chunk.label) card.label = chunk.label;
    card.questions = chunk.questions;
    card.addEventListener("questionsanswer", (event) => {
      if (card !== this.#waitingOn) return;
      const detail = event.detail;
      queueMicrotask(() => this.#settle(detail));
    });
    return card;
  }

  #planElement(chunk: ChatPlan) {
    const card = this.#part("ai-plan");
    card.slot = "footer";
    if (chunk.heading) card.heading = chunk.heading;
    if (chunk.summary) card.summary = chunk.summary;
    if (chunk.href) card.href = chunk.href;
    card.plan = chunk.plan ?? "";
    card.accepts = chunk.accepts ?? [];
    card.addEventListener("plandecision", (event) => {
      // Accepting with a mode switches the composer to it, when it offers that mode.
      const { mode } = event.detail;
      if (mode && this.composer.modes.some((option) => option.value === mode)) this.composer.mode = mode;
      if (card !== this.#waitingOn) return;
      const decision = event.detail;
      queueMicrotask(() => this.#settle(decision));
    });
    return card;
  }

  #noticeElement(chunk: ChatNotice) {
    const card = this.#part("ai-notice");
    card.slot = "footer";
    card.heading = chunk.heading;
    if (chunk.tone) card.tone = chunk.tone;
    card.text = chunk.text ?? "";
    card.actions = chunk.actions ?? [];
    card.dismissible = chunk.dismissible ?? false;
    if (chunk.resetsAt) card.resetsAt = chunk.resetsAt;
    // Once it's over or dismissed, the box unlocks.
    const release = () => {
      if (this.#lock?.notice === card) this.unlock();
    };
    card.addEventListener("noticeexpire", release);
    card.addEventListener("noticedismiss", (event) => queueMicrotask(() => !event.defaultPrevented && release()));
    return card;
  }

  /** Puts the message box back as it was before the lock, and returns the lock. */
  #release() {
    const lock = this.#lock;
    if (!lock) return null;
    this.#lock = null;
    const composer = this.composer;
    composer.disabled = lock.disabled;
    if (lock.hint === null) composer.removeAttribute("hint");
    else composer.setAttribute("hint", lock.hint);
    this.removeAttribute("locked");
    return lock;
  }

  /** Whether a notice locks the box: by default unless it's `info`, and not once unlocked or past its reset time. */
  #locks(notice: ChatNotice & { unlocked?: boolean }) {
    if (notice.unlocked) return false;
    if (notice.resetsAt && new Date(notice.resetsAt).getTime() <= Date.now()) return false;
    return notice.lock ?? notice.tone !== "info";
  }

  /** Locks the message box for this notice, replacing any earlier lock. */
  #lockFor(notice: AiNoticeElement) {
    const composer = this.composer;
    const previous = this.#lock;
    this.#lock = {
      notice,
      disabled: previous ? previous.disabled : composer.disabled,
      hint: previous ? previous.hint : composer.getAttribute("hint"),
    };
    composer.disabled = true;
    composer.setAttribute("hint", this.#strings.locked(notice.resetsAt));
    this.setAttribute("locked", "");
  }

  #sourcesElement(sources: Source[]) {
    const element = this.#part("ai-sources");
    element.slot = "footer";
    element.sources = sources;
    return element;
  }

  /** Follow-up suggestions go under the newest reply only. */
  #followUps(element: AiMessageElement, suggestions: Suggestion[]) {
    for (const old of this.querySelectorAll("ai-suggestions[data-part='follow-ups']")) old.remove();
    const offer = document.createElement("ai-suggestions");
    offer.dataset.part = "follow-ups";
    offer.slot = "footer";
    offer.layout = "list";
    offer.setAttribute("label", this.#strings.followUps);
    offer.for = this.composer.id;
    offer.suggestions = suggestions;
    element.append(offer);
  }

  #stoppedNote() {
    const note = document.createElement("p");
    note.slot = "footer";
    note.dataset.part = "stopped";
    note.textContent = this.#strings.stopped;
    return note;
  }

  /** Only the newest turn can be retried, so earlier replies drop Retry. */
  #syncRetry() {
    const lastUser = this.#turns.map(({ data }) => data.role).lastIndexOf("user");
    const actions = this.actions;
    this.#turns.forEach(({ data, element }, index) => {
      if (data.role !== "assistant") return;
      const words = actions.split(/\s+/).filter(Boolean);
      element.setAttribute("actions", (index > lastUser ? words : words.filter((word) => word !== "retry")).join(" "));
    });
  }

  /** While a question or an approval waits, the composer says how to answer it. */
  #syncWaiting() {
    const composer = this.querySelector<AiComposerElement>(":scope > ai-composer");
    if (!composer) return;
    const card = this.#waitingOn;
    if (card) {
      if (this.#placeholder === null) this.#placeholder = composer.getAttribute("placeholder") ?? "";
      const placeholders: Record<string, string> = {
        "ai-question": this.#strings.answerPlaceholder,
        "ai-questions": this.#strings.answerPlaceholder,
        "ai-approval": this.#strings.approvalPlaceholder,
        "ai-plan": this.#strings.planPlaceholder,
      };
      composer.setAttribute("placeholder", placeholders[card.localName]);
    } else if (this.#placeholder !== null) {
      if (this.#placeholder) composer.setAttribute("placeholder", this.#placeholder);
      else composer.removeAttribute("placeholder");
      this.#placeholder = null;
    }
    this.toggleAttribute("waiting", card !== null);
    // What's typed while an approval or a plan waits decides it, so an agent's Send needs the person too.
    const send = composer.querySelector<HTMLElement>(":scope [data-part='send']");
    if (send) {
      const name = card?.localName === "ai-approval" ? (card as AiApprovalElement).name : "";
      needsPerson(send, card?.localName === "ai-approval" ? this.#strings.approvalSendConfirm(name) : card?.localName === "ai-plan" ? this.#strings.planSendConfirm : "");
    }
  }

  #questionOf(card: AiQuestionElement): ChatQuestion {
    return { type: "question", question: card.question, options: card.options, multiple: card.multiple };
  }

  #changed() {
    this.dispatchEvent(new CustomEvent("chatchange", { detail: { messages: this.messages }, bubbles: true, composed: true }));
  }

  attributeChangedCallback(_name: string, previous: string | null, next: string | null) {
    if (previous !== next && this.#rendered) this.#syncRetry();
  }
}

adoptStyles(styles);
define("ai-chat", AiChatElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-chat": AiChatElement;
  }
  interface HTMLElementEventMap extends ChatEvents {}
}
