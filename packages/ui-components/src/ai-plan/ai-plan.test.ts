import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, expect, test, vi } from "vitest";
import "./ai-plan.ts";
import type { AiPlanElement, PlanDecisionDetail } from "./ai-plan.ts";

afterEach(() => document.body.replaceChildren());

const plan = "## Steps\n\n1. Read the build config.\n2. Delete `dist/`.\n\n```sh\nrm -rf dist\n```";

async function mount(markup: string, setup?: (card: AiPlanElement) => void) {
  document.body.insertAdjacentHTML("beforeend", markup);
  const card = document.querySelector("ai-plan") as AiPlanElement;
  setup?.(card);
  await settle();
  const decisions: PlanDecisionDetail[] = [];
  card.addEventListener("plandecision", (event) => decisions.push(event.detail));
  return { card, decisions, view: within(card) };
}

const line = (card: AiPlanElement) => card.querySelector<HTMLElement>("[data-part='decision']")!;
const part = (card: AiPlanElement, name: string) => card.querySelector<HTMLElement>(`[data-part='${name}']`)!;

test("it's a group named by its heading, says it's waiting, and opens the plan in place", async () => {
  const user = userEvent.setup();
  const { card, view } = await mount(`<ai-plan heading="Clean up the build" summary="Three steps, one deletes files."></ai-plan>`, (c) => {
    c.plan = plan;
  });
  expect(within(document.body).queryByRole("group", { name: "Clean up the build", description: "Waiting for your review" })).toBe(card);
  expect(part(card, "summary").textContent).toBe("Three steps, one deletes files.");
  const open = view.getByRole("button", { name: "Open plan" });
  expect(open.getAttribute("aria-expanded")).toBe("false");
  expect(part(card, "plan").hidden).toBe(true);

  await user.click(open);
  expect(card.open).toBe(true);
  expect(open.getAttribute("aria-expanded")).toBe("true");
  expect(open.textContent).toBe("Close plan");
  expect(part(card, "plan").hidden).toBe(false);
  expect(view.getByRole("heading", { name: "Steps" })).toBeTruthy();
  expect(part(card, "plan").querySelector("pre")!.textContent).toContain("rm -rf dist");
  // Code blocks keep no Copy button: only <ai-message> handles those.
  expect(part(card, "plan").querySelector("[data-part='code-copy']")).toBeNull();
  // Reject, Revise…, then Accept.
  expect(view.getAllByRole("button").map((button) => button.textContent)).toEqual(["Close plan", "Reject", "Revise…", "Accept"]);
});

test("with href, Open plan is a link to the app's page instead", async () => {
  const { view, card } = await mount(`<ai-plan href="/plans/42"></ai-plan>`, (c) => (c.plan = plan));
  expect(view.getByRole("link", { name: "Open plan" }).getAttribute("href")).toBe("/plans/42");
  expect(view.queryByRole("button", { name: "Open plan" })).toBeNull();
  card.open = true;
  await settle();
  expect(part(card, "plan").hidden).toBe(true);
});

test("Accept decides, shows the decision, moves focus there and announces it", async () => {
  const user = userEvent.setup();
  const { card, decisions, view } = await mount(`<ai-plan></ai-plan>`, (c) => (c.plan = plan));
  expect(within(document.body).queryByRole("group", { name: "Proposed plan" })).toBe(card);
  await user.click(view.getByRole("button", { name: "Accept" }));
  expect(decisions).toEqual([{ decision: "accept", mode: null, feedback: null }]);
  expect(card.hasAttribute("decided")).toBe(true);
  expect(line(card).textContent).toBe("Accepted");
  expect(line(card).dataset.decision).toBe("accept");
  expect(document.activeElement).toBe(line(card));
  expect(view.getByRole("status").textContent).toBe("Accepted");
  // The plan can still be opened, but nothing can be decided again.
  expect(view.queryByRole("button", { name: "Reject" })).toBeNull();
  expect(view.getByRole("button", { name: "Open plan" })).toBeTruthy();
  expect(card.decide("reject")).toBe(false);
});

test("accepts adds Accept-and-use buttons; the mode comes back with the decision", async () => {
  const user = userEvent.setup();
  const { card, decisions, view } = await mount(`<ai-plan></ai-plan>`, (c) => {
    c.accepts = [
      { value: "auto", label: "auto mode" },
      { value: "edits", label: "accept-edits mode" },
    ];
  });
  expect(card.hasAttribute("data-accept-with")).toBe(true);
  expect(view.getAllByRole("button").map((button) => button.textContent)).toEqual([
    "Reject",
    "Revise…",
    "Accept",
    "Accept and use auto mode",
    "Accept and use accept-edits mode",
  ]);
  // A mode that isn't offered does nothing.
  expect(card.decide("accept", { mode: "yolo" })).toBe(false);
  await user.click(view.getByRole("button", { name: "Accept and use auto mode" }));
  expect(decisions).toEqual([{ decision: "accept", mode: "auto", feedback: null }]);
  expect(line(card).textContent).toBe("Accepted, using auto mode");
});

test("Revise… opens a box; Enter sends what to change, Escape and Cancel close it", async () => {
  const user = userEvent.setup();
  const { card, decisions, view } = await mount(`<ai-plan></ai-plan>`);
  await user.click(view.getByRole("button", { name: "Revise…" }));
  const box = view.getByRole("textbox", { name: "What should change?" });
  expect(document.activeElement).toBe(box);
  expect(part(card, "actions").hidden).toBe(true);
  expect(view.getByRole("button", { name: "Send changes" }).matches(":disabled") || part(card, "send").hasAttribute("disabled")).toBe(true);

  await user.keyboard("{Escape}");
  expect(part(card, "revise").hidden).toBe(true);
  expect(document.activeElement).toBe(view.getByRole("button", { name: "Revise…" }));

  await user.click(view.getByRole("button", { name: "Revise…" }));
  await user.keyboard("{Enter}");
  expect(decisions).toEqual([]);
  await user.keyboard("Keep dist/cache{Enter}");
  expect(decisions).toEqual([{ decision: "revise", mode: null, feedback: "Keep dist/cache" }]);
  expect(line(card).textContent).toBe("Asked for changes: “Keep dist/cache”");
  expect(part(card, "revise").hidden).toBe(true);
});

test("Reject decides; cancelling keeps it asking; a saved decision shows; null asks again", async () => {
  const user = userEvent.setup();
  const { card, decisions, view } = await mount(`<ai-plan></ai-plan>`);
  card.addEventListener("plandecision", (event) => event.preventDefault(), { once: true });
  expect(card.decide("accept")).toBe(false);
  expect(card.decision).toBeNull();
  await user.click(view.getByRole("button", { name: "Reject" }));
  expect(decisions.at(-1)).toEqual({ decision: "reject", mode: null, feedback: null });
  expect(line(card).textContent).toBe("Rejected");

  card.decision = { decision: "revise", mode: null, feedback: "Smaller steps" };
  await settle();
  expect(line(card).textContent).toBe("Asked for changes: “Smaller steps”");
  card.decision = null;
  await settle();
  expect(card.hasAttribute("decided")).toBe(false);
  expect(view.getByRole("button", { name: "Accept" })).toBeTruthy();
});

test("disabled locks the buttons", async () => {
  const pressed = vi.fn();
  const { card, view } = await mount(`<ai-plan disabled></ai-plan>`);
  card.addEventListener("plandecision", pressed);
  const accept = view.getByRole("button", { name: "Accept" });
  expect(accept.matches(":disabled") || accept.getAttribute("aria-disabled") === "true").toBe(true);
  expect(card.decide("accept")).toBe(false);
  expect(pressed).not.toHaveBeenCalled();
});

test("words can be replaced, and the heading, summary and plan are text, never HTML", async () => {
  const { card, view } = await mount(`<ai-plan></ai-plan>`, (c) => {
    c.heading = '<img src=x onerror="alert(1)">Plan';
    c.summary = "<b>bold</b>";
    c.plan = '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">';
    c.accepts = [{ value: "auto", label: "mode auto" }];
    c.strings = { waiting: "En attente", accept: "Accepter", reject: "Refuser", revise: "Modifier…", acceptWith: (label) => `Accepter en ${label}` };
  });
  card.open = true;
  await settle();
  expect(card.querySelector("img, b, script")).toBeNull();
  expect(within(document.body).queryByRole("group", { name: '<img src=x onerror="alert(1)">Plan', description: "En attente" })).toBe(card);
  expect(view.getAllByRole("button").map((button) => button.textContent)).toEqual(["Close plan", "Refuser", "Modifier…", "Accepter", "Accepter en mode auto"]);
});

test("an agent can't accept on its own: the person is asked first", async () => {
  const { decisions } = await mount(`<ai-plan></ai-plan>`, (element) => {
    element.accepts = [{ value: "auto", label: "auto mode" }];
  });
  const asked: string[] = [];
  let approve = false;
  const agent = createAgent({
    allow: (step) => {
      if (step.confirm) asked.push(step.confirm);
      return !step.confirm || approve;
    },
  });
  const press = (button: string) => agent.act({ steps: [{ ref: button, action: "press" }] });

  expect((await press("Accept and use auto mode")).ok).toBe(false);
  expect(decisions).toEqual([]);
  expect(asked).toEqual(["Accepts the plan and switches to auto mode, so the agent goes ahead with it"]);

  approve = true;
  const result = await press("Accept and use auto mode");
  expect(result.ok, result.error?.message).toBe(true);
  expect(decisions).toEqual([{ decision: "accept", mode: "auto", feedback: null }]);
});

test("Accept, Reject and sending changes all ask the person; Revise… only opens the box, so it doesn't", async () => {
  const { decisions } = await mount(`<ai-plan></ai-plan>`);
  const asked: string[] = [];
  let approve = false;
  const agent = createAgent({
    allow: (step) => {
      if (step.confirm) asked.push(step.confirm);
      return !step.confirm || approve;
    },
  });
  expect((await agent.act({ steps: [{ ref: "Accept", action: "press" }] })).ok).toBe(false);
  expect((await agent.act({ steps: [{ ref: "Reject", action: "press" }] })).ok).toBe(false);
  const opened = await agent.act({ steps: [{ ref: "Revise…", action: "press" }] });
  expect(opened.ok, opened.error?.message).toBe(true);
  await settle();
  const revise = () =>
    agent.act({
      steps: [
        { ref: "What should change?", action: "setValue", args: ["Keep the cache"] },
        { ref: "Send changes", action: "press" },
      ],
    });
  expect((await revise()).ok).toBe(false);
  expect(decisions).toEqual([]);
  expect(asked).toEqual(["Accepts the plan, so the agent goes ahead with it", "Rejects the plan, so the agent stops", "Asks for changes to the plan: “Keep the cache”"]);

  approve = true;
  const result = await revise();
  expect(result.ok, result.error?.message).toBe(true);
  expect(decisions).toEqual([{ decision: "revise", mode: null, feedback: "Keep the cache" }]);
});

test("an app can let agents reject alone, by emptying its confirm sentence", async () => {
  const { decisions } = await mount(`<ai-plan></ai-plan>`, (element) => {
    element.strings = { rejectConfirm: "" };
  });
  const result = await createAgent({ allow: (step) => !step.confirm }).act({ steps: [{ ref: "Reject", action: "press" }] });
  expect(result.ok, result.error?.message).toBe(true);
  expect(decisions).toEqual([{ decision: "reject", mode: null, feedback: null }]);
});
