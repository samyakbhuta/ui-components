import type { Page } from "@playwright/test";
import { contrastRatio, expect, sidewaysOverflow, test } from "./fixtures";

// Each recipe in docs/making-ai-chat-your-own.md does what the guide says it does.

const open = (page: Page, recipe: string) => page.goto(`/recipes/ai-chat/${recipe}.html`);
const replies = (page: Page) => page.locator("ai-chat ai-message:not([from='user'])");
const yours = (page: Page) => page.locator("ai-chat ai-message[from='user']");
/** Waits until no reply is coming in. */
const idle = (page: Page) =>
  page.waitForFunction(() => !(document.querySelector("ai-chat") as (HTMLElement & { busy: boolean }) | null)?.busy, null, { timeout: 20_000 });

async function send(page: Page, text: string, box = "Prompt") {
  await page.getByRole("textbox", { name: box }).fill(text);
  await page.getByRole("textbox", { name: box }).press("Enter");
}

test.use({ viewport: { width: 1000, height: 800 } });

test("1. the message box takes files and a model, and the model gets both", async ({ page }) => {
  await open(page, "message-box");
  await expect(page.getByRole("button", { name: "Voice input" })).toBeVisible();
  await page.locator("ai-composer input[type='file']").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Milk, eggs") });
  await page.getByRole("combobox", { name: "Model" }).click();
  await page.getByRole("option", { name: /Careful/ }).click();
  await send(page, "hello");
  await idle(page);
  await expect(replies(page).last()).toContainText("You said: hello");
  await expect(replies(page).last()).toContainText("Model: careful");
  await expect(replies(page).last()).toContainText("Files: notes.txt");
});

test("2. an empty chat shows the welcome, and a starter sends its value", async ({ page }) => {
  await open(page, "welcome");
  const heading = page.getByRole("heading", { name: "What can I help with?" });
  await expect(heading).toBeVisible();
  await page.getByRole("button", { name: "Plan my week" }).click();
  await idle(page);
  await expect(yours(page).last()).toContainText("Help me plan my week. Ask me what I have on.");
  await expect(replies(page).last()).toContainText("You said: Help me plan my week.");
  await expect(heading).toBeHidden();
});

test("3. the chat, the message box and the conversation use the page's own words", async ({ page }) => {
  await open(page, "your-words");
  const box = page.getByRole("textbox", { name: "Your question" });
  await expect(box).toHaveAttribute("placeholder", "Ask about our cakes…");
  await expect(page.getByText("Enter to ask · Shift+Enter for a new line")).toBeVisible();
  await expect(page.getByLabel("Your questions and our answers")).toBeVisible();

  await box.fill("Do you have lemon cake?");
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeEnabled();
  await box.press("Enter");
  await page.getByRole("button", { name: "Stop answering" }).click();
  await idle(page);
  await expect(page.locator("ai-chat [data-part='stopped']")).toHaveText("You stopped this answer.");
});

test("4. the brand colours apply, and Send stays readable @theme", async ({ page }, testInfo) => {
  await open(page, "your-colours");
  await send(page, "hello");
  await idle(page);
  await page.getByRole("textbox", { name: "Prompt" }).fill("again");
  const colours = await page.evaluate(() => {
    const send = getComputedStyle(document.querySelector("ai-composer [data-part='send'] button, ai-composer button[aria-label='Send']")!);
    const bubble = document.querySelector("ai-message[from='user'] [data-part='body']") ?? document.querySelector("ai-message[from='user']")!;
    const chat = getComputedStyle(document.querySelector("ai-chat")!);
    return { send: send.backgroundColor, arrow: send.color, radius: getComputedStyle(document.querySelector("ai-composer")!).getPropertyValue("--ai-composer-radius").trim(), gap: chat.rowGap, bubble: getComputedStyle(bubble).backgroundColor };
  });
  const dark = testInfo.project.name === "dark";
  expect(colours.send).toBe(dark ? "rgb(196, 181, 253)" : "rgb(109, 40, 217)");
  expect(colours.bubble).toBe(dark ? "rgb(46, 16, 101)" : "rgb(237, 233, 254)");
  // The build may write it as ".75rem".
  expect(parseFloat(colours.radius)).toBe(0.75);
  expect(colours.gap).toBe("24px");
  expect(contrastRatio(colours.arrow, colours.send)).toBeGreaterThanOrEqual(4.5);
});

test("5. a reply shows thinking, a finished tool call, linked sources and follow-ups that send", async ({ page }) => {
  await open(page, "richer-replies");
  await send(page, "What are custom elements?");
  await idle(page);
  const reply = replies(page).last();
  await expect(reply.locator("ai-thinking")).toContainText("Thought for");
  await expect(reply.locator("ai-tool-call")).toHaveAttribute("status", "done");
  await expect(reply.locator("ai-tool-call")).toContainText("Found 2 pages");
  await expect(reply.locator("ai-sources").getByRole("link", { name: "Using custom elements" })).toHaveAttribute("href", /developer\.mozilla\.org/);
  // The [1] and [2] in the text link to them.
  await expect(reply.locator("[data-part='body'] a")).toHaveCount(2);

  await page.getByRole("button", { name: "How do I make one?" }).click();
  await expect(yours(page).last()).toContainText("How do I make one?");
});

test("6. the model asks, waits, and goes on with the answer and the decision", async ({ page }) => {
  await open(page, "ask-and-wait");
  await send(page, "Plan a weekend for me");
  const question = page.locator("ai-question").last();
  await expect(question).toBeVisible();
  await expect(page.locator("ai-chat")).toHaveAttribute("waiting", "");
  await question.getByRole("radio", { name: "Rome" }).click();
  await question.getByRole("button", { name: "Send" }).click();

  const approval = page.locator("ai-approval").last();
  await expect(approval).toBeVisible();
  await expect(replies(page).filter({ hasText: "Rome it is." })).toHaveCount(1);
  await approval.getByRole("button", { name: "Allow once" }).click();
  await idle(page);
  await expect(replies(page).last()).toContainText("Booked: two nights in Rome.");

  // Again, with Other and a Deny with a reason.
  await send(page, "Another one");
  await page.locator("ai-question").last().getByRole("textbox", { name: "Your own answer" }).fill("Porto");
  await page.locator("ai-question").last().getByRole("textbox", { name: "Your own answer" }).press("Enter");
  await page.locator("ai-approval").last().getByRole("textbox", { name: "What should it do instead?" }).fill("Find a cheaper one");
  await page.locator("ai-approval").last().getByRole("button", { name: "Deny" }).click();
  await idle(page);
  await expect(replies(page).last()).toContainText("OK, I won't book it. Find a cheaper one");
});

test("7. the conversation survives a reload, and Start over empties it", async ({ page }) => {
  await open(page, "remember");
  await send(page, "Remember this");
  await idle(page);
  await page.reload();
  await expect(yours(page)).toHaveText(["Remember this"].map((text) => new RegExp(text)));
  await expect(replies(page)).toContainText(["You said: Remember this"]);

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.locator("ai-chat ai-message")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
  await expect(page.locator("ai-chat ai-message")).toHaveCount(0);
});

test("8. the sidebar keeps several chats: new, switch, rename and delete, after a reload too", async ({ page }) => {
  await open(page, "sidebar");
  const list = page.locator("ai-chat-list");
  await send(page, "First chat");
  await idle(page);
  await list.getByRole("button", { name: "New chat" }).click();
  await expect(page.locator("ai-chat ai-message")).toHaveCount(0);
  await send(page, "Second chat");
  await idle(page);
  await expect(list.getByRole("button", { name: /^Open (First|Second) chat$/ })).toHaveCount(2);

  await list.getByRole("button", { name: "Open First chat", exact: true }).click();
  await expect(yours(page)).toHaveCount(1);
  await expect(yours(page)).toContainText("First chat");
  await expect(list.getByRole("button", { name: "Open First chat", exact: true })).toHaveAttribute("aria-current", /.+/);

  await list.getByRole("button", { name: "Options for First chat" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await list.getByRole("textbox").fill("Trip ideas");
  await page.keyboard.press("Enter");
  await expect(list.getByRole("button", { name: "Open Trip ideas", exact: true })).toBeVisible();

  await list.getByRole("button", { name: "Options for Second chat" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete forever" }).click();
  await expect(list.getByRole("button", { name: "Open Second chat", exact: true })).toHaveCount(0);

  await page.reload();
  await expect(list.getByRole("button", { name: "Open Trip ideas", exact: true })).toBeVisible();
  await expect(list.getByRole("button", { name: "Open Second chat", exact: true })).toHaveCount(0);
  await list.getByRole("button", { name: "Open Trip ideas", exact: true }).click();
  await expect(replies(page)).toContainText(["You said: First chat"]);
});

test("8. on a phone, the list sits above the chat and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page, "sidebar");
  await send(page, "A chat on a phone with a long first message");
  await idle(page);
  const list = await page.locator("ai-chat-list").boundingBox();
  const chat = await page.locator("ai-chat").boundingBox();
  expect(list!.y + list!.height).toBeLessThanOrEqual(chat!.y);
  expect(await sidewaysOverflow(page)).toBe(0);
});
