import "../ai-approval/ai-approval.ts";
import "../ai-composer/ai-composer.ts";
import "../ai-message/ai-message.ts";
import "../ai-question/ai-question.ts";
import "../ai-sources/ai-sources.ts";
import "../ai-suggestions/ai-suggestions.ts";
import "../ai-thinking/ai-thinking.ts";
import "../ai-tool-call/ai-tool-call.ts";
import "../ai-transcript/ai-transcript.ts";
import type { AiApprovalElement, ApprovalDecisionDetail } from "../ai-approval/ai-approval.ts";
import type { AiComposerElement, PromptSubmitDetail } from "../ai-composer/ai-composer.ts";
import type { AiMessageElement, MessageAttachment, MessageFeedback } from "../ai-message/ai-message.ts";
import type { AiQuestionElement, QuestionAnswer, QuestionOption } from "../ai-question/ai-question.ts";
import type { Source } from "../ai-sources/ai-sources.ts";
import type { Suggestion } from "../ai-suggestions/ai-suggestions.ts";
import type { AiThinkingElement } from "../ai-thinking/ai-thinking.ts";
import type { AiToolCallElement } from "../ai-tool-call/ai-tool-call.ts";
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

/** One piece of a reply, as the model yields it. A string is text to add. */
export type ChatChunk =
  | string
  | { type: "text"; text: string }
  | { type: "thinking"; text?: string; done?: boolean }
  | { type: "tool"; id: string; name: string; label?: string; input?: unknown }
  | { type: "tool-result"; id: string; summary?: string; output?: unknown; error?: string }
  | { type: "sources"; sources: Source[] }
  | { type: "suggestions"; suggestions: Suggestion[] }
  | ChatQuestion
  | ChatApproval;

/** What comes back from a question or an approval, as the value of its `yield`. */
export type ChatAnswer = QuestionAnswer | ApprovalDecisionDetail;

/** A tool the reply ran. */
export type ChatToolCall = { id: string; name: string; label?: string; summary?: string; input?: unknown; output?: unknown; error?: string };

/** One message of the conversation, as `messages` holds it: plain data, to save and set again. */
export type ChatMessage = {
  role: "user" | "assistant";
  text: string;
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
};

export const defaultChatStrings: ChatStrings = {
  stopped: "Stopped",
  error: "Something went wrong. Press Retry to try again.",
  noModel: "No model is connected. Set the chat's model property.",
  starters: "Suggestions",
  followUps: "Follow-up questions",
  answerPlaceholder: "Answer the question above, or type your answer",
  approvalPlaceholder: "Allow or deny above, or tell it what to do instead",
};

/** The events this element fires, by name. */
export type ChatEvents = {
  chatchange: CustomEvent<{ messages: ChatMessage[] }>;
  chaterror: CustomEvent<{ error: unknown }>;
};

type Turn = { data: ChatMessage; element: AiMessageElement };

let count = 0;

const copy = (message: ChatMessage): ChatMessage => ({
  ...message,
  attachments: message.attachments ? [...message.attachments] : undefined,
  tools: message.tools?.map((tool) => ({ ...tool })),
  sources: message.sources ? [...message.sources] : undefined,
  question: message.question ? { ...message.question } : undefined,
  approval: message.approval ? { ...message.approval } : undefined,
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
  #waitingOn: AiQuestionElement | AiApprovalElement | null = null;
  #placeholder: string | null = null;
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
    this.#strings = { ...defaultChatStrings, ...value };
    const starters = this.querySelector(":scope ai-suggestions[data-part='starters']");
    starters?.setAttribute("label", this.#strings.starters);
  }

  /** True while a reply comes in. */
  get busy(): boolean {
    return this.#controller !== null && this.#answer === null;
  }

  /** True while a question or an approval waits on the person. */
  get waiting(): boolean {
    return this.#answer !== null;
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
        this.composer.focus();
      }
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
      if (card instanceof HTMLElement && card.localName === "ai-question") {
        const question = card as AiQuestionElement;
        const answer = typedAnswer(this.#questionOf(question), prompt.text);
        question.answer = answer;
        this.#settle(answer);
      } else {
        const decision: ApprovalDecisionDetail = { decision: "deny", reason: prompt.text };
        (card as AiApprovalElement).decision = decision;
        this.#settle(decision);
      }
      return;
    }
    const message: ChatMessage = { role: "user", text: prompt.text };
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
    this.#syncRetry();

    let turn: Turn | null = null;
    let thinking: AiThinkingElement | null = null;
    let thinkingStarted = 0;
    const tools = new Map<string, { call: AiToolCallElement; data: ChatToolCall }>();
    const reply = () => {
      if (turn) return turn;
      const data: ChatMessage = { role: "assistant", text: "" };
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
            case "text": {
              endThinking();
              reply().element.appendText(chunk.text);
              break;
            }
            case "thinking": {
              const { element } = reply();
              if (!thinking) {
                thinking = document.createElement("ai-thinking");
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
              const call = document.createElement("ai-tool-call");
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
  #wait(card: AiQuestionElement | AiApprovalElement, signal: AbortSignal): Promise<ChatAnswer> {
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

  #messageElement(data: ChatMessage) {
    const element = document.createElement("ai-message");
    element.from = data.role;
    if (data.role === "assistant") element.setAttribute("actions", this.actions);
    return element;
  }

  /** Shows a message from data, finished: a saved one, or one just sent. */
  #show(data: ChatMessage): Turn {
    const element = this.#messageElement(data);
    element.text = data.text;
    if (data.attachments?.length) element.attachments = data.attachments;
    if (data.feedback) element.feedback = data.feedback;
    if (data.thinking) {
      const thinking = document.createElement("ai-thinking");
      thinking.slot = "header";
      thinking.status = "done";
      thinking.timer = true;
      if (data.thinking.seconds !== undefined) thinking.duration = data.thinking.seconds;
      thinking.reasoning = data.thinking.text;
      element.append(thinking);
    }
    for (const tool of data.tools ?? []) {
      const call = document.createElement("ai-tool-call");
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
    if (data.stopped) element.append(this.#stoppedNote());
    if (data.error !== undefined) element.error = data.error;
    this.transcript.append(element);
    return { data, element };
  }

  /**
   * A saved question or approval that was never answered: answering it now asks the model again,
   * with the answer in the last message.
   */
  #resumeOn(card: AiQuestionElement | AiApprovalElement) {
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
        const user = [...this.#turns].reverse().find(({ data }) => data.role === "user")?.data;
        void this.#run({ text: user?.text ?? "", files: [], references: [] });
      });
    };
    card.addEventListener(card.localName === "ai-question" ? "questionanswer" : "approvaldecision", resume, { once: true });
    if (card.localName === "ai-question") card.addEventListener("questionskip", resume, { once: true });
  }

  #questionElement(chunk: ChatQuestion) {
    const card = document.createElement("ai-question");
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
    const card = document.createElement("ai-approval");
    card.slot = "footer";
    card.name = chunk.name;
    if (chunk.label) card.label = chunk.label;
    if (chunk.description) card.description = chunk.description;
    card.input = chunk.input;
    card.always = chunk.always ?? false;
    card.reason = chunk.reason ?? false;
    card.addEventListener("approvaldecision", (event) => {
      if (card !== this.#waitingOn) return;
      const decision = event.detail;
      if (decision.decision === "always") this.#allowed.add(chunk.name);
      queueMicrotask(() => this.#settle(decision));
    });
    return card;
  }

  #sourcesElement(sources: Source[]) {
    const element = document.createElement("ai-sources");
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
      composer.setAttribute(
        "placeholder",
        card.localName === "ai-question" ? this.#strings.answerPlaceholder : this.#strings.approvalPlaceholder,
      );
    } else if (this.#placeholder !== null) {
      if (this.#placeholder) composer.setAttribute("placeholder", this.#placeholder);
      else composer.removeAttribute("placeholder");
      this.#placeholder = null;
    }
    this.toggleAttribute("waiting", card !== null);
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
