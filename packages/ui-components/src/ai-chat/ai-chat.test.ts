import { waitFor, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { afterEach, expect, test, vi } from "vitest";
import "./ai-chat.ts";
import type { AiChatElement, ChatAnswer, ChatChunk, ChatMessage, ChatRequest } from "./ai-chat.ts";

afterEach(() => document.body.replaceChildren());

async function mount(markup = "<ai-chat></ai-chat>", setup?: (chat: AiChatElement) => void) {
  document.body.insertAdjacentHTML("beforeend", markup);
  const chat = document.querySelector("ai-chat") as AiChatElement;
  setup?.(chat);
  await settle();
  const changes: ChatMessage[][] = [];
  chat.addEventListener("chatchange", (event) => changes.push(event.detail.messages));
  return {
    chat,
    changes,
    view: within(chat),
    prompt: within(chat).getByRole<HTMLTextAreaElement>("textbox", { name: "Prompt" }),
    replies: () => [...chat.querySelectorAll("ai-message:not([from='user'])")] as HTMLElementTagNameMap["ai-message"][],
    idle: () => waitFor(() => expect(chat.busy || chat.waiting).toBe(false)),
    waiting: () => waitFor(() => expect(chat.waiting).toBe(true)),
  };
}

/** Sends through the composer, as a person would. */
async function send(chat: AiChatElement, text: string) {
  chat.send(text);
  await settle();
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("a sent prompt shows as yours, and the model's streamed text as the reply", async () => {
  const seen: ChatRequest[] = [];
  const { chat, changes, replies, idle } = await mount("<ai-chat></ai-chat>", (c) => {
    c.model = async function* (request) {
      seen.push(request);
      yield "Hello ";
      await tick();
      yield { type: "text", text: "**there**." };
    };
  });
  // The turn starts as the prompt is sent.
  chat.send("Hi");
  expect(chat.busy).toBe(true);
  expect(chat.composer.busy).toBe(true);
  await idle();
  expect(chat.composer.busy).toBe(false);
  expect(chat.querySelector("ai-message[from='user']")!.textContent).toContain("Hi");
  expect(replies()[0].text).toBe("Hello **there**.");
  const at = expect.stringMatching(/^\d{4}-\d\d-\d\dT/);
  expect(seen[0].messages).toEqual([{ role: "user", text: "Hi", createdAt: at }]);
  expect(seen[0].prompt.text).toBe("Hi");
  expect(chat.messages).toEqual([
    { role: "user", text: "Hi", createdAt: at },
    { role: "assistant", text: "Hello **there**.", createdAt: at },
  ]);
  expect(changes.at(-1)).toEqual(chat.messages);
});

test("a model can return a promise of the whole text instead", async () => {
  const { chat, replies, idle } = await mount("<ai-chat></ai-chat>", (c) => {
    c.model = async ({ messages }) => `You said ${messages.at(-1)!.text}`;
  });
  await send(chat, "hello");
  await idle();
  expect(replies()[0].text).toBe("You said hello");
});

test("Stop ends the reply, keeps what arrived, says it stopped, and aborts the model's signal", async () => {
  let signal: AbortSignal | undefined;
  const { chat, replies, idle } = await mount("<ai-chat></ai-chat>", (c) => {
    c.model = async function* (request) {
      signal = request.signal;
      yield "Partly";
      await new Promise((_, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason)));
    };
  });
  await send(chat, "Long one");
  await waitFor(() => expect(replies()[0].text).toBe("Partly"));
  chat.stop();
  await idle();
  expect(signal!.aborted).toBe(true);
  expect(replies()[0].querySelector("[data-part='stopped']")!.textContent).toBe("Stopped");
  expect(chat.messages[1]).toMatchObject({ role: "assistant", text: "Partly", stopped: true });
});

test("an error shows on the reply and fires chaterror; Retry asks again, and only the newest turn offers it", async () => {
  let calls = 0;
  const errors = vi.fn();
  const { chat, replies, idle } = await mount("<ai-chat></ai-chat>", (c) => {
    c.model = async function* () {
      calls++;
      if (calls === 1) throw new Error("The connection dropped.");
      yield `Answer ${calls}`;
    };
  });
  chat.addEventListener("chaterror", errors);
  await send(chat, "First");
  await idle();
  expect(replies()[0].error).toBe("The connection dropped.");
  expect(errors).toHaveBeenCalledOnce();
  expect(chat.messages[1].error).toBe("The connection dropped.");

  const user = userEvent.setup();
  await user.click(within(replies()[0]).getByRole("button", { name: "Retry" }));
  await idle();
  expect(replies()).toHaveLength(1);
  expect(replies()[0].text).toBe("Answer 2");

  await send(chat, "Second");
  await idle();
  expect(within(replies()[0]).queryByRole("button", { name: "Retry" })).toBeNull();
  expect(within(replies()[1]).getByRole("button", { name: "Retry" })).toBeDefined();
  expect(chat.retry()).toBe(true);
  await idle();
  expect(replies().map((reply) => reply.text)).toEqual(["Answer 2", "Answer 4"]);
});

test("thinking, tool calls, sources and follow-ups show on the reply, and are saved", async () => {
  const { chat, replies, idle } = await mount("<ai-chat></ai-chat>", (c) => {
    c.model = async function* () {
      yield { type: "thinking", text: "Looking it up." };
      yield { type: "tool", id: "t1", name: "web_search", label: "Searching…", input: { query: "custom elements" } };
      yield { type: "tool-result", id: "t1", summary: "Searched the web", output: "3 results" };
      yield "Custom elements are your own tags [1].";
      yield { type: "sources", sources: [{ title: "Using custom elements", url: "https://developer.mozilla.org/" }] };
      yield { type: "suggestions", suggestions: ["Show an example"] };
    };
  });
  await send(chat, "What are custom elements?");
  await idle();
  const reply = replies()[0];
  expect(reply.querySelector("ai-thinking")!.status).toBe("done");
  expect(reply.querySelector("ai-tool-call")!.status).toBe("done");
  expect(reply.querySelector("ai-tool-call")!.summary).toBe("Searched the web");
  expect(within(reply).getByRole("link", { name: "Source 1: Using custom elements" })).toBeDefined();
  expect(within(reply).getByRole("button", { name: "Show an example" })).toBeDefined();
  expect(chat.messages[1]).toMatchObject({
    thinking: { text: "Looking it up." },
    tools: [{ id: "t1", name: "web_search", summary: "Searched the web", output: "3 results" }],
    sources: [{ title: "Using custom elements" }],
  });
});

test("a question waits for the answer, which comes back into the model; the reply carries on below", async () => {
  const answers: (ChatAnswer | undefined)[] = [];
  const { chat, view, prompt, replies, idle, waiting } = await mount("<ai-chat></ai-chat>", (c) => {
    c.model = async function* () {
      yield "First, a question.";
      const answer: ChatAnswer | undefined = yield { type: "question", question: "Which city?", options: ["Paris", "Rome"] } as ChatChunk;
      answers.push(answer);
      yield `Great, ${(answer as { labels: string[] }).labels[0]}.`;
    };
  });
  await send(chat, "Plan a trip");
  await waiting();
  expect(chat.busy).toBe(false);
  expect(chat.composer.busy).toBe(false);
  expect(prompt.placeholder).toBe("Answer the question above, or type your answer");
  expect(chat.hasAttribute("waiting")).toBe(true);

  const user = userEvent.setup();
  await user.click(view.getByRole("radio", { name: "Rome" }));
  await user.click(within(chat.querySelector("ai-question")!).getByRole("button", { name: "Send" }));
  await idle();
  expect(answers).toEqual([{ value: "Rome", labels: ["Rome"], other: null }]);
  expect(replies().map((reply) => reply.text)).toEqual(["First, a question.", "Great, Rome."]);
  expect(prompt.placeholder).toBe("Ask anything…");
  expect(chat.messages[1].question).toMatchObject({ question: "Which city?", answer: { value: "Rome" } });
});

test("typing while a question waits answers it: a choice's name chooses it, anything else is Other", async () => {
  const answers: unknown[] = [];
  const { chat, idle, waiting } = await mount("<ai-chat></ai-chat>", (c) => {
    c.model = async function* () {
      answers.push(yield { type: "question", question: "Which city?", options: ["Paris", "Rome"], other: true } as ChatChunk);
      answers.push(yield { type: "question", question: "What to do?", options: ["Food"], multiple: true, other: true } as ChatChunk);
    };
  });
  await send(chat, "Plan");
  await waiting();
  await send(chat, "paris");
  await waiting();
  await send(chat, "Hiking");
  await idle();
  expect(answers).toEqual([
    { value: "Paris", labels: ["Paris"], other: null },
    { value: ["Hiking"], labels: ["Hiking"], other: "Hiking" },
  ]);
  // Typed answers don't become messages of their own.
  expect(chat.querySelectorAll("ai-message[from='user']")).toHaveLength(1);
});

test("an approval waits for the decision; Always allow skips it next time; typing denies with a reason", async () => {
  const decisions: unknown[] = [];
  const { chat, view, prompt, idle, waiting } = await mount("<ai-chat></ai-chat>", (c) => {
    c.model = async function* () {
      decisions.push(yield { type: "approval", name: "run_command", label: "Run a command", input: "rm -rf dist", always: true, reason: true } as ChatChunk);
    };
  });
  await send(chat, "Clean up");
  await waiting();
  expect(prompt.placeholder).toBe("Allow or deny above, or tell it what to do instead");
  const user = userEvent.setup();
  await user.click(view.getByRole("button", { name: "Always allow" }));
  await idle();
  expect(chat.alwaysAllowed).toEqual(["run_command"]);

  await send(chat, "Again");
  await idle();
  expect(decisions).toEqual([
    { decision: "always", reason: null },
    { decision: "always", reason: null },
  ]);
  const cards = chat.querySelectorAll("ai-approval");
  expect(cards[1].decision).toEqual({ decision: "always", reason: null });

  chat.alwaysAllowed = [];
  await send(chat, "Once more");
  await waiting();
  await send(chat, "Back it up first");
  await idle();
  expect(decisions.at(-1)).toEqual({ decision: "deny", reason: "Back it up first" });
});

test("a saved conversation shows again, and an unanswered question asks the model again once answered", async () => {
  const seen: ChatMessage[][] = [];
  const saved: ChatMessage[] = [
    { role: "user", text: "Plan a trip" },
    { role: "assistant", text: "Which city?", question: { type: "question", question: "Which city?", options: ["Paris", "Rome"] } },
  ];
  const { chat, view, replies, idle } = await mount("<ai-chat></ai-chat>", (c) => {
    c.messages = saved;
    c.model = async function* ({ messages }) {
      seen.push(messages);
      yield "Rome it is.";
    };
  });
  expect(chat.messages).toEqual(saved);
  expect(replies()[0].text).toBe("Which city?");

  const user = userEvent.setup();
  await user.click(view.getByRole("radio", { name: "Rome" }));
  await user.click(within(chat.querySelector("ai-question")!).getByRole("button", { name: "Send" }));
  await idle();
  expect(seen[0].at(-1)!.question!.answer).toEqual({ value: "Rome", labels: ["Rome"], other: null });
  expect(replies().at(-1)!.text).toBe("Rome it is.");
});

test("without a model, the reply says so", async () => {
  const { chat, replies, idle } = await mount();
  await send(chat, "Hi");
  await idle();
  expect(replies()[0].error).toBe("No model is connected. Set the chat's model property.");
});

test("starters show while it's empty and send; markup inside sets up the composer and the empty state", async () => {
  const user = userEvent.setup();
  const { chat, view, replies, idle } = await mount(
    `<ai-chat><p slot="empty">What can I help with?</p><ai-composer attachments placeholder="Ask me"></ai-composer></ai-chat>`,
    (c) => {
      c.suggestions = ["Write a haiku"];
      c.model = async () => "A haiku.";
    },
  );
  expect(chat.composer.hasAttribute("attachments")).toBe(true);
  expect(chat.querySelectorAll(":scope > ai-composer")).toHaveLength(1);
  expect(chat.transcript.querySelector("[slot='empty']")!.textContent).toBe("What can I help with?");
  expect(view.getByRole("list", { name: "Suggestions" })).toBeDefined();
  await user.click(view.getByRole("button", { name: "Write a haiku" }));
  await idle();
  expect(replies()[0].text).toBe("A haiku.");
  expect(chat.messages[0].text).toBe("Write a haiku");
});

test("strings gives its words to every part the chat makes, as it streams in or from saved messages", async () => {
  const { chat, replies, waiting } = await mount("<ai-chat></ai-chat>", (c) => {
    c.strings = {
      message: { copy: "Copier", retry: "Réessayer", edit: "Modifier" },
      thinking: { thoughtFor: (duration) => `Réflexion : ${duration}` },
      toolCall: { done: (name) => `${name} : terminé` },
      sources: { heading: "Sources citées" },
      question: { send: "Envoyer" },
      approval: { allow: "Autoriser une fois", deny: "Refuser" },
    };
    c.model = async function* () {
      yield { type: "thinking", text: "Voyons." };
      yield { type: "tool", id: "t1", name: "recherche" };
      yield { type: "tool-result", id: "t1" };
      yield "Voilà [1].";
      yield { type: "sources", sources: [{ title: "MDN", url: "https://developer.mozilla.org/" }] };
      yield { type: "question", question: "Laquelle ?", options: ["A", "B"] };
    };
  });
  await send(chat, "Bonjour");
  await waiting();

  const user = chat.querySelector<HTMLElement>("ai-message[from='user']")!;
  expect(within(user).getByRole("button", { name: "Copier" })).toBeTruthy();
  expect(within(user).getByRole("button", { name: "Modifier" })).toBeTruthy();
  const reply = replies()[0];
  expect(reply.strings.retry).toBe("Réessayer");
  expect(reply.querySelector("ai-thinking")!.textContent).toContain("Réflexion : ");
  expect(reply.querySelector("ai-tool-call")!.textContent).toContain("recherche : terminé");
  expect(reply.querySelector("ai-sources")!.textContent).toContain("Sources citées");
  expect(within(chat.querySelector<HTMLElement>("ai-question")!).getByRole("button", { name: "Envoyer" })).toBeTruthy();

  // A saved approval shows with the words too.
  chat.messages = [
    { role: "user", text: "Nettoie" },
    { role: "assistant", text: "", approval: { type: "approval", name: "rm", label: "Supprimer dist" } },
  ];
  await settle();
  const approval = chat.querySelector<HTMLElement>("ai-approval")!;
  expect(within(approval).getByRole("button", { name: "Autoriser une fois" })).toBeTruthy();
  expect(within(approval).getByRole("button", { name: "Refuser" })).toBeTruthy();
});

test("changing strings updates the parts already shown, and leaving a key out brings back that part's defaults", async () => {
  const { chat, replies, idle } = await mount("<ai-chat></ai-chat>", (c) => {
    c.strings = { message: { copy: "Copier" }, thinking: { thoughtFor: (duration) => `Réflexion : ${duration}` } };
    c.model = async function* () {
      yield { type: "thinking", text: "Hmm." };
      yield "Done.";
    };
  });
  await send(chat, "Hi");
  await idle();
  const user = chat.querySelector<HTMLElement>("ai-message[from='user']")!;
  const thinking = replies()[0].querySelector("ai-thinking")!;
  expect(thinking.textContent).toContain("Réflexion : ");

  chat.strings = { message: { copy: "Copy this" } };
  await settle();
  expect(within(user).getByRole("button", { name: "Copy this" })).toBeTruthy();
  expect(replies()[0].strings.copy).toBe("Copy this");
  expect(thinking.textContent).toContain("Thought for");
  expect(thinking.textContent).not.toContain("Réflexion");

  // Words for parts the chat didn't make are left alone.
  const own = document.body.appendChild(document.createElement("ai-message"));
  own.strings = { copy: "Mine" };
  chat.strings = {};
  await settle();
  expect(own.strings.copy).toBe("Mine");
  expect(replies()[0].strings.copy).toBe("Copy");
});

test("a plan waits for the decision; accepting with a mode switches the composer's Mode; typing asks for changes", async () => {
  const decisions: (ChatAnswer | undefined)[] = [];
  const { chat, replies, waiting, idle } = await mount("<ai-chat></ai-chat>", (c) => {
    c.composer.modes = [
      { value: "plan", label: "Plan" },
      { value: "auto", label: "Auto" },
    ];
    c.composer.mode = "plan";
    c.model = async function* () {
      let decision = yield { type: "plan", heading: "Clean up", summary: "Two steps.", plan: "1. Look.\n2. Delete.", accepts: [{ value: "auto", label: "auto mode" }] };
      decisions.push(decision);
      if (decision && "decision" in decision && decision.decision === "revise") {
        decision = yield { type: "plan", heading: "Clean up, gently", plan: "1. Look.\n2. Keep the cache." };
        decisions.push(decision);
      }
      yield "Done.";
    };
  });
  await send(chat, "Clean up");
  await waiting();
  expect(chat.composer.getAttribute("placeholder")).toBe("Accept or reject the plan above, or say what to change");
  const first = chat.querySelector("ai-plan")!;
  expect(first.heading).toBe("Clean up");

  // Typing in the box asks for changes, and the model proposes a new plan.
  chat.composer.value = "Keep the cache";
  chat.composer.submit();
  await waitFor(() => expect(chat.querySelectorAll("ai-plan")).toHaveLength(2));
  await waiting();
  expect(first.decision).toEqual({ decision: "revise", mode: null, feedback: "Keep the cache" });
  const second = chat.querySelectorAll("ai-plan")[1];
  expect(second.heading).toBe("Clean up, gently");
  expect(second.accepts).toEqual([]);

  first.decide("accept"); // already decided: nothing happens
  expect(decisions).toHaveLength(1);
  const card = chat.querySelector<HTMLElement & { decide: (d: "accept", o?: { mode?: string }) => boolean }>("ai-plan:not([decided])")!;
  card.decide("accept");
  await idle();
  expect(decisions).toEqual([
    { decision: "revise", mode: null, feedback: "Keep the cache" },
    { decision: "accept", mode: null, feedback: null },
  ]);
  expect(replies().at(-1)!.text).toBe("Done.");
  expect(chat.messages.filter((message) => message.plan).map((message) => message.plan!.decision?.decision)).toEqual(["revise", "accept"]);
  expect(chat.composer.mode).toBe("plan");
});

test("Accept and use a mode switches the composer, and a saved open plan asks the model again once decided", async () => {
  const seen: ChatRequest[] = [];
  const { chat, view, idle } = await mount("<ai-chat></ai-chat>", (c) => {
    c.composer.modes = [
      { value: "plan", label: "Plan" },
      { value: "auto", label: "Auto" },
    ];
    c.composer.mode = "plan";
    c.model = async function* (request) {
      seen.push(request);
      yield "Starting.";
    };
    c.messages = [
      { role: "user", text: "Refactor" },
      { role: "assistant", text: "Here's my plan.", plan: { type: "plan", heading: "Refactor", accepts: [{ value: "auto", label: "auto mode" }] } },
    ];
  });
  await settle();
  await userEvent.setup().click(view.getByRole("button", { name: "Accept and use auto mode" }));
  await idle();
  expect(chat.composer.mode).toBe("auto");
  expect(seen).toHaveLength(1);
  expect(seen[0].messages.at(-1)!.plan!.decision).toEqual({ decision: "accept", mode: "auto", feedback: null });
});

test("several questions wait together; typing answers the one showing, and every answer comes back at once", async () => {
  const got: (ChatAnswer | undefined)[] = [];
  const { chat, waiting, idle, replies } = await mount("<ai-chat></ai-chat>", (c) => {
    c.model = async function* () {
      got.push(
        yield {
          type: "questions",
          questions: [
            { question: "Who is it for?", options: ["A friend", "A parent"] },
            { question: "Budget?", options: ["Under £20", "Over £20"] },
          ],
        },
      );
      yield "Here are some ideas.";
    };
  });
  await send(chat, "Help me pick a gift");
  await waiting();
  const set = chat.querySelector("ai-questions")!;
  expect(chat.composer.getAttribute("placeholder")).toBe("Answer the question above, or type your answer");
  chat.composer.value = "A parent";
  chat.composer.submit();
  await settle();
  expect(set.index).toBe(1);
  chat.composer.value = "Over £20";
  chat.composer.submit();
  await idle();
  expect(got).toEqual([
    {
      answers: [
        { value: "A parent", labels: ["A parent"], other: null },
        { value: "Over £20", labels: ["Over £20"], other: null },
      ],
    },
  ]);
  expect(replies().at(-1)!.text).toBe("Here are some ideas.");
  expect(chat.messages.find((message) => message.questions)!.questions!.answers).toHaveLength(2);

  // Saved, it shows the summary again.
  const saved = chat.messages;
  chat.messages = saved;
  await settle();
  expect(chat.querySelector("ai-questions")!.hasAttribute("answered")).toBe(true);
});

test("a notice shows in the reply and locks the message box until the app unlocks it", async () => {
  const actions: string[] = [];
  const { chat, replies, idle } = await mount("<ai-chat></ai-chat>", (c) => {
    c.composer.setAttribute("hint", "Enter to send");
    c.model = async function* () {
      yield {
        type: "notice",
        heading: "You've reached your usage limit",
        text: "Upgrade, or wait until it resets.",
        actions: [
          { value: "upgrade", label: "Upgrade plan", href: "#pricing", primary: true },
          { value: "extra", label: "Use extra credits" },
        ],
      };
    };
  });
  chat.addEventListener("noticeaction", (event) => actions.push(event.detail.value));
  await send(chat, "Hi");
  await idle();
  const notice = replies()[0].querySelector("ai-notice")!;
  expect(notice.heading).toBe("You've reached your usage limit");
  expect(notice.text).toBe("Upgrade, or wait until it resets.");
  expect(chat.locked).toBe(true);
  expect(chat.hasAttribute("locked")).toBe(true);
  expect(chat.composer.disabled).toBe(true);
  expect(chat.composer.getAttribute("hint")).toBe("Sending is paused. See the notice above.");
  expect(chat.messages[1].notice).toMatchObject({ type: "notice", heading: "You've reached your usage limit" });

  // Pressing a button tells the app; the app decides whether that unlocks.
  within(notice).getByRole("button", { name: "Use extra credits" }).click();
  await settle();
  expect(actions).toEqual(["extra"]);
  expect(chat.locked).toBe(true);
  expect(chat.unlock()).toBe(true);
  expect(chat.composer.disabled).toBe(false);
  expect(chat.composer.getAttribute("hint")).toBe("Enter to send");
  expect(chat.messages[1].notice!.unlocked).toBe(true);
  expect(chat.unlock()).toBe(false);
});

test("a notice with a reset time unlocks then, and a saved one locks again only while it applies", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: new Date(2026, 10, 28, 14, 0) });
  try {
    const resetsAt = new Date(2026, 10, 28, 14, 30).toISOString();
    const saved: ChatMessage[] = [
      { role: "user", text: "Hi" },
      { role: "assistant", text: "", notice: { type: "notice", heading: "Limit reached", resetsAt } },
    ];
    document.body.innerHTML = "<ai-chat></ai-chat>";
    const chat = document.querySelector("ai-chat")!;
    chat.strings = { locked: (at) => `Paused until ${at?.getHours()}:${String(at?.getMinutes()).padStart(2, "0")}` };
    chat.messages = saved;
    expect(chat.locked).toBe(true);
    expect(chat.composer.getAttribute("hint")).toBe("Paused until 14:30");

    vi.advanceTimersByTime(31 * 60_000);
    expect(chat.querySelector("ai-notice")!.expired).toBe(true);
    expect(chat.locked).toBe(false);
    expect(chat.composer.disabled).toBe(false);

    // Past its time, or once unlocked, a saved notice doesn't lock.
    chat.messages = saved;
    expect(chat.locked).toBe(false);
    chat.messages = [saved[0], { ...saved[1], notice: { ...saved[1].notice!, resetsAt: undefined, unlocked: true } }];
    expect(chat.locked).toBe(false);
    // An info notice doesn't lock unless asked to.
    chat.messages = [saved[0], { ...saved[1], notice: { type: "notice", heading: "New model", tone: "info" } }];
    expect(chat.locked).toBe(false);
    chat.messages = [saved[0], { ...saved[1], notice: { type: "notice", heading: "Signed out", tone: "info", lock: true } }];
    expect(chat.locked).toBe(true);
    chat.messages = [];
    expect(chat.locked).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test("dismissing a notice unlocks the box, and the notice's words come from chat.strings", async () => {
  const user = userEvent.setup();
  const { chat, idle } = await mount("<ai-chat></ai-chat>", (c) => {
    c.strings = { notice: { dismiss: "Fermer" } };
    c.model = async function* () {
      yield { type: "notice", heading: "Hors ligne", tone: "error", dismissible: true };
    };
  });
  await send(chat, "Bonjour");
  await idle();
  expect(chat.locked).toBe(true);
  await user.click(within(chat.querySelector("ai-notice")!).getByRole("button", { name: "Fermer" }));
  await settle();
  expect(chat.locked).toBe(false);
});

test("each message gets its time, and replies the model's name, which are saved and shown again", async () => {
  const { chat, replies, idle } = await mount("<ai-chat></ai-chat>", (c) => {
    c.composer.models = [
      { value: "sonnet", label: "Sonnet 5.5" },
      { value: "haiku", label: "Haiku 5.5" },
    ];
    c.composer.model = "sonnet";
    c.model = async function* ({ messages }) {
      if (messages.at(-1)!.text === "routed") yield { type: "model", name: "Haiku 5.5" };
      yield "Done.";
    };
  });
  const before = Date.now();
  await send(chat, "Hi");
  await idle();
  const [user, reply] = chat.messages;
  expect(Date.parse(user.createdAt!)).toBeGreaterThanOrEqual(before - 1000);
  expect(user.model).toBeUndefined();
  expect(reply.model).toBe("Sonnet 5.5");
  expect(replies()[0].model).toBe("Sonnet 5.5");
  expect(replies()[0].time?.toISOString()).toBe(reply.createdAt);
  expect(chat.querySelector<HTMLTimeElement>("ai-message[from='user'] time")!.dateTime).toBe(user.createdAt);
  expect(replies()[0].querySelector("[data-part='meta']")!.textContent).toBe("Sonnet 5.5 · just now");

  // A model chunk says which model really answered.
  await send(chat, "routed");
  await idle();
  expect(chat.messages.at(-1)!.model).toBe("Haiku 5.5");
  expect(replies().at(-1)!.model).toBe("Haiku 5.5");

  // Saved and set again, they show the same; one saved without them shows none.
  const saved = chat.messages;
  chat.messages = [...saved, { role: "assistant", text: "Old" }];
  expect(replies()[0].getAttribute("time")).toBe(saved[1].createdAt);
  expect(replies()[0].model).toBe("Sonnet 5.5");
  expect(replies().at(-1)!.querySelector<HTMLElement>("[data-part='meta']")!.hidden).toBe(true);
});

test("selected words can be quoted into the box, are sent with the prompt, and the quote takes you back", async () => {
  const seen: ChatRequest[] = [];
  const { chat, idle } = await mount("<ai-chat></ai-chat>", (c) => {
    c.model = async function* (request) {
      seen.push(request);
      yield "Custom elements are your own HTML tags.";
    };
  });
  await send(chat, "What are custom elements?");
  await idle();
  expect(chat.transcript.quotable).toBe(true);

  // Quote the reply, as the Quote button does.
  const reply = chat.querySelectorAll("ai-message")[1] as HTMLElementTagNameMap["ai-message"];
  const quoted = new CustomEvent("messagequote", {
    detail: { text: "your own HTML tags", message: reply, from: "assistant" as const },
    bubbles: true,
    cancelable: true,
  });
  chat.transcript.dispatchEvent(quoted);
  expect(quoted.defaultPrevented).toBe(true);
  expect(chat.composer.quotes).toEqual([{ text: "your own HTML tags", from: "assistant", id: "1" }]);

  await send(chat, "Like what?");
  await idle();
  const asked = seen.at(-1)!.messages.at(-1)!;
  expect(asked.text).toBe("Like what?");
  expect(asked.quotes).toEqual([{ text: "your own HTML tags", from: "assistant", id: "1" }]);
  expect(chat.composer.quotes).toEqual([]);

  // The sent message shows the quote, and pressing it goes back to the reply it came from.
  const mine = chat.querySelectorAll<HTMLElementTagNameMap["ai-message"]>("ai-message[from='user']")[1];
  const quote = within(mine).getByRole("button", { name: "Quoted: your own HTML tags" });
  reply.scrollIntoView = vi.fn();
  quote.click();
  expect(reply.scrollIntoView).toHaveBeenCalled();
  expect(document.activeElement).toBe(reply);
  expect(reply.hasAttribute("data-highlighted")).toBe(true);

  // Saved and set again, the quote is still there; Edit brings it back into the box.
  chat.messages = chat.messages;
  const again = chat.querySelectorAll<HTMLElementTagNameMap["ai-message"]>("ai-message[from='user']")[1];
  expect(again.quotes).toEqual([{ text: "your own HTML tags", from: "assistant", id: "1" }]);
  again.dispatchEvent(new CustomEvent("messageaction", { detail: { action: "edit", text: "Like what?" }, bubbles: true }));
  expect(chat.composer.value).toBe("Like what?");
  expect(chat.composer.quotes).toEqual([{ text: "your own HTML tags", from: "assistant", id: "1" }]);
});
