import { settle } from "@ui-sdk/core/testing";
import { expect, test } from "vitest";
import "../ai-message/ai-message.ts";
import "../ai-approval/ai-approval.ts";
import "../ai-plan/ai-plan.ts";
import "../ai-questions/ai-questions.ts";
import "../ai-question/ai-question.ts";
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
