import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { checkServer, mount as mountPrimitive, settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, expect, test, vi } from "vitest";
import "./ai-question.ts";
import type { AiQuestionElement, QuestionAnswerDetail } from "./ai-question.ts";
import { question as questionPrimitive } from "./question.ts";

afterEach(() => document.body.replaceChildren());

async function mount(markup: string, setup?: (question: AiQuestionElement) => void) {
  document.body.insertAdjacentHTML("beforeend", markup);
  const question = document.querySelector("ai-question") as AiQuestionElement;
  setup?.(question);
  await settle();
  const answers: QuestionAnswerDetail[] = [];
  question.addEventListener("answerchange", (event) => {
    const answer = event.detail.value;
    if (answer && !("skipped" in answer)) answers.push(answer);
  });
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
  expect(question.api.submit()).toBe(false);

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
  // Read out through ui-sdk's shared live region.
  await vi.waitFor(() => expect([...document.querySelectorAll("[aria-live]")].map((region) => region.textContent).join(" ")).toContain("Answered: Rome"));
  expect(question.querySelector<HTMLElement>("[data-part='status']")!.hidden).toBe(true);
  expect(group.hasAttribute("aria-describedby")).toBe(false);

  // Answered: the choices stay readable, but nothing changes.
  await user.click(view.getByRole("radio", { name: "Paris" }));
  await settle();
  expect(checked(view.getByRole("radio", { name: "Rome" }))).toBe(true);
  expect(checked(view.getByRole("radio", { name: "Paris" }))).toBe(false);
  expect(question.api.submit()).toBe(false);
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

test("cancelling answerchange keeps the question open; Skip sends a skipped answer", async () => {
  const user = userEvent.setup();
  const { question, view } = await mount(`<ai-question question="Where?" skippable><ul><li>Paris</li><li>Rome</li></ul></ai-question>`);
  expect(view.getAllByRole("radio").map((radio) => radio.closest("label")!.textContent)).toEqual(["Paris", "Rome"]);
  question.addEventListener("answerchange", (event) => event.preventDefault(), { once: true });
  question.value = "Paris";
  await settle();
  expect(question.api.submit()).toBe(false);
  expect(question.answer).toBeNull();

  const skipped = vi.fn((event: Event) => (event as CustomEvent).detail);
  question.addEventListener("answerchange", skipped);
  await user.click(view.getByRole("button", { name: "Skip" }));
  expect(skipped).toHaveBeenCalledOnce();
  expect(skipped.mock.results[0].value).toMatchObject({ value: { skipped: true }, reason: "skip-press" });
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

  question.api.reset();
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

test("each answer says what asked for it and how; restoring and reset() report nothing", async () => {
  const user = userEvent.setup();
  const { question, view, send } = await mount(`<ai-question question="Where?" other skippable></ai-question>`, (q) => (q.options = cities));
  const reported: string[] = [];
  question.addEventListener("answerchange", (event) => reported.push(`${event.detail.reason} ${JSON.stringify(event.detail.value)}`));

  question.answer = { value: "Rome", labels: ["Rome"], other: null };
  await settle();
  question.api.reset();
  await settle();
  expect(reported).toEqual([]);

  await user.click(view.getByRole("radio", { name: "Paris" }));
  await user.click(send());
  question.api.reset();
  await settle();
  await user.type(view.getByRole("textbox", { name: "Your own answer" }), "Porto{Enter}");
  await settle();
  // Typing in the box moved focus to the answer line once sent, since the box stays.
  expect(document.activeElement).toBe(question.querySelector("[data-part='answer']"));
  question.api.reset();
  await settle();
  await user.click(view.getByRole("button", { name: "Skip" }));
  expect(reported).toEqual([
    'press {"value":"Paris","labels":["Paris"],"other":null}',
    'enter-key {"value":"Porto","labels":["Porto"],"other":"Porto"}',
    'skip-press {"skipped":true}',
  ]);
});

test("the agent sees the choices by the question's name, once: the question itself stays out of view", async () => {
  await mount(`<ai-question question="Which city?"></ai-question>`, (q) => (q.options = cities));
  const snapshot = createAgent().snapshot();
  expect(snapshot.filter((item) => item.label === "Which city?").map((item) => item.component)).toEqual(["radio"]);
  expect(snapshot.some((item) => item.component === "question")).toBe(false);
});

test("the primitive renders on a server, and its parts come and go with the answer", async () => {
  const markup = "<root><status></status><hint></hint><other><input /></other><actions></actions><answer></answer></root>";
  checkServer(questionPrimitive, { question: "Where?", options: ["Paris", "Rome"] }, markup);
  const view = mountPrimitive(questionPrimitive, { question: "Where?", options: ["Paris", "Rome"], skippable: true }, markup);
  try {
    expect(view.part("status")!.isConnected).toBe(true);
    expect(view.part("hint")!.isConnected).toBe(false);
    expect(view.part("other")!.isConnected).toBe(false);
    expect(view.api.submit()).toBe(false);
    view.api.setValue("Rome");
    expect(view.api.submit()).toBe(true);
    await view.settle();
    expect(view.changes.at(-1)).toMatchObject({ key: "answer", value: { value: "Rome", labels: ["Rome"], other: null }, reason: "imperative" });
    expect(view.part("status")!.isConnected).toBe(false);
    expect(view.part("actions")!.isConnected).toBe(false);
    expect(view.part("answer")!.isConnected).toBe(true);
    expect(view.part("root")!.hasAttribute("answered")).toBe(true);
    expect(view.announced).toContain("Answered: Rome");
  } finally {
    view.unmount();
  }
});
