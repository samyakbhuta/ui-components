import { contrastRatio, expect, sidewaysOverflow, test } from "./fixtures";

test.use({ viewport: { width: 1000, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await page.goto("/experiments/ai-composer.html");
});

const idle = (page: import("@playwright/test").Page) =>
  page.waitForFunction(() => {
    const chat = document.querySelector(".sample-chat") as HTMLElement & { busy: boolean; waiting: boolean };
    return !chat.busy && !chat.waiting;
  });

test("a starter sends, and the reply streams in with thinking, a tool call, sources and follow-ups", async ({ page }) => {
  const chat = page.locator("#chat ai-chat");
  await chat.getByRole("button", { name: "What are custom elements?" }).click();
  await idle(page);
  const reply = chat.locator("ai-message:not([from='user'])").last();
  await expect(reply.locator("ai-thinking")).toHaveAttribute("status", "done");
  await expect(reply.locator("ai-tool-call")).toHaveAttribute("status", "done");
  await expect(reply.getByRole("link", { name: "Source 1: Using custom elements" })).toBeVisible();
  await expect(reply.getByRole("list", { name: "Follow-up questions" })).toBeVisible();
  await expect(page.locator("#chat .event-log")).toHaveText('chatchange {"messages": 2 messages}');
  await expect(chat.getByRole("textbox", { name: "Prompt" })).toBeFocused();
});

test("a question waits: the box says how to answer, typing answers it, and the reply carries on", async ({ page }) => {
  const chat = page.locator("#chat ai-chat");
  const prompt = chat.getByRole("textbox", { name: "Prompt" });
  await chat.getByRole("button", { name: "Plan a weekend trip" }).click();
  await expect(chat).toHaveAttribute("waiting", "");
  await expect(chat.locator("ai-question").getByRole("radiogroup")).toHaveAccessibleDescription("Waiting for your answer");
  await expect(prompt).toHaveAttribute("placeholder", "Answer the question above, or type your answer");
  await prompt.fill("lisbon");
  await prompt.press("Enter");
  await idle(page);
  await expect(chat.locator("ai-question [data-part='answer']")).toHaveText("Answered: Lisbon");
  await expect(chat.locator("ai-message:not([from='user'])").last()).toContainText("Lisbon it is.");
  await expect(prompt).toHaveAttribute("placeholder", "Ask anything…");
});

test("an approval waits; Allow once runs the tool, and Always allow isn't asked again", async ({ page }) => {
  const chat = page.locator("#chat ai-chat");
  const prompt = chat.getByRole("textbox", { name: "Prompt" });
  await chat.getByRole("button", { name: "Clean up my build folder" }).click();
  await expect(chat).toHaveAttribute("waiting", "");
  await chat.locator("ai-approval").getByRole("button", { name: "Always allow" }).click();
  await idle(page);
  await expect(chat.locator("ai-message:not([from='user'])").last().locator("ai-tool-call")).toHaveAttribute("status", "done");

  await prompt.fill("Clean up again");
  await prompt.press("Enter");
  await idle(page);
  await expect(chat.locator("ai-approval").last().locator("[data-part='decision']")).toHaveText("Always allowed");
});

test("Stop ends a reply and says so @theme", async ({ page }) => {
  const chat = page.locator("#chat ai-chat");
  await chat.getByRole("button", { name: "What are custom elements?" }).click();
  await chat.getByRole("button", { name: "Stop" }).click();
  await idle(page);
  const stopped = chat.locator("[data-part='stopped']");
  await expect(stopped).toHaveText("Stopped");
  const colours = await stopped.evaluate((element) => {
    const probe = document.body.appendChild(document.createElement("div"));
    probe.style.background = "Canvas";
    const canvas = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { text: getComputedStyle(element).color, canvas };
  });
  expect(contrastRatio(colours.text, colours.canvas)).toBeGreaterThanOrEqual(4.5);
});

test("on a phone, the chat fits without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator("#chat ai-chat").getByRole("button", { name: "What are custom elements?" }).click();
  await idle(page);
  expect(await sidewaysOverflow(page)).toBe(0);
});
