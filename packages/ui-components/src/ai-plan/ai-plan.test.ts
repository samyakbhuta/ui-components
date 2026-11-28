import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { checkServer, mount as mountPrimitive, settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, expect, test, vi } from "vitest";
import "./ai-plan.ts";
import type { AiPlanElement, PlanDecisionDetail } from "./ai-plan.ts";
import { plan as planPrimitive } from "./plan.ts";

afterEach(() => document.body.replaceChildren());

const plan = "## Steps\n\n1. Read the build config.\n2. Delete `dist/`.\n\n```sh\nrm -rf dist\n```";

async function mount(markup: string, setup?: (card: AiPlanElement) => void) {
  document.body.insertAdjacentHTML("beforeend", markup);
  const card = document.querySelector("ai-plan") as AiPlanElement;
  setup?.(card);
  await settle();
  const decisions: PlanDecisionDetail[] = [];
  card.addEventListener("decisionchange", (event) => decisions.push(event.detail.value!));
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
  await vi.waitFor(() => expect([...document.querySelectorAll("[aria-live]")].map((region) => region.textContent).join(" ")).toContain("Accepted"));
  // The plan can still be opened, but nothing can be decided again.
  expect(view.queryByRole("button", { name: "Reject" })).toBeNull();
  expect(view.getByRole("button", { name: "Open plan" })).toBeTruthy();
  expect(card.api.decide("reject")).toBe(false);
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
  expect(card.api.decide("accept", { mode: "yolo" })).toBe(false);
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
  card.addEventListener("decisionchange", (event) => event.preventDefault(), { once: true });
  expect(card.api.decide("accept")).toBe(false);
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
  card.addEventListener("decisionchange", pressed);
  const accept = view.getByRole("button", { name: "Accept" });
  expect(accept.matches(":disabled") || accept.getAttribute("aria-disabled") === "true").toBe(true);
  expect(card.api.decide("accept")).toBe(false);
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

test("each change says what asked for it and how; setting `open` or `decision` reports nothing", async () => {
  const user = userEvent.setup();
  const { card, view } = await mount(`<ai-plan></ai-plan>`, (c) => (c.plan = plan));
  const reported: string[] = [];
  card.addEventListener("openchange", (event) => reported.push(`open ${event.detail.value} ${event.detail.reason}`));
  card.addEventListener("decisionchange", (event) => reported.push(`decision ${event.detail.value?.decision} ${event.detail.reason}`));

  await user.click(view.getByRole("button", { name: "Open plan" }));
  card.open = false;
  await settle();
  expect(view.getByRole("button", { name: "Open plan" }).getAttribute("aria-expanded")).toBe("false");
  card.decision = { decision: "reject", mode: null, feedback: null };
  card.decision = null;
  await settle();
  await user.click(view.getByRole("button", { name: "Revise…" }));
  await user.keyboard("Keep the cache{Enter}");
  expect(reported).toEqual(["open true trigger-press", "decision revise enter-key"]);
});

test("cancelling openchange keeps the plan closed", async () => {
  const user = userEvent.setup();
  const { card, view } = await mount(`<ai-plan></ai-plan>`, (c) => (c.plan = plan));
  card.addEventListener("openchange", (event) => event.preventDefault());
  await user.click(view.getByRole("button", { name: "Open plan" }));
  await settle();
  expect(card.open).toBe(false);
  expect(part(card, "plan").hidden).toBe(true);
});

test("the agent sees the card by its heading, with its state and no actions of its own; Open plan is a Collapsible it can open", async () => {
  const { decisions } = await mount(`<ai-plan heading="Clean up"></ai-plan>`, (c) => (c.plan = plan));
  const agent = createAgent({ allow: (step) => !step.confirm });
  const snapshot = agent.snapshot();
  // `press` is the bridge's own, for a button inside by its text, and the button's mark still applies.
  expect(snapshot.find((item) => item.label === "Clean up")).toMatchObject({ component: "plan", actions: ["press"], decision: null, open: false });
  expect((await agent.act({ steps: [{ ref: "Clean up", action: "press", args: ["Reject"] }] })).ok).toBe(false);
  expect(decisions).toEqual([]);
  const opener = snapshot.find((item) => item.component === "collapsible")!;
  expect(opener.label).toBe("Open plan");
  const result = await agent.act({ steps: [{ ref: opener.ref, action: "setOpen", args: [true] }] });
  expect(result.ok, result.error?.message).toBe(true);
  expect(document.querySelector("ai-plan")!.open).toBe(true);
});

test("the primitive renders on a server, and its parts come and go as people revise and decide", async () => {
  const markup = "<root><status></status><heading></heading><revise><input /></revise><actions></actions><decision></decision></root>";
  checkServer(planPrimitive, { heading: "Clean up" }, markup);
  const view = mountPrimitive(planPrimitive, { heading: "Clean up" }, markup);
  try {
    const root = view.part("root")!;
    expect(root.getAttribute("role")).toBe("group");
    expect(root.getAttribute("aria-labelledby")).toBe(view.part("heading")!.id);
    expect(root.getAttribute("aria-describedby")).toBe(view.part("status")!.id);
    expect(view.part("revise")!.isConnected).toBe(false);

    expect(view.api.startRevising()).toBe(true);
    await view.settle();
    expect(view.part("revise")!.isConnected).toBe(true);
    expect(view.part("actions")!.isConnected).toBe(false);
    // Nothing typed: there's nothing to send.
    expect(view.api.decide("revise")).toBe(false);

    view.api.setFeedbackText("Keep the cache");
    expect(view.api.decide("revise")).toBe(true);
    await view.settle();
    expect(view.changes.at(-1)).toMatchObject({ key: "decision", value: { decision: "revise", mode: null, feedback: "Keep the cache" }, reason: "imperative" });
    expect(view.part("revise")!.isConnected).toBe(false);
    expect(view.part("decision")!.isConnected).toBe(true);
    expect(root.hasAttribute("decided")).toBe(true);
    expect(view.announced).toContain("Asked for changes: “Keep the cache”");
  } finally {
    view.unmount();
  }
});
