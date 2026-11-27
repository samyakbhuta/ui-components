import { readFile } from "node:fs/promises";
import { ask, expect, sidewaysOverflow, skipThinking, test, waitForReply } from "./fixtures";

test.use({ viewport: { width: 1200, height: 800 } });

test.beforeEach(async ({ page }) => {
  await page.goto("/experiments/chat-shell.html");
  await skipThinking(page);
});

const heading = (page: import("@playwright/test").Page) => page.locator("h1");
const chatList = (page: import("@playwright/test").Page) => page.locator("ai-chat-list");
const chatTitles = (page: import("@playwright/test").Page) => chatList(page).locator("[data-part='chat']");

test("the first prompt saves the chat, gives it a link and lists it as the current page", async ({ page }) => {
  await expect(heading(page)).toHaveText("New chat");
  await expect(chatList(page).locator("[data-part='empty']")).toHaveText("No chats yet");

  await ask(page, "Write a haiku about web components");
  await expect(page).toHaveURL(/#chat\/.+/);
  await expect(heading(page)).toHaveText("Write a haiku about web components");
  await expect(page).toHaveTitle("Write a haiku about web components · AI chat");
  await expect(chatList(page).getByRole("link", { name: "Write a haiku about web components" })).toHaveAttribute("aria-current", "page");
});

test("New chat empties the conversation, chats list newest first, and long titles don't widen the sidebar", async ({ page }) => {
  await ask(page, "Write a haiku about web components");
  await chatList(page).getByRole("button", { name: "New chat" }).click();
  await expect(page.locator("ai-message")).toHaveCount(0);
  await expect(heading(page)).toHaveText("New chat");

  await ask(page, "A second chat with a very long title that will not fit in the sidebar at all, really");
  await expect(chatTitles(page)).toHaveText([/^A second chat/, "Write a haiku about web components"]);
  const overflow = await page.locator(".chat-sidebar").evaluate((sidebar) => sidebar.scrollWidth - sidebar.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a chat opens again from the list, and Back, Forward and reload work", async ({ page }) => {
  await ask(page, "Write a haiku about web components");
  await chatList(page).getByRole("button", { name: "New chat" }).click();
  await ask(page, "A second chat");

  await chatList(page).getByRole("link", { name: "Write a haiku about web components" }).click();
  await expect(heading(page)).toHaveText("Write a haiku about web components");
  await expect(page.locator("ai-message")).toHaveCount(2);
  await expect(page.locator("ai-message:not([from='user'])")).toContainText("Custom tags bloom");

  await page.goBack();
  await expect(heading(page)).toHaveText("A second chat");
  await page.goForward();
  await expect(heading(page)).toHaveText("Write a haiku about web components");
  await page.reload();
  await expect(heading(page)).toHaveText("Write a haiku about web components");
  await expect(page.locator("ai-message")).toHaveCount(2);
});

test("Export downloads the chat as a Markdown file", async ({ page }) => {
  const exportButton = page.getByRole("button", { name: "Export as Markdown" });
  await expect(exportButton).toBeDisabled();
  await ask(page, "Write a haiku about web components");

  const [file] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
  expect(file.suggestedFilename()).toBe("write-a-haiku-about-web-components.md");
  const markdown = await readFile(await file.path(), "utf8");
  expect(markdown).toMatch(/^# Write a haiku about web components\n/);
  expect(markdown).toContain("**You** · Auto · Sonnet 5.5 · Thinking: Off\n\nWrite a haiku about web components");
  expect(markdown).toContain("**Assistant**\n\nCustom tags bloom —");
});

test("Rename from the keyboard updates the list and the heading, then returns focus", async ({ page }) => {
  await ask(page, "Write a haiku about web components");
  await chatList(page).getByRole("button", { name: "Options for Write a haiku about web components" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const field = chatList(page).getByRole("textbox", { name: "Chat name" });
  await expect(field).toBeFocused();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Haiku");
  await page.keyboard.press("Enter");

  await expect(heading(page)).toHaveText("Haiku");
  const renamed = chatList(page).getByRole("link", { name: "Haiku", exact: true });
  await expect(renamed).toBeVisible();
  await expect(renamed).toBeFocused();
});

test("Delete asks first: Escape keeps the chat, Delete starts a new chat and moves focus", async ({ page }) => {
  await ask(page, "Write a haiku about web components");
  await chatList(page).getByRole("button", { name: "New chat" }).click();
  await ask(page, "Keep this one");
  await chatList(page).getByRole("link", { name: "Write a haiku about web components" }).click();
  await expect(heading(page)).toHaveText("Write a haiku about web components");

  const options = chatList(page).getByRole("button", { name: "Options for Write a haiku about web components" });
  const dialog = page.getByRole("alertdialog");
  await options.click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(dialog).toContainText("Delete “Write a haiku about web components”?");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(chatTitles(page)).toHaveCount(2);

  await options.click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await dialog.getByRole("button", { name: "Delete" }).click();
  await expect(heading(page)).toHaveText("New chat");
  await expect(chatTitles(page)).toHaveText(["Keep this one"]);
  await expect(page).not.toHaveURL(/#chat/);
  await expect(chatList(page).getByRole("link", { name: "Keep this one" })).toBeFocused();
});

test("leaving a chat mid-reply stops the reply and saves it as stopped", async ({ page }) => {
  await page.locator("ai-composer").evaluate((composer) => ((composer as HTMLElement & { thinking: string }).thinking = "high"));
  await page.getByRole("textbox", { name: "Prompt" }).fill("Take your time");
  await page.keyboard.press("Enter");
  await expect(page.locator("ai-thinking")).toBeVisible();

  await chatList(page).getByRole("button", { name: "New chat" }).click();
  await waitForReply(page);
  await expect(page.locator("ai-message")).toHaveCount(0);
  await chatList(page).getByRole("link", { name: "Take your time" }).click();
  await expect(page.locator("ai-message:not([from='user']) .message-meta")).toHaveText("Stopped");
});

test("on a phone the list moves into a drawer, which closes once a chat is chosen", async ({ page }) => {
  await ask(page, "Write a haiku about web components");
  await chatList(page).getByRole("button", { name: "New chat" }).click();

  await page.setViewportSize({ width: 390, height: 760 });
  await expect(page.locator(".chat-sidebar")).toBeHidden();
  const chats = page.getByRole("button", { name: "Chats" });
  await expect(chats).toBeVisible();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);

  await chats.click();
  const drawerList = page.locator(".drawer-sheet ai-chat-list");
  await expect(drawerList.locator("[data-part='chat']")).toHaveText(["Write a haiku about web components"]);
  await drawerList.getByRole("link", { name: "Write a haiku about web components" }).click();
  await expect(heading(page)).toHaveText("Write a haiku about web components");
  await expect(page.locator(".drawer-sheet")).toBeHidden();

  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(page.locator(".chat-sidebar ai-chat-list")).toHaveCount(1);
});
