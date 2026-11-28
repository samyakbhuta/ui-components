import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, expect, test, vi } from "vitest";
import "./ai-questions.ts";
import type { AiQuestionsElement, QuestionsAnswerDetail } from "./ai-questions.ts";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const gift = [
  { question: "Who is it for?", options: ["A friend", "A parent", "A child"], other: true },
  { question: "What do they enjoy?", options: ["Books", "Cooking", "Games", "Gardening"], multiple: true, max: 2 },
  { question: "What's your budget?", options: ["Under £20", "£20 to £50", "Over £50"], skippable: true },
];

async function mount(setup?: (set: AiQuestionsElement) => void, markup = "<ai-questions></ai-questions>") {
  document.body.insertAdjacentHTML("beforeend", markup);
  const set = document.querySelector("ai-questions") as AiQuestionsElement;
  set.questions = gift;
  setup?.(set);
  await settle();
  const sent: QuestionsAnswerDetail[] = [];
  set.addEventListener("questionsanswer", (event) => sent.push(event.detail));
  const visible = () => [...set.querySelectorAll<HTMLElement>("ai-question")].find((question) => !question.hidden)!;
  return { set, sent, view: within(set), visible };
}

const part = (set: AiQuestionsElement, name: string) => set.querySelector<HTMLElement>(`[data-part='${name}']`)!;

test("it's a group, says it's waiting, and shows one question at a time with where you are", async () => {
  const { set, view, visible } = await mount();
  expect(within(document.body).queryByRole("group", { name: "Questions", description: "Waiting for your answers" })).toBe(set);
  expect(part(set, "position").textContent).toBe("1 of 3");
  expect(visible().getAttribute("question")).toBe("Who is it for?");
  expect(view.getByRole("button", { name: "Previous question" }).matches(":disabled") || part(set, "previous").hasAttribute("disabled")).toBe(true);
  // Each question's own Send says Continue, until the last.
  expect(within(visible()).getByRole("button", { name: "Continue" })).toBeTruthy();
  // The questions' own waiting lines give way to the set's.
  expect(set.querySelectorAll("ai-question:not([hidden])")).toHaveLength(1);
});

test("the arrows move freely; answers are kept, and Send on the last sends them all together", async () => {
  const user = userEvent.setup();
  const { set, sent, view, visible } = await mount();
  const answered = vi.fn();
  document.body.addEventListener("questionanswer", answered);

  await user.click(within(visible()).getByRole("radio", { name: "A parent" }));
  await user.click(within(visible()).getByRole("button", { name: "Continue" }));
  expect(part(set, "position").textContent).toBe("2 of 3");
  await user.click(within(visible()).getByRole("checkbox", { name: "Books" }));
  await user.click(within(visible()).getByRole("checkbox", { name: "Gardening" }));

  // Back, and the first answer is still chosen; then forward again with the arrow.
  await user.click(view.getByRole("button", { name: "Previous question" }));
  expect(within(visible()).getByRole("radio", { name: "A parent" }).getAttribute("aria-checked")).toBe("true");
  await user.click(view.getByRole("button", { name: "Next question" }));
  await user.click(within(visible()).getByRole("button", { name: "Continue" }));
  expect(part(set, "position").textContent).toBe("3 of 3");
  expect(sent).toEqual([]);

  await user.click(within(visible()).getByRole("radio", { name: "£20 to £50" }));
  await user.click(within(visible()).getByRole("button", { name: "Send" }));
  expect(sent).toEqual([
    {
      answers: [
        { value: "A parent", labels: ["A parent"], other: null },
        { value: ["Books", "Gardening"], labels: ["Books", "Gardening"], other: null },
        { value: "£20 to £50", labels: ["£20 to £50"], other: null },
      ],
    },
  ]);
  // The questions' own events stay inside the set.
  expect(answered).not.toHaveBeenCalled();
  expect(set.hasAttribute("answered")).toBe(true);
  expect(set.answers).toEqual(sent[0].answers);
});

test("once sent, a summary lists each question with its answer, and focus moves there", async () => {
  const { set, view } = await mount();
  set.answers = [{ value: "A child", labels: ["A child"], other: null }, { value: ["Games"], labels: ["Games"], other: null }, { skipped: true }];
  await settle();
  expect(part(set, "questions").hidden).toBe(true);
  expect(part(set, "nav").hidden).toBe(true);
  expect(part(set, "status").hidden).toBe(true);
  expect(view.getByText("Your answers")).toBeTruthy();
  expect([...set.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["Who is it for?", "What do they enjoy?", "What's your budget?"]);
  expect([...set.querySelectorAll("dd")].map((value) => value.textContent)).toEqual(["A child", "Games", "Skipped"]);
  expect(set.submit()).toBe(false);

  set.answers = null;
  await settle();
  expect(part(set, "summary").hidden).toBe(true);
  expect(part(set, "position").textContent).toBe("1 of 3");
});

test("a single choice picked by pointer moves on by itself; keys and the last question don't", async () => {
  const user = userEvent.setup();
  const { set, visible } = await mount();
  await user.click(within(visible()).getByRole("radio", { name: "A friend" }));
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(part(set, "position").textContent).toBe("2 of 3");

  // Choosing with the keyboard stays put.
  set.index = 0;
  await settle();
  within(visible()).getByRole("radio", { name: "A friend" }).focus();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await user.keyboard("{ArrowDown}");
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(part(set, "position").textContent).toBe("1 of 3");

  // The last question waits for Send.
  set.index = 2;
  await settle();
  await user.click(within(visible()).getByRole("radio", { name: "Over £50" }));
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(set.hasAttribute("answered")).toBe(false);
});

test("Send with a question still unanswered goes to it and says so; Skip counts as an answer", async () => {
  const user = userEvent.setup();
  const { set, sent, visible } = await mount();
  set.index = 2;
  await settle();
  await user.click(within(visible()).getByRole("button", { name: "Skip" }));
  expect(sent).toEqual([]);
  expect(part(set, "position").textContent).toBe("1 of 3");
  await new Promise((resolve) => requestAnimationFrame(resolve));
  expect(part(set, "announcement").textContent).toBe("Question 1 still needs an answer.");
});

test("cancelling keeps it asking; disabled locks it; questions written inside work too", async () => {
  const { set, sent } = await mount(
    (s) => {
      s.questions = [];
    },
    `<ai-questions label="About the gift"><ai-question question="Wrap it?"><ul><li>Yes</li><li>No</li></ul></ai-question></ai-questions>`,
  );
  // `questions = []` replaced what was written; build it again from markup.
  document.body.replaceChildren();
  document.body.insertAdjacentHTML("beforeend", `<ai-questions label="About the gift"><ai-question question="Wrap it?"><ul><li>Yes</li><li>No</li></ul></ai-question></ai-questions>`);
  const written = document.querySelector("ai-questions") as AiQuestionsElement;
  await settle();
  expect(within(document.body).queryByRole("group", { name: "About the gift" })).toBe(written);
  expect(written.questions.map((question) => question.question)).toEqual(["Wrap it?"]);
  // One question: no arrows.
  expect(part(written, "nav").hidden).toBe(true);
  written.addEventListener("questionsanswer", (event) => event.preventDefault(), { once: true });
  const question = written.querySelector("ai-question")!;
  question.value = "Yes";
  question.submit();
  expect(written.answers).toBeNull();
  written.disabled = true;
  await settle();
  expect(question.hasAttribute("disabled")).toBe(true);
  expect(written.submit()).toBe(false);
  expect(sent).toEqual([]);
  expect(set.isConnected).toBe(false);
});

test("words can be replaced", async () => {
  const { set, visible } = await mount((s) => {
    s.strings = { waiting: "En attente", position: (i, n) => `${i} sur ${n}`, nextQuestion: "Suivant", send: "Envoyer", previous: "Précédente" };
  });
  expect(part(set, "position").textContent).toBe("1 sur 3");
  expect(within(visible()).getByRole("button", { name: "Suivant" })).toBeTruthy();
  expect(within(document.body).queryByRole("group", { description: "En attente" })).toBe(set);
});

test("agents can answer and send", async () => {
  const { set, sent } = await mount((s) => (s.questions = [gift[0]]));
  const result = await createAgent().act({ steps: [{ ref: "Who is it for?", action: "setValue", args: ["A friend"] }, { ref: "Send", action: "press" }] });
  expect(result.ok, result.error?.message).toBe(true);
  expect(sent).toEqual([{ answers: [{ value: "A friend", labels: ["A friend"], other: null }] }]);
  expect(set.hasAttribute("answered")).toBe(true);
});
