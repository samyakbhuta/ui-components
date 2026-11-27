import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, expect, test, vi } from "vitest";
import "./ai-approval.ts";
import type { AiApprovalElement, ApprovalDecisionDetail } from "./ai-approval.ts";

afterEach(() => document.body.replaceChildren());

async function mount(markup: string, setup?: (approval: AiApprovalElement) => void) {
  document.body.insertAdjacentHTML("beforeend", markup);
  const approval = document.querySelector("ai-approval") as AiApprovalElement;
  setup?.(approval);
  await settle();
  const decisions: ApprovalDecisionDetail[] = [];
  approval.addEventListener("approvaldecision", (event) => decisions.push(event.detail));
  return { approval, decisions, view: within(approval) };
}

const line = (approval: AiApprovalElement) => approval.querySelector<HTMLElement>("[data-part='decision']")!;

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
  expect(view.getByRole("status").textContent).toBe("Allowed once");
  expect(approval.decide("deny")).toBe(false);
});

test("Always allow is offered with `always`; decide('always') does nothing without it", async () => {
  const user = userEvent.setup();
  const plain = await mount(`<ai-approval name="search"></ai-approval>`);
  expect(plain.approval.decide("always")).toBe(false);
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

test("cancelling keeps it asking; a saved decision shows decided; null asks again", async () => {
  const { approval, view } = await mount(`<ai-approval reason></ai-approval>`);
  approval.addEventListener("approvaldecision", (event) => event.preventDefault(), { once: true });
  expect(approval.decide("allow")).toBe(false);
  expect(approval.decision).toBeNull();

  approval.decision = { decision: "deny", reason: "Use a dry run" };
  await settle();
  expect(line(approval).textContent).toBe("Denied. Instead, you suggested: “Use a dry run”");
  expect(view.queryByRole("textbox")).toBeNull();
  expect(view.queryByRole("button")).toBeNull();

  approval.decision = null;
  await settle();
  expect(approval.hasAttribute("decided")).toBe(false);
  expect(view.getAllByRole("button")).toHaveLength(2);
});

test("disabled locks the buttons", async () => {
  const pressed = vi.fn();
  const { approval, view } = await mount(`<ai-approval disabled></ai-approval>`);
  approval.addEventListener("approvaldecision", pressed);
  const allow = view.getByRole("button", { name: "Allow once" });
  expect(allow.matches(":disabled") || allow.getAttribute("aria-disabled") === "true").toBe(true);
  expect(approval.decide("allow")).toBe(false);
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

test("agents can press Allow once", async () => {
  const { decisions } = await mount(`<ai-approval name="search"></ai-approval>`);
  const result = await createAgent().act({ steps: [{ ref: "Allow once", action: "press" }] });
  expect(result.ok, result.error?.message).toBe(true);
  expect(decisions).toEqual([{ decision: "allow", reason: null }]);
});
