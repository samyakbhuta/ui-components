import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, expect, test, vi } from "vitest";
import "./ai-notice.ts";
import { type AiNoticeElement, defaultNoticeStrings, type NoticeAction } from "./ai-notice.ts";

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const limitActions: NoticeAction[] = [
  { value: "upgrade", label: "Upgrade plan", href: "https://example.com/pricing", newTab: true, primary: true },
  { value: "smaller-model", label: "Switch to a smaller model" },
  { value: "extra", label: "Use extra credits" },
  { value: "notify", label: "Notify me" },
];

async function mount(markup: string, setup?: (notice: AiNoticeElement) => void) {
  document.body.insertAdjacentHTML("beforeend", markup);
  const notice = document.querySelector("ai-notice") as AiNoticeElement;
  setup?.(notice);
  await settle();
  const actions: string[] = [];
  notice.addEventListener("noticeaction", (event) => actions.push(event.detail.value));
  return { notice, actions, view: within(notice) };
}

test("it's a group named by its heading, with the tone in words, and its message as text", async () => {
  const { notice, view } = await mount(`<ai-notice heading="You've reached your usage limit"></ai-notice>`, (n) => {
    n.text = "<img src=x onerror=alert(1)> Your limit resets soon.";
  });
  expect(within(document.body).getByRole("group", { name: "Warning: You've reached your usage limit" })).toBe(notice);
  const text = notice.querySelector("[data-part='text']")!;
  expect(text.textContent).toBe("<img src=x onerror=alert(1)> Your limit resets soon.");
  expect(notice.querySelector("img")).toBeNull();
  expect(notice.querySelector("[data-part='icon'] svg")).not.toBeNull();
  // No reset time, no actions, not dismissible: just the words.
  expect(notice.querySelector<HTMLElement>("[data-part='resets']")!.hidden).toBe(true);
  expect(view.queryByRole("button")).toBeNull();

  notice.tone = "error";
  expect(within(document.body).getByRole("group", { name: "Error: You've reached your usage limit" })).toBe(notice);
  notice.tone = "info";
  expect(within(document.body).getByRole("group", { name: "Note: You've reached your usage limit" })).toBe(notice);
});

test("text written inside is the message, and it's announced once it appears", async () => {
  const { notice } = await mount(`<ai-notice heading="You're offline">  Check your connection,
    then try again. </ai-notice>`);
  expect(notice.text).toBe("Check your connection, then try again.");
  await new Promise(requestAnimationFrame);
  expect(within(notice).getByRole("status").textContent).toBe("You're offline. Check your connection, then try again.");
});

test("actions are buttons, or links with `href`; the first primary one is marked", async () => {
  const user = userEvent.setup();
  const { notice, actions, view } = await mount(`<ai-notice heading="Limit reached"></ai-notice>`, (n) => (n.actions = limitActions));
  const link = view.getByRole("link", { name: "Upgrade plan (opens in a new tab)" }) as HTMLAnchorElement;
  expect(link.href).toBe("https://example.com/pricing");
  expect(link.target).toBe("_blank");
  expect(link.rel).toBe("noopener noreferrer");
  expect(link.hasAttribute("data-primary")).toBe(true);
  expect(view.getAllByRole("button").map((button) => button.textContent)).toEqual(["Switch to a smaller model", "Use extra credits", "Notify me"]);

  await user.click(view.getByRole("button", { name: "Use extra credits" }));
  expect(actions).toEqual(["extra"]);

  // Cancelling a link's event keeps it from opening.
  notice.addEventListener("noticeaction", (event) => event.preventDefault());
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  link.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(actions).toEqual(["extra", "upgrade"]);

  // Changing the actions, like disabling one once used.
  notice.actions = limitActions.map((action) => (action.value === "notify" ? { ...action, label: "We'll remind you", disabled: true } : action));
  await settle();
  expect(view.getByRole("button", { name: "We'll remind you" }).getAttribute("aria-disabled") ?? String((view.getByRole("button", { name: "We'll remind you" }) as HTMLButtonElement).disabled)).toMatch(/true/);
  expect(notice.act("notify")).toBe(false);
});

test("only safe addresses become links", async () => {
  const { view } = await mount(`<ai-notice heading="Hi"></ai-notice>`, (n) => {
    n.actions = [
      { value: "a", label: "Script", href: "javascript:alert(1)" },
      { value: "b", label: "Data", href: "data:text/html,hi" },
      { value: "c", label: "Settings", href: "/settings#billing" },
      { value: "d", label: "Mail", href: "mailto:help@example.com" },
    ];
  });
  expect(view.getAllByRole("link").map((link) => link.textContent)).toEqual(["Settings", "Mail"]);
  expect(view.getAllByRole("button").map((button) => button.textContent)).toEqual(["Script", "Data"]);
});

test("a reset time counts down, then the notice expires, hides its actions and says so", async () => {
  vi.useFakeTimers({ now: new Date(2026, 10, 28, 14, 0, 0), toFake: ["setTimeout", "clearTimeout", "Date"] });
  const expired = vi.fn();
  document.body.innerHTML = `<div lang="en-GB"><ai-notice heading="Limit reached"></ai-notice></div>`;
  const notice = document.querySelector("ai-notice")!;
  notice.actions = limitActions;
  notice.resetsAt = new Date(2026, 10, 28, 15, 30);
  notice.addEventListener("noticeexpire", expired);
  const resets = notice.querySelector("[data-part='resets']")!;
  expect(resets.textContent).toBe("Resets at 15:30 · in 2 hours");
  expect(notice.getAttribute("aria-describedby")).toContain(resets.id);

  vi.advanceTimersByTime(61 * 60_000);
  expect(resets.textContent).toBe("Resets at 15:30 · in 30 minutes");
  vi.advanceTimersByTime(29 * 60_000 + 1000);
  expect(notice.expired).toBe(true);
  expect(expired).toHaveBeenCalledOnce();
  expect(resets.textContent).toBe("You can carry on now.");
  expect(notice.querySelector<HTMLElement>("[data-part='body'] > [data-part='actions']")!.hidden).toBe(true);

  // A new reset time starts over.
  notice.resetsAt = new Date(2026, 10, 29, 9, 0);
  expect(notice.expired).toBe(false);
  expect(resets.textContent).toMatch(/^Resets on Sun 29 Nov at 0?9:00 · in 18 hours$/);
});

test("dismissible adds Dismiss, which hides it unless cancelled", async () => {
  const user = userEvent.setup();
  const { notice, view } = await mount(`<ai-notice heading="New model available" tone="info" dismissible></ai-notice>`);
  const dismissed = vi.fn((event: Event) => event.preventDefault());
  notice.addEventListener("noticedismiss", dismissed, { once: true });
  await user.click(view.getByRole("button", { name: "Dismiss" }));
  expect(dismissed).toHaveBeenCalledOnce();
  expect(notice.hidden).toBe(false);
  await user.click(view.getByRole("button", { name: "Dismiss" }));
  expect(notice.hidden).toBe(true);
});

test("every word can be translated", async () => {
  vi.useFakeTimers({ now: new Date(2026, 10, 28, 14, 0, 0), toFake: ["setTimeout", "clearTimeout", "Date"] });
  document.body.innerHTML = `<ai-notice heading="Limite atteinte" dismissible></ai-notice>`;
  const notice = document.querySelector("ai-notice")!;
  notice.strings = {
    resets: (at) => `Réinitialisation à ${at.getHours()} h`,
    dismiss: "Fermer",
    newTab: "(nouvel onglet)",
    tone: () => "Attention",
  };
  notice.actions = [{ value: "upgrade", label: "Passer à l'offre supérieure", href: "/prix", newTab: true }];
  notice.resetsAt = new Date(2026, 10, 28, 15, 0);
  const view = within(notice);
  expect(within(document.body).getByRole("group", { name: "Attention: Limite atteinte" })).toBe(notice);
  expect(notice.querySelector("[data-part='resets']")!.textContent).toBe("Réinitialisation à 15 h");
  view.getByRole("button", { name: "Fermer" });
  view.getByRole("link", { name: "Passer à l'offre supérieure (nouvel onglet)" });
  expect(defaultNoticeStrings.expired).toBe("You can carry on now.");
});

test("agents can press its buttons", async () => {
  const { actions } = await mount(`<ai-notice heading="Limit reached"></ai-notice>`, (n) => (n.actions = limitActions));
  const result = await createAgent().act({ steps: [{ ref: "Use extra credits", action: "press" }] });
  expect(result.ok, result.error?.message).toBe(true);
  expect(actions).toEqual(["extra"]);
});
