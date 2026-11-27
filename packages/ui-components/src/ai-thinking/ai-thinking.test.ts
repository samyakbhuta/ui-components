import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AiThinkingElement } from "./ai-thinking.ts";
import "./ai-thinking.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function mount(html = "<ai-thinking></ai-thinking>") {
  document.body.insertAdjacentHTML("beforeend", html);
  const thinking = document.body.lastElementChild as AiThinkingElement;
  return {
    thinking,
    label: () => thinking.querySelector("[data-part='label']")!,
    time: () => thinking.querySelector("[data-part='time']")!.textContent,
    announced: () => thinking.querySelector("[role='status']")!.textContent,
  };
}

test("it shimmers \"Thinking…\" and announces the start once", () => {
  const { thinking, label, announced } = mount();

  expect(label().textContent).toBe("Thinking…");
  expect(label().hasAttribute("data-shimmer")).toBe(true);
  expect(thinking.hasAttribute("data-thinking")).toBe(true);
  expect(thinking.querySelector("details")).toBeNull();
  expect(announced()).toBe("");
  vi.advanceTimersByTime(100);
  expect(announced()).toBe("Thinking");

  // Changing the label updates the text without announcing every step.
  thinking.label = "Searching files…";
  expect(label().textContent).toBe("Searching files…");
  expect(announced()).toBe("Thinking");
});

test("done() stops the shimmer and leaves a summary that is announced", () => {
  const { thinking, label, announced } = mount();
  thinking.done();

  expect(thinking.status).toBe("done");
  expect(label().textContent).toBe("Thought");
  expect(label().hasAttribute("data-shimmer")).toBe(false);
  expect(thinking.hasAttribute("data-done")).toBe(true);
  expect(announced()).toBe("Thought");
});

test("with timer it counts the seconds and ends with \"Thought for Ns\"", () => {
  const { thinking, label, time } = mount("<ai-thinking timer></ai-thinking>");

  expect(time()).toBe("0s");
  vi.advanceTimersByTime(12_000);
  expect(time()).toBe("12s");
  vi.advanceTimersByTime(60_000);
  expect(time()).toBe("1m 12s");

  thinking.status = "done";
  expect(label().textContent).toBe("Thought for 1m 12s");
  expect(time()).toBe("");
  vi.advanceTimersByTime(5_000);
  expect(label().textContent).toBe("Thought for 1m 12s");
  expect(thinking.elapsed).toBe(72_000);
});

test("reasoning opens from the summary and can stream in", () => {
  const { thinking } = mount("<ai-thinking>Reading the question.</ai-thinking>");
  const details = () => thinking.querySelector("details")!;

  expect(details().querySelector("summary")!.textContent).toContain("Thinking…");
  expect(details().open).toBe(false);
  expect(thinking.reasoning).toBe("Reading the question.");

  details().open = true;
  thinking.reasoning = "Reading the question. Checking the files.";
  expect(details().open).toBe(true);
  expect(thinking.querySelector("[data-part='reasoning']")!.textContent).toBe("Reading the question. Checking the files.");

  const plain = mount().thinking;
  plain.reasoning = "Now there is some.";
  expect(plain.querySelector("details summary")).not.toBeNull();
});

test("every word can be replaced, and restart() starts over", () => {
  const { thinking, label, announced } = mount("<ai-thinking timer></ai-thinking>");
  thinking.strings = {
    thinking: "Réflexion…",
    startAnnouncement: "Réflexion en cours",
    thoughtFor: (duration) => `A réfléchi ${duration}`,
  };
  vi.advanceTimersByTime(3_000);
  expect(label().textContent).toBe("Réflexion…");
  thinking.done();
  expect(label().textContent).toBe("A réfléchi 3s");

  thinking.restart();
  expect(thinking.status).toBe("thinking");
  expect(thinking.elapsed).toBe(0);
  vi.advanceTimersByTime(100);
  expect(announced()).toBe("Réflexion en cours");
});

test("a saved summary shows again with duration, without announcing", () => {
  const { thinking, label, announced } = mount('<ai-thinking status="done" timer duration="42">Checked the files.</ai-thinking>');
  expect(label().textContent).toBe("Thought for 42s");
  expect(label().hasAttribute("data-shimmer")).toBe(false);
  expect(thinking.reasoning).toBe("Checked the files.");
  vi.advanceTimersByTime(1000);
  expect(announced()).toBe("");

  thinking.duration = 75;
  expect(label().textContent).toBe("Thought for 1m 15s");
});
