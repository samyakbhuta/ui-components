import { settle } from "@ui-sdk/core/testing";
import { expect, test } from "vitest";
import "../ai-message/ai-message.ts";
import "../ai-approval/ai-approval.ts";
import "../ai-notice/ai-notice.ts";
import "../ai-plan/ai-plan.ts";
import "../ai-questions/ai-questions.ts";
import "../ai-question/ai-question.ts";
import "../ai-composer/ai-composer.ts";
import "./ai-transcript.ts";
import type { AiTranscriptElement } from "./ai-transcript.ts";

async function mount(markup = "<ai-transcript></ai-transcript>") {
  document.body.insertAdjacentHTML("beforeend", markup);
  const transcript = document.body.lastElementChild as AiTranscriptElement;
  await settle();
  return {
    transcript,
    // The transcript's own status region; each message has one too.
    announced: () => [...transcript.children].find((child) => (child as HTMLElement).dataset.part === "announcement")!.textContent,
    parts: () => [...transcript.children].map((child) => (child as HTMLElement).dataset.part ?? child.tagName.toLowerCase()),
  };
}

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

test("it's a named, focusable region that isn't a live region itself", async () => {
  const { transcript } = await mount();
  expect(transcript.getAttribute("role")).toBe("region");
  expect(transcript.getAttribute("aria-label")).toBe("Conversation");
  expect(transcript.tabIndex).toBe(0);
  expect(transcript.hasAttribute("aria-live")).toBe(false);

  transcript.strings = { label: "Chat", jump: "Latest" };
  expect(transcript.getAttribute("aria-label")).toBe("Chat");
  expect(transcript.querySelector("[data-part='jump']")!.textContent).toBe("Latest");

  const named = await mount('<ai-transcript aria-label="Support chat"></ai-transcript>');
  expect(named.transcript.getAttribute("aria-label")).toBe("Support chat");
});

test("its own parts stay after the messages", async () => {
  const { transcript, parts } = await mount('<ai-transcript><p slot="empty">Ask me anything</p></ai-transcript>');
  transcript.append(document.createElement("ai-message"), document.createElement("ai-message"));
  await settle();
  expect(parts()).toEqual(["p", "ai-message", "ai-message", "jump-bar", "announcement"]);
});

test("it's busy while a message streams, and reads each finished reply out once", async () => {
  const { transcript, announced } = await mount();
  const user = Object.assign(document.createElement("ai-message"), { from: "user" as const, text: "Hi" });
  const reply = document.createElement("ai-message");
  reply.streaming = true;
  transcript.append(user, reply);
  await settle();
  expect(transcript.getAttribute("aria-busy")).toBe("true");

  reply.appendText("Hello **there**.");
  reply.done();
  await frame();
  expect(transcript.hasAttribute("aria-busy")).toBe(false);
  expect(announced()).toBe("Hello there.");

  transcript.strings = { reply: (text) => `Reply: ${text}` };
  const second = document.createElement("ai-message");
  second.streaming = true;
  transcript.append(second);
  second.text = "Again.";
  second.done();
  await frame();
  expect(announced()).toBe("Reply: Again.");
});

test("a reply that asks a question is read out with it, so people know it's waiting on them", async () => {
  const { transcript, announced } = await mount();
  const reply = document.createElement("ai-message");
  reply.streaming = true;
  transcript.append(reply);
  reply.text = "First, a question.";
  const question = document.createElement("ai-question");
  question.slot = "footer";
  question.question = "Which city?";
  question.options = ["Paris", "Rome"];
  reply.append(question);
  reply.done();
  await frame();
  expect(announced()).toBe("First, a question. Which city? Waiting for your answer.");

  // An answered question isn't read out again.
  question.answer = { value: "Rome", labels: ["Rome"], other: null };
  transcript.strings = { waiting: (asked) => `Question: ${asked}` };
  reply.streaming = true;
  reply.done();
  await frame();
  expect(announced()).toBe("First, a question.");
});

test("a reply that asks for approval is read out with it", async () => {
  const { transcript, announced } = await mount();
  const reply = document.createElement("ai-message");
  reply.streaming = true;
  transcript.append(reply);
  reply.text = "I'll clear the build folder.";
  const approval = document.createElement("ai-approval");
  approval.slot = "footer";
  approval.label = "Run a command";
  reply.append(approval);
  await settle();
  reply.done();
  await frame();
  expect(announced()).toBe("I'll clear the build folder. Run a command Waiting for your approval.");
});

test("a reply that proposes a plan is read out with it", async () => {
  const { transcript, announced } = await mount();
  const reply = document.createElement("ai-message");
  reply.streaming = true;
  transcript.append(reply);
  reply.text = "Here's my plan.";
  const plan = document.createElement("ai-plan");
  plan.slot = "footer";
  plan.heading = "Clean up the build";
  reply.append(plan);
  await settle();
  reply.done();
  await frame();
  expect(announced()).toBe("Here's my plan. Clean up the build Waiting for your review.");
});

test("a reply that asks several questions is read out as one set", async () => {
  const { transcript, announced } = await mount();
  const reply = document.createElement("ai-message");
  reply.streaming = true;
  transcript.append(reply);
  reply.text = "A few questions first.";
  const set = document.createElement("ai-questions");
  set.slot = "footer";
  set.questions = [
    { question: "Who is it for?", options: ["A friend"] },
    { question: "Budget?", options: ["Under £20"] },
  ];
  reply.append(set);
  await settle();
  reply.done();
  await frame();
  expect(announced()).toBe("A few questions first. 2 questions, starting with: Who is it for? Waiting for your answers.");
});

test('announce="none" keeps replies quiet', async () => {
  const { transcript, announced } = await mount('<ai-transcript announce="none"></ai-transcript>');
  const reply = document.createElement("ai-message");
  reply.streaming = true;
  transcript.append(reply);
  reply.text = "Quiet";
  reply.done();
  await frame();
  expect(announced()).toBe("");
});

test("it follows new content until scrolled up, and a new message of yours follows again", async () => {
  const { transcript } = await mount();
  expect(transcript.following).toBe(true);

  // jsdom has no layout, so give the element sizes to scroll with.
  let top = 0;
  Object.defineProperties(transcript, {
    scrollHeight: { get: () => 1000, configurable: true },
    clientHeight: { get: () => 300, configurable: true },
    scrollTop: { get: () => top, set: (value: number) => (top = Math.min(value, 700)), configurable: true },
  });
  transcript.scrollToLatest();
  expect(top).toBe(700);

  top = 400;
  transcript.dispatchEvent(new Event("scroll"));
  expect(transcript.following).toBe(false);
  expect((transcript.querySelector("[data-part='jump']") as HTMLElement).hidden).toBe(false);

  transcript.append(document.createElement("ai-message"));
  await settle();
  expect(top).toBe(400);

  transcript.append(Object.assign(document.createElement("ai-message"), { from: "user" as const }));
  await settle();
  expect(transcript.following).toBe(true);
  expect(top).toBe(700);
  expect((transcript.querySelector("[data-part='jump']") as HTMLElement).hidden).toBe(true);
});

test("a reply with a notice, like a usage limit, is read out with it, and the notice doesn't announce itself too", async () => {
  const { transcript, announced } = await mount();
  const reply = document.createElement("ai-message");
  reply.streaming = true;
  transcript.append(reply);
  const notice = document.createElement("ai-notice");
  notice.slot = "footer";
  notice.heading = "You've reached your usage limit";
  notice.text = "Upgrade, or wait until it resets";
  reply.append(notice);
  await settle();
  reply.done();
  await frame();
  expect(announced()).toBe("You've reached your usage limit. Upgrade, or wait until it resets.");
  expect(notice.querySelector("[data-part='announcement']")!.textContent).toBe("");
});

test("`waiting` is the newest card still waiting on the person, and the jump button says what for", async () => {
  const { transcript } = await mount(`<ai-transcript>
    <ai-message><ai-question slot="footer" question="Which city?" answered></ai-question></ai-message>
    <ai-message><ai-notice slot="footer" heading="A new model" tone="info"></ai-notice></ai-message>
    <ai-message><ai-approval slot="footer" name="run_command"></ai-approval></ai-message>
  </ai-transcript>`);
  // An answered question and an info notice don't count.
  expect(transcript.waiting?.localName).toBe("ai-approval");

  transcript.querySelector("ai-approval")!.setAttribute("decided", "");
  expect(transcript.waiting).toBeNull();

  // A set's own questions count as the set.
  transcript.insertAdjacentHTML("beforeend", `<ai-message><ai-questions slot="footer"></ai-questions></ai-message>`);
  const set = transcript.querySelector("ai-questions")!;
  set.append(Object.assign(document.createElement("ai-question"), { question: "Which day?" }));
  expect(transcript.waiting).toBe(set);

  // Pretend the set is below the view: the jump button points to it, in words that can be changed.
  const jump = transcript.querySelector<HTMLButtonElement>("[data-part='jump']")!;
  set.getBoundingClientRect = () => ({ top: 900, bottom: 1000, left: 0, right: 100, width: 100, height: 100, x: 0, y: 900, toJSON() {} });
  set.getClientRects = () => [set.getBoundingClientRect()] as unknown as DOMRectList;
  transcript.strings = { jumpWaiting: (kind) => `En attente (${kind})` };
  expect(jump.hidden).toBe(false);
  expect(jump.hasAttribute("data-waiting")).toBe(true);
  expect(jump.textContent).toBe("En attente (answer)");

  set.setAttribute("answered", "");
  await settle();
  expect(jump.hasAttribute("data-waiting")).toBe(false);
  expect(jump.textContent).toBe("Jump to latest");
});

test("with `quotable`, selecting words in a message offers Quote, which fires messagequote and quotes into the composer named by `for`", async () => {
  const { transcript } = await mount(`<ai-transcript quotable for="box">
    <ai-message from="user">What are custom elements?</ai-message>
    <ai-message>Custom elements are **your own** HTML tags.</ai-message>
  </ai-transcript>`);
  document.body.insertAdjacentHTML("beforeend", `<ai-composer id="box"></ai-composer>`);
  await settle();
  const composer = document.querySelector("ai-composer")!;
  const quote = transcript.querySelector<HTMLButtonElement>("[data-part='quote-button']")!;
  const quoted: { text: string; from: string }[] = [];
  transcript.addEventListener("messagequote", (event) => quoted.push({ text: event.detail.text, from: event.detail.from }));

  const select = async (node: Node, start: number, endNode: Node, end: number) => {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(endNode, end);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    await frame();
  };
  expect(quote.hidden).toBe(true);
  const reply = transcript.querySelectorAll("ai-message")[1].querySelector("[data-part='body'] p")!;
  await select(reply.firstChild!, 0, reply.lastChild!, reply.lastChild!.textContent!.length);
  expect(quote.hidden).toBe(false);
  expect(quote.textContent).toBe("Quote");

  quote.click();
  expect(quoted).toEqual([{ text: "Custom elements are your own HTML tags.", from: "assistant" }]);
  expect(composer.quotes).toEqual([{ text: "Custom elements are your own HTML tags.", from: "assistant" }]);
  expect(quote.hidden).toBe(true);
  expect(document.getSelection()!.isCollapsed).toBe(true);

  // Cancelling the event leaves the composer to the app.
  transcript.addEventListener("messagequote", (event) => event.preventDefault(), { once: true });
  const asked = transcript.querySelector("ai-message[from='user'] [data-part='body'] p")!;
  await select(asked.firstChild!, 0, asked.firstChild!, 4);
  quote.click();
  expect(quoted.at(-1)).toEqual({ text: "What", from: "user" });
  expect(composer.quotes).toHaveLength(1);

  // Words across two messages, or outside a message's text, aren't offered.
  await select(asked.firstChild!, 0, reply.firstChild!, 3);
  expect(quote.hidden).toBe(true);

  // Without `quotable`, nothing is offered.
  transcript.quotable = false;
  await select(reply.firstChild!, 0, reply.firstChild!, 6);
  expect(quote.hidden).toBe(true);
  transcript.strings = { quote: "Citer" };
  expect(quote.textContent).toBe("Citer");
  composer.remove();
});
