import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, expect, test, vi } from "vitest";
import "./ai-question.ts";
import type { AiQuestionElement, QuestionAnswerDetail } from "./ai-question.ts";

afterEach(() => document.body.replaceChildren());

async function mount(markup: string, setup?: (question: AiQuestionElement) => void) {
  document.body.insertAdjacentHTML("beforeend", markup);
  const question = document.querySelector("ai-question") as AiQuestionElement;
  setup?.(question);
  await settle();
  const answers: QuestionAnswerDetail[] = [];
  question.addEventListener("questionanswer", (event) => answers.push(event.detail));
  const view = within(question);
  return {
    question,
    answers,
    view,
    send: () => view.getByRole("button", { name: "Send answer" }),
  };
}

const isDisabled = (element: Element) => element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
const checked = (element: Element) => element.getAttribute("aria-checked") === "true";

const cities = ["Paris", "Rome", { value: "lisbon", label: "Lisbon", description: "Cheapest flights" }];

test("one choice: radios named by the question, and Send once one is chosen", async () => {
  const user = userEvent.setup();
  const { question, answers, view, send } = await mount(`<ai-question question="Where should the trip start?"></ai-question>`, (q) => {
    q.options = cities;
  });
  // Until it's answered, it says the agent is waiting, and that describes the choices too.
  const group = view.getByRole("radiogroup", { name: "Where should the trip start?", description: "Waiting for your answer" });
  expect(question.querySelector<HTMLElement>("[data-part='status']")!.hidden).toBe(false);
  expect(within(group).getAllByRole("radio")).toHaveLength(3);
  expect(view.getByRole("radio", { name: "Lisbon", description: "Cheapest flights" })).toBeTruthy();
  expect(isDisabled(send())).toBe(true);
  expect(question.submit()).toBe(false);

  await user.click(view.getByRole("radio", { name: "Rome" }));
  await settle();
  expect(question.value).toBe("Rome");
  expect(isDisabled(send())).toBe(false);
  await user.click(send());
  await settle();

  expect(answers).toEqual([{ value: "Rome", labels: ["Rome"], other: null }]);
  expect(question.answer).toEqual(answers[0]);
  expect(question.hasAttribute("answered")).toBe(true);
  expect(view.queryByRole("button", { name: "Send answer" })).toBeNull();
  const line = question.querySelector<HTMLElement>("[data-part='answer']")!;
  expect(line.textContent).toBe("Answered: Rome");
  expect(document.activeElement).toBe(line);
  expect(view.getByRole("status").textContent).toBe("Answered: Rome");
  expect(question.querySelector<HTMLElement>("[data-part='status']")!.hidden).toBe(true);
  expect(group.hasAttribute("aria-describedby")).toBe(false);

  // Answered: the choices stay readable, but nothing changes.
  await user.click(view.getByRole("radio", { name: "Paris" }));
  await settle();
  expect(checked(view.getByRole("radio", { name: "Rome" }))).toBe(true);
  expect(checked(view.getByRole("radio", { name: "Paris" }))).toBe(false);
  expect(question.submit()).toBe(false);
});

test("Other: typing chooses it, Enter sends it, and an empty box can't be sent", async () => {
  const user = userEvent.setup();
  const { question, answers, view, send } = await mount(`<ai-question question="Where?" other></ai-question>`, (q) => {
    q.options = cities;
  });
  await user.click(view.getByRole("radio", { name: "Other" }));
  await settle();
  expect(isDisabled(send())).toBe(true);

  await user.click(view.getByRole("radio", { name: "Paris" }));
  const box = view.getByRole("textbox", { name: "Your own answer" });
  expect(box.getAttribute("placeholder")).toBe("Type your own answer");
  await user.type(box, "Porto");
  await settle();
  expect(checked(view.getByRole("radio", { name: "Other" }))).toBe(true);
  expect(question.value).toBe("Porto");
  await user.keyboard("{Enter}");
  await settle();
  expect(answers).toEqual([{ value: "Porto", labels: ["Porto"], other: "Porto" }]);
  expect(box.hasAttribute("readonly")).toBe(true);
});

test("several choices: checkboxes, a hint, and max disables the rest", async () => {
  const user = userEvent.setup();
  const { question, answers, view, send } = await mount(`<ai-question question="Which sights?" multiple max="2" other></ai-question>`, (q) => {
    q.options = ["Museums", "Food", "Beaches", "Nightlife"];
  });
  expect(view.getByRole("group", { name: "Which sights?", description: "Waiting for your answer Choose up to 2." })).toBeTruthy();
  await user.click(view.getByRole("checkbox", { name: "Beaches" }));
  await user.click(view.getByRole("checkbox", { name: "Museums" }));
  await settle();
  expect(isDisabled(view.getByRole("checkbox", { name: "Food" }))).toBe(true);
  expect(isDisabled(view.getByRole("textbox", { name: "Your own answer" }))).toBe(true);
  expect(isDisabled(view.getByRole("checkbox", { name: "Beaches" }))).toBe(false);

  await user.click(view.getByRole("checkbox", { name: "Beaches" }));
  await settle();
  expect(isDisabled(view.getByRole("checkbox", { name: "Food" }))).toBe(false);
  await user.type(view.getByRole("textbox", { name: "Your own answer" }), "Hiking");
  await settle();
  expect(question.value).toEqual(["Museums", "Hiking"]);
  await user.click(send());
  // Values follow the order of the choices, with the typed answer last.
  expect(answers).toEqual([{ value: ["Museums", "Hiking"], labels: ["Museums", "Hiking"], other: "Hiking" }]);
  expect(question.querySelector("[data-part='answer']")!.textContent).toBe("Answered: Museums, Hiking");
});

test("cancelling questionanswer keeps the question open; Skip fires questionskip", async () => {
  const user = userEvent.setup();
  const { question, view } = await mount(`<ai-question question="Where?" skippable><ul><li>Paris</li><li>Rome</li></ul></ai-question>`);
  expect(view.getAllByRole("radio").map((radio) => radio.closest("label")!.textContent)).toEqual(["Paris", "Rome"]);
  question.addEventListener("questionanswer", (event) => event.preventDefault(), { once: true });
  question.value = "Paris";
  await settle();
  expect(question.submit()).toBe(false);
  expect(question.answer).toBeNull();

  const skipped = vi.fn();
  question.addEventListener("questionskip", skipped);
  await user.click(view.getByRole("button", { name: "Skip" }));
  expect(skipped).toHaveBeenCalledOnce();
  expect(question.answer).toEqual({ skipped: true });
  expect(question.querySelector("[data-part='answer']")!.textContent).toBe("Skipped");
});

test("a saved answer shows answered, including a typed one, and reset() reopens it", async () => {
  const { question, view } = await mount(`<ai-question question="Where?" other></ai-question>`, (q) => {
    q.options = cities;
    q.answer = { value: "Porto", labels: ["Porto"], other: "Porto" };
  });
  expect(checked(view.getByRole("radio", { name: "Other" }))).toBe(true);
  expect((view.getByRole("textbox", { name: "Your own answer" }) as HTMLInputElement).value).toBe("Porto");
  expect(view.queryByRole("button", { name: "Send answer" })).toBeNull();

  question.reset();
  await settle();
  expect(question.hasAttribute("answered")).toBe(false);
  expect(isDisabled(view.getByRole("button", { name: "Send answer" }))).toBe(false);
});

test("words can be replaced, and the question and choices are text, never HTML", async () => {
  const { view } = await mount(`<ai-question multiple other></ai-question>`, (q) => {
    q.question = '<img src=x onerror="alert(1)">Pick';
    q.options = ['<b onclick="alert(1)">Bold</b>'];
    q.strings = { waiting: "En attente de votre réponse", other: "Autre", send: "Envoyer", multipleHint: () => "Plusieurs choix" };
  });
  expect(document.querySelector("ai-question img, ai-question b")).toBeNull();
  expect(view.getByRole("group", { name: '<img src=x onerror="alert(1)">Pick', description: "En attente de votre réponse Plusieurs choix" })).toBeTruthy();
  expect(view.getByRole("checkbox", { name: '<b onclick="alert(1)">Bold</b>' })).toBeTruthy();
  expect(view.getByRole("checkbox", { name: "Autre" })).toBeTruthy();
  expect(view.getByRole("button", { name: "Envoyer" })).toBeTruthy();
});

test("agents can choose an answer and send it", async () => {
  const { answers } = await mount(`<ai-question question="Where?"></ai-question>`, (q) => {
    q.options = cities;
  });
  const result = await createAgent().act({
    steps: [
      { ref: "Where?", action: "setValue", args: ["Rome"] },
      { ref: "Send answer", action: "press" },
    ],
  });
  expect(result.ok, result.error?.message).toBe(true);
  expect(answers).toEqual([{ value: "Rome", labels: ["Rome"], other: null }]);
});
