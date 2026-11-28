import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { checkServer, mount as mountPrimitive, settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, expect, test, vi } from "vitest";
import "./ai-approval.ts";
import type { AiApprovalElement, ApprovalDecisionDetail } from "./ai-approval.ts";
import { approval as approvalPrimitive } from "./approval.ts";

afterEach(() => document.body.replaceChildren());

async function mount(markup: string, setup?: (approval: AiApprovalElement) => void) {
  document.body.insertAdjacentHTML("beforeend", markup);
  const approval = document.querySelector("ai-approval") as AiApprovalElement;
  setup?.(approval);
  await settle();
  const decisions: ApprovalDecisionDetail[] = [];
  approval.addEventListener("decisionchange", (event) => decisions.push(event.detail.value!));
  return { approval, decisions, view: within(approval) };
}

const line = (approval: AiApprovalElement) => approval.querySelector<HTMLElement>("[data-part='decision']")!;
/** What ui-sdk's shared live region says, where `announce` writes for screen readers. */
const announced = () => [...document.querySelectorAll("[aria-live]")].map((region) => region.textContent).join(" ");

test("it's a group named by what it asks, says it's waiting, and shows what it will do as text", async () => {
  const { approval, view } = await mount(`<ai-approval name="run_command" label="Run a command" description="It can change files."></ai-approval>`, (a) => {
    a.input = { command: "rm -rf dist", cwd: "~/app" };
  });
  expect(within(document.body).queryByRole("group", { name: "Run a command", description: "Waiting for your approval" })).toBe(approval);
  expect(approval.querySelector("[data-part='name']")!.textContent).toBe("run_command");
  expect(approval.querySelector("[data-part='description']")!.textContent).toBe("It can change files.");
  const input = approval.querySelector<HTMLElement>("[data-part='input']")!;
  expect(input.textContent).toBe('{\n  "command": "rm -rf dist",\n  "cwd": "~/app"\n}');
  expect(input.getAttribute("aria-label")).toBe("What it will do");
  expect(input.tabIndex).toBe(0);
  // Without `always` and `reason`: just Allow once and Deny.
  expect(view.getAllByRole("button").map((button) => button.textContent)).toEqual(["Allow once", "Deny"]);
  expect(view.queryByRole("textbox")).toBeNull();
});

test("Allow once decides, then shows the decision, moves focus there and announces it", async () => {
  const user = userEvent.setup();
  const { approval, decisions, view } = await mount(`<ai-approval name="send_email"></ai-approval>`);
  expect(within(document.body).queryByRole("group", { name: "Allow send_email?" })).toBe(approval);
  expect(approval.querySelector<HTMLElement>("[data-part='name']")!.hidden).toBe(true);
  await user.click(view.getByRole("button", { name: "Allow once" }));
  await settle();

  expect(decisions).toEqual([{ decision: "allow", reason: null }]);
  expect(approval.decision).toEqual(decisions[0]);
  expect(approval.hasAttribute("decided")).toBe(true);
  expect(approval.hasAttribute("aria-describedby")).toBe(false);
  expect(view.queryByRole("button")).toBeNull();
  expect(line(approval).textContent).toBe("Allowed once");
  expect(line(approval).dataset.decision).toBe("allow");
  expect(document.activeElement).toBe(line(approval));
  await vi.waitFor(() => expect(announced()).toContain("Allowed once"));
  expect(approval.api.decide("deny")).toBe(false);
});

test("Always allow is offered with `always`; decide('always') does nothing without it", async () => {
  const user = userEvent.setup();
  const plain = await mount(`<ai-approval name="search"></ai-approval>`);
  expect(plain.approval.api.decide("always")).toBe(false);
  document.body.replaceChildren();

  const { approval, decisions, view } = await mount(`<ai-approval name="search" always></ai-approval>`);
  await user.click(view.getByRole("button", { name: "Always allow" }));
  expect(decisions).toEqual([{ decision: "always", reason: null }]);
  expect(line(approval).textContent).toBe("Always allowed");
});

test("with `reason`, what's typed goes with Deny, and Enter in the box denies", async () => {
  const user = userEvent.setup();
  const { approval, decisions, view } = await mount(`<ai-approval name="run_command" reason></ai-approval>`);
  const box = view.getByRole("textbox", { name: "What should it do instead?" });
  expect(box.getAttribute("placeholder")).toBe("Optional: tell it what to do instead");
  // Enter in an empty box does nothing.
  await user.type(box, "{Enter}");
  expect(decisions).toEqual([]);
  await user.type(box, "Only delete dist/cache{Enter}");
  await settle();
  expect(decisions).toEqual([{ decision: "deny", reason: "Only delete dist/cache" }]);
  expect(line(approval).textContent).toBe("Denied. Instead, you suggested: “Only delete dist/cache”");
  expect(line(approval).dataset.decision).toBe("deny");
  expect(document.activeElement).toBe(line(approval));
  expect(box.closest<HTMLElement>("[data-part='reason']")!.hidden).toBe(true);
});

test("a reason typed and then Allow once isn't sent; Deny without one is plain", async () => {
  const user = userEvent.setup();
  const { decisions, view } = await mount(`<ai-approval reason></ai-approval>`);
  await user.type(view.getByRole("textbox"), "never mind");
  await user.click(view.getByRole("button", { name: "Allow once" }));
  expect(decisions).toEqual([{ decision: "allow", reason: null }]);
  document.body.replaceChildren();

  const second = await mount(`<ai-approval></ai-approval>`);
  await user.click(second.view.getByRole("button", { name: "Deny" }));
  expect(second.decisions).toEqual([{ decision: "deny", reason: null }]);
  expect(line(second.approval).textContent).toBe("Denied");
});

test("cancelling keeps it asking; a saved decision shows decided; null asks again, without a change event", async () => {
  const { approval, view, decisions } = await mount(`<ai-approval reason></ai-approval>`);
  approval.addEventListener("decisionchange", (event) => event.preventDefault(), { once: true });
  expect(approval.api.decide("allow")).toBe(false);
  expect(approval.decision).toBeNull();
  const reported = decisions.length;

  approval.decision = { decision: "deny", reason: "Use a dry run" };
  await settle();
  expect(line(approval).textContent).toBe("Denied. Instead, you suggested: “Use a dry run”");
  expect(view.queryByRole("textbox")).toBeNull();
  expect(view.queryByRole("button")).toBeNull();

  approval.decision = null;
  await settle();
  expect(approval.hasAttribute("decided")).toBe(false);
  expect(view.getAllByRole("button")).toHaveLength(2);
  // Showing a saved decision isn't a new one, so nothing is reported.
  expect(decisions).toHaveLength(reported);
});

test("disabled locks the buttons", async () => {
  const pressed = vi.fn();
  const { approval, view } = await mount(`<ai-approval disabled></ai-approval>`);
  approval.addEventListener("decisionchange", pressed);
  const allow = view.getByRole("button", { name: "Allow once" });
  expect(allow.matches(":disabled") || allow.getAttribute("aria-disabled") === "true").toBe(true);
  expect(approval.api.decide("allow")).toBe(false);
  expect(pressed).not.toHaveBeenCalled();
});

test("words can be replaced, and the label, name and input are text, never HTML", async () => {
  const { approval, view } = await mount(`<ai-approval always></ai-approval>`, (a) => {
    a.label = '<img src=x onerror="alert(1)">Run';
    a.name = "<b>tool</b>";
    a.input = '<script>alert(1)</script>';
    a.strings = { waiting: "En attente", allow: "Autoriser", always: "Toujours", deny: "Refuser" };
  });
  expect(approval.querySelector("img, b, script")).toBeNull();
  expect(within(document.body).queryByRole("group", { name: '<img src=x onerror="alert(1)">Run', description: "En attente" })).toBe(approval);
  expect(approval.querySelector("[data-part='input']")!.textContent).toBe("<script>alert(1)</script>");
  expect(view.getAllByRole("button").map((button) => button.textContent)).toEqual(["Autoriser", "Toujours", "Refuser"]);
});

test("an agent can't allow on its own: the person is asked first, and Deny needs no one", async () => {
  const { approval, decisions } = await mount(`<ai-approval name="search" always></ai-approval>`);
  const asked: string[] = [];
  let approve = false;
  const agent = createAgent({
    allow: (step) => {
      if (step.confirm) asked.push(step.confirm);
      return !step.confirm || approve;
    },
  });
  const press = (button: string) => agent.act({ steps: [{ ref: button, action: "press" }] });

  expect((await press("Allow once")).ok).toBe(false);
  expect((await press("Always allow")).ok).toBe(false);
  expect(decisions).toEqual([]);
  expect(asked).toEqual(["Allows search to run, this once", "Always allows search, without asking again"]);
  expect(approval.querySelector("[data-part='deny']")!.hasAttribute("data-agent-confirm")).toBe(false);

  approve = true;
  const result = await press("Allow once");
  expect(result.ok, result.error?.message).toBe(true);
  expect(decisions).toEqual([{ decision: "allow", reason: null }]);
});

test("an agent can deny without asking anyone", async () => {
  const { decisions } = await mount(`<ai-approval name="search"></ai-approval>`);
  const result = await createAgent({ allow: (step) => !step.confirm }).act({ steps: [{ ref: "Deny", action: "press" }] });
  expect(result.ok, result.error?.message).toBe(true);
  expect(decisions).toEqual([{ decision: "deny", reason: null }]);
});

test("a change says what asked for it and how, and an agent's deny is reported as the agent's", async () => {
  const user = userEvent.setup();
  const { approval, view } = await mount(`<ai-approval name="search" reason></ai-approval>`);
  const details: { reason: string; source: string }[] = [];
  approval.addEventListener("decisionchange", (event) => details.push({ reason: event.detail.reason, source: event.detail.source }));
  // The button says how it was pressed, and the change passes it on.
  let pressedWith = "";
  approval.querySelector("[data-part='allow']")!.addEventListener("action", (event) => (pressedWith = (event as CustomEvent<{ source: string }>).detail.source));
  await user.click(view.getByRole("button", { name: "Allow once" }));
  expect(pressedWith).not.toBe("");
  expect(details).toEqual([{ reason: "press", source: pressedWith }]);

  approval.decision = null;
  await settle();
  const result = await createAgent().act({ steps: [{ ref: "Allow search?", action: "deny", args: ["Search the docs first"] }] });
  expect(result.ok, result.error?.message).toBe(true);
  expect(details.at(-1)).toEqual({ reason: "imperative", source: "agent" });
  expect(approval.decision).toEqual({ decision: "deny", reason: "Search the docs first" });
});

test("the agent sees the card by its heading, offering only deny", async () => {
  await mount(`<ai-approval name="search" always></ai-approval>`);
  const entry = createAgent()
    .snapshot()
    .find((item) => item.label === "Allow search?")!;
  expect(entry).toMatchObject({ component: "approval", actions: ["deny"], decision: null });
});

test("the primitive renders on a server, and its parts come and go with the decision", async () => {
  const markup = "<root><status></status><heading></heading><actions></actions><decision></decision></root>";
  checkServer(approvalPrimitive, { name: "search" }, markup);
  const view = mountPrimitive(approvalPrimitive, { name: "search" }, markup);
  try {
    const root = view.part("root")!;
    expect(root.getAttribute("role")).toBe("group");
    expect(root.getAttribute("aria-labelledby")).toBe(view.part("heading")!.id);
    expect(root.getAttribute("aria-describedby")).toBe(view.part("status")!.id);
    expect(view.part("decision")!.isConnected).toBe(false);

    expect(view.api.decide("allow")).toBe(true);
    await view.settle();
    expect(view.changes.at(-1)).toMatchObject({ key: "decision", value: { decision: "allow", reason: null }, reason: "imperative" });
    expect(view.part("actions")!.isConnected).toBe(false);
    expect(view.part("status")!.isConnected).toBe(false);
    expect(root.hasAttribute("decided")).toBe(true);
    expect(root.dataset.decision).toBe("allow");
    expect(view.announced).toContain("Allowed once");
  } finally {
    view.unmount();
  }
});
