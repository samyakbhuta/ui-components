import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { checkServer, mount as mountPrimitive, settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, expect, test, vi } from "vitest";
import "./ai-questions.ts";
import type { AiQuestionsElement, QuestionsAnswersChangeDetail } from "./ai-questions.ts";
import { questions as questionsPrimitive } from "./questions.ts";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

// jsdom can't measure, so the carousel shows one page and its own arrows stay disabled here.
// Paging, swiping and the slides it keeps inert are in the browser tests (e2e/questions.spec.ts);
// these move between questions through `index`, as the carousel's `pagechange` does.

const gift = [
  { question: "Who is it for?", options: ["A friend", "A parent", "A child"], other: true },
  { question: "What do they enjoy?", options: ["Books", "Cooking", "Games", "Gardening"], multiple: true, max: 2 },
  { question: "What's your budget?", options: ["Under £20", "£20 to £50", "Over £50"], skippable: true },
];

/** What ui-sdk's shared live region says, where `announce` writes for screen readers. */
const announced = () => [...document.querySelectorAll("[aria-live]")].map((region) => region.textContent).join(" ");

async function mount(setup?: (set: AiQuestionsElement) => void, markup = "<ai-questions></ai-questions>") {
  document.body.insertAdjacentHTML("beforeend", markup);
  const set = document.querySelector("ai-questions") as AiQuestionsElement;
  if (!markup.includes("<ai-question ")) set.questions = gift;
  setup?.(set);
  await settle();
  const changes: QuestionsAnswersChangeDetail[] = [];
  set.addEventListener("answerschange", (event) => changes.push(event.detail));
  /** The question showing: the one at `index`. */
  const showing = () => within(set.querySelectorAll<HTMLElement>("ui-carousel-item > ai-question")[set.index]);
  return { set, changes, sent: () => changes.map((change) => change.value), showing };
}

const part = (set: AiQuestionsElement, name: string) => set.querySelector<HTMLElement>(`[data-part='${name}']`)!;

test("it's a carousel named for the set, says it's waiting, and shows where you are", async () => {
  const { set, showing } = await mount();
  const carousel = within(document.body).getByRole("region", { name: "Questions", description: "Waiting for your answers" });
  expect(carousel.getAttribute("aria-roledescription")).toBe("carousel");
  expect(set.contains(carousel)).toBe(true);
  expect(set.querySelectorAll("ui-carousel-item")).toHaveLength(3);
  expect(part(set, "position").textContent).toBe("1 of 3");
  expect(within(carousel).getByRole("button", { name: "Previous question" })).toBeTruthy();
  expect(within(carousel).getByRole("button", { name: "Next question" })).toBeTruthy();
  expect(set.index).toBe(0);
  // Each question's own Send says Continue, until the last.
  expect(showing().getByRole("button", { name: "Continue" })).toBeTruthy();
  set.index = 2;
  await settle();
  expect(part(set, "position").textContent).toBe("3 of 3");
  expect(showing().getByRole("button", { name: "Send answers" })).toBeTruthy();
  // Out of range stays in range.
  set.api.goTo(9);
  await settle();
  expect(set.index).toBe(2);
});

test("Continue moves on; answers are kept; Send on the last sends them all together", async () => {
  const user = userEvent.setup();
  const { set, changes, sent, showing } = await mount();
  // Each question's own answer is cancelled inside the set, so nothing around it acts on it.
  const kept: boolean[] = [];
  document.body.addEventListener("answerchange", (event) => queueMicrotask(() => kept.push(!event.defaultPrevented)), true);

  await user.click(showing().getByRole("radio", { name: "A parent" }));
  await user.click(showing().getByRole("button", { name: "Continue" }));
  await settle();
  expect(set.index).toBe(1);
  expect(part(set, "position").textContent).toBe("2 of 3");
  await user.click(showing().getByRole("checkbox", { name: "Books" }));
  await user.click(showing().getByRole("checkbox", { name: "Gardening" }));

  // Back, and the first answer is still chosen; then forward again.
  set.index = 0;
  await settle();
  expect(showing().getByRole("radio", { name: "A parent" }).getAttribute("aria-checked")).toBe("true");
  set.index = 1;
  await settle();
  await user.click(showing().getByRole("button", { name: "Continue" }));
  await settle();
  expect(set.index).toBe(2);
  expect(changes).toEqual([]);

  await user.click(showing().getByRole("radio", { name: "£20 to £50" }));
  await user.click(showing().getByRole("button", { name: "Send answers" }));
  await settle();
  expect(sent()).toEqual([
    [
      { value: "A parent", labels: ["A parent"], other: null },
      { value: ["Books", "Gardening"], labels: ["Books", "Gardening"], other: null },
      { value: "£20 to £50", labels: ["£20 to £50"], other: null },
    ],
  ]);
  // Sent by a press on the last question's Send. (jsdom reports every press as "programmatic", so
  // the agent test below checks the press's own source comes through.)
  expect(changes[0].reason).toBe("press");
  expect(kept.length).toBeGreaterThan(0);
  expect(kept.every((stayed) => !stayed)).toBe(true);
  expect(set.hasAttribute("answered")).toBe(true);
  expect(set.answers).toEqual(sent()[0]);
  await vi.waitFor(() => expect(announced()).toContain("Sent 3 answers"));
});

test("once sent, a summary lists each question with its answer, and focus moves there", async () => {
  const { set, changes } = await mount((s) => (s.questions = [gift[0]]));
  const user = userEvent.setup();
  await user.click(within(set).getByRole("radio", { name: "A child" }));
  await user.click(within(set).getByRole("button", { name: "Send answers" }));
  await settle();
  expect(changes).toHaveLength(1);
  // The questions go, so focus lands on the summary rather than the page.
  expect(document.activeElement).toBe(part(set, "summary"));
  expect(part(set, "set").hidden).toBe(true);
  expect(within(set).getByText("Your answers")).toBeTruthy();
});

test("answers set from outside show the summary and fire nothing; null asks again", async () => {
  const { set, changes } = await mount();
  set.answers = [{ value: "A child", labels: ["A child"], other: null }, { value: ["Games"], labels: ["Games"], other: null }, { skipped: true }];
  await settle();
  expect(part(set, "set").hidden).toBe(true);
  expect(within(set).getByText("Your answers")).toBeTruthy();
  expect([...set.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["Who is it for?", "What do they enjoy?", "What's your budget?"]);
  expect([...set.querySelectorAll("dd")].map((value) => value.textContent)).toEqual(["A child", "Games", "Skipped"]);
  expect(set.api.submit()).toBe(false);
  expect(changes).toEqual([]);

  set.answers = null;
  await settle();
  expect(part(set, "set").hidden).toBe(false);
  expect(part(set, "summary").hidden).toBe(true);
  expect(part(set, "position").textContent).toBe("1 of 3");
  expect(set.hasAttribute("answered")).toBe(false);
  expect(changes).toEqual([]);
});

test("answers set before the questions, like a saved set, show once they're built", async () => {
  document.body.insertAdjacentHTML("beforeend", "<ai-questions></ai-questions>");
  const set = document.querySelector("ai-questions") as AiQuestionsElement;
  set.answers = [{ value: "A friend", labels: ["A friend"], other: null }, { value: ["Books"], labels: ["Books"], other: null }, { skipped: true }];
  set.questions = gift;
  await settle();
  expect(set.hasAttribute("answered")).toBe(true);
  expect([...set.querySelectorAll("dd")].map((value) => value.textContent)).toEqual(["A friend", "Books", "Skipped"]);
});

test("a single choice picked by pointer moves on by itself; keys, clicks without a pointer and the last question don't", async () => {
  const user = userEvent.setup();
  const { set, showing } = await mount();
  await user.click(showing().getByRole("radio", { name: "A friend" }));
  await vi.waitFor(() => expect(set.index).toBe(1), { timeout: 1500 });

  // Choosing with the keyboard stays put.
  set.index = 0;
  await settle();
  showing().getByRole("radio", { name: "A friend" }).focus();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  await user.keyboard("{ArrowDown}");
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(set.index).toBe(0);

  // A click with no pointer behind it, like a screen reader activating a choice, stays put too.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  showing().getByRole("radio", { name: "A parent" }).click();
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(showing().getByRole("radio", { name: "A parent" }).getAttribute("aria-checked")).toBe("true");
  expect(set.index).toBe(0);

  // The last question waits for Send.
  set.index = 2;
  await settle();
  await user.click(showing().getByRole("radio", { name: "Over £50" }));
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(set.index).toBe(2);
  expect(set.hasAttribute("answered")).toBe(false);
});

test("Send with a question still unanswered goes to it and says so; Skip counts as an answer", async () => {
  const user = userEvent.setup();
  const { set, changes, showing } = await mount();
  set.index = 2;
  await settle();
  await user.click(showing().getByRole("button", { name: "Skip" }));
  await settle();
  expect(changes).toEqual([]);
  expect(set.index).toBe(0);
  expect(part(set, "position").textContent).toBe("1 of 3");
  await vi.waitFor(() => expect(announced()).toContain("Question 1 still needs an answer."));
  expect(set.api.submit()).toBe(false);
});

test("cancelling keeps it asking; disabled locks it", async () => {
  const { set, changes, showing } = await mount((s) => (s.questions = [gift[0]]));
  set.addEventListener("answerschange", (event) => event.preventDefault(), { once: true });
  const question = set.querySelector("ai-question")!;
  question.value = "A friend";
  question.api.submit();
  await settle();
  expect(changes).toHaveLength(1);
  expect(set.answers).toBeNull();
  expect(set.hasAttribute("answered")).toBe(false);
  expect(showing().getByRole("button", { name: "Send answers" })).toBeTruthy();

  set.disabled = true;
  await settle();
  expect(question.hasAttribute("disabled")).toBe(true);
  expect(set.api.submit()).toBe(false);
  expect(changes).toHaveLength(1);
});

test("questions written inside become the slides; one question has no arrows", async () => {
  const { set } = await mount(undefined, `<ai-questions label="About the gift"><ai-question question="Wrap it?"><ul><li>Yes</li><li>No</li></ul></ai-question></ai-questions>`);
  expect(within(document.body).queryByRole("region", { name: "About the gift" })).toBeTruthy();
  expect(set.querySelectorAll("ui-carousel-item > ai-question")).toHaveLength(1);
  expect(set.querySelector("ai-question")!.options).toEqual(["Yes", "No"]);
  expect(part(set, "nav").hidden).toBe(true);
  // Setting `questions` replaces them.
  set.questions = gift;
  await settle();
  expect(set.querySelectorAll("ui-carousel-item > ai-question")).toHaveLength(3);
  expect(part(set, "nav").hidden).toBe(false);
});

test("words can be replaced", async () => {
  const { set, showing } = await mount((s) => {
    s.strings = { waiting: "En attente", position: (i, n) => `${i} sur ${n}`, nextQuestion: "Suivant", send: "Envoyer", previous: "Précédente", label: "Questions du modèle" };
  });
  expect(part(set, "position").textContent).toBe("1 sur 3");
  expect(showing().getByRole("button", { name: "Suivant" })).toBeTruthy();
  expect(within(document.body).queryByRole("region", { name: "Questions du modèle", description: "En attente" })).toBeTruthy();
  expect(within(set).getByRole("button", { name: "Précédente" })).toBeTruthy();
});

test("agents answer each question by its name and send; the set itself stays out of view", async () => {
  const { set, sent, changes } = await mount((s) => (s.questions = [gift[0], gift[2]]));
  const agent = createAgent();
  const snapshot = agent.snapshot();
  expect(snapshot.some((item) => item.component === "questions")).toBe(false);
  expect(snapshot.find((item) => item.label === "Who is it for?")?.component).toBe("radio");
  const result = await agent.act({
    steps: [
      { ref: "Who is it for?", action: "setValue", args: ["A friend"] },
      { ref: "What's your budget?", action: "setValue", args: ["Over £50"] },
      { ref: "Send answers", action: "press" },
    ],
  });
  expect(result.ok, result.error?.message).toBe(true);
  await settle();
  expect(sent()).toEqual([
    [
      { value: "A friend", labels: ["A friend"], other: null },
      { value: "Over £50", labels: ["Over £50"], other: null },
    ],
  ]);
  // The agent's press on the last question's Send carries through to the set's change.
  expect(changes[0]).toMatchObject({ reason: "press", source: "agent" });
  expect(set.hasAttribute("answered")).toBe(true);
});

test("the primitive renders on a server, and its parts come and go with the answers", async () => {
  const markup = "<root><set></set><summary></summary></root>";
  checkServer(questionsPrimitive, { questions: gift }, markup);
  const view = mountPrimitive(questionsPrimitive, { questions: gift }, markup);
  try {
    view.api.setCount(2);
    expect(view.part("set")!.isConnected).toBe(true);
    expect(view.part("summary")!.isConnected).toBe(false);
    expect(view.api.record(0, { value: "A", labels: ["A"], other: null })).toBe("next");
    expect(view.api.submit()).toBe(false);
    expect(view.api.getIndex()).toBe(1);
    expect(view.api.record(1, { skipped: true })).toBe("submit");
    expect(view.api.submit()).toBe(true);
    await view.settle();
    expect(view.changes.at(-1)).toMatchObject({ key: "answers", value: [{ value: "A", labels: ["A"], other: null }, { skipped: true }], reason: "imperative" });
    expect(view.part("set")!.isConnected).toBe(false);
    expect(view.part("summary")!.isConnected).toBe(true);
    expect(view.part("root")!.hasAttribute("answered")).toBe(true);
    expect(view.announced).toContain("Sent 2 answers");
    // Once sent, nothing more is recorded; restoring asks again with null, or shows saved
    // answers, quietly.
    expect(view.api.record(0, { skipped: true })).toBeNull();
    const before = view.changes.length;
    view.api.restore(null);
    await view.settle();
    expect(view.part("set")!.isConnected).toBe(true);
    view.api.restore([{ skipped: true }, { skipped: true }]);
    await view.settle();
    expect(view.part("summary")!.isConnected).toBe(true);
    expect(view.changes).toHaveLength(before);
  } finally {
    view.unmount();
  }
});
