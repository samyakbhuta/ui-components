import type { Page } from "@playwright/test";
import { ask, contrastRatio, expect, skipThinking, test, waitForReply } from "./fixtures";

// Short, so a reply with a card doesn't fit and there's somewhere to scroll.
test.use({ viewport: { width: 1000, height: 560 } });

const transcript = (page: Page) => page.locator("ai-transcript");
const jump = (page: Page) => transcript(page).locator("[data-part='jump']");

/** Asks for a card after two earlier replies, so scrolling to the top takes the card fully out of view. */
async function askAfterOthers(page: Page, prompt: string) {
  await ask(page, "Write a haiku about web components");
  await ask(page, "Write another haiku about web components");
  await ask(page, prompt);
}

/** Scrolls the conversation to the top, as a person would. */
async function scrollUp(page: Page) {
  await transcript(page).hover();
  await page.mouse.wheel(0, -5000);
}

test.describe("in the chat shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/chat-shell.html");
    await skipThinking(page);
  });

  test("scrolled up while a question waits, the jump button says so, and takes you to the first choice", async ({ page }) => {
    await askAfterOthers(page, "Plan a weekend trip for me");
    await expect(jump(page)).toBeHidden();

    await scrollUp(page);
    await expect(jump(page)).toHaveText("Waiting for your answer");
    await expect(jump(page)).toHaveAttribute("data-waiting", "");

    await jump(page).click();
    await expect(page.locator("ai-question").getByRole("radio").first()).toBeFocused();
    // The whole reply shows, down to its time and buttons, and the pill goes.
    const reply = page.locator("ai-message:not([from='user'])").last();
    await expect(reply.locator(":scope > [data-part='actions']")).toBeInViewport();
    await expect(reply.locator(":scope > [data-part='meta']")).toBeInViewport();
    await expect(jump(page)).toBeHidden();

    // Answered, the button goes back to Jump to latest.
    await page.keyboard.press("Space");
    await page.locator("ai-question:not([answered])").getByRole("button", { name: "Send" }).click();
    await waitForReply(page);
    await page.getByRole("checkbox", { name: "Food" }).click();
    await page.locator("ai-question:not([answered])").getByRole("button", { name: "Send" }).click();
    await waitForReply(page);
    await scrollUp(page);
    await expect(jump(page)).toHaveText("Jump to latest");
    await expect(jump(page)).not.toHaveAttribute("data-waiting", "");
  });

  test("an approval waiting below says so, and the pill is readable @theme", async ({ page }) => {
    await askAfterOthers(page, "Clean up my project's build folder");
    await scrollUp(page);
    await expect(jump(page)).toHaveText("Waiting for your approval");
    await page.mouse.move(0, 0);
    const colours = await jump(page).evaluate((button) => ({ text: getComputedStyle(button).color, background: getComputedStyle(button).backgroundColor }));
    expect(contrastRatio(colours.text, colours.background)).toBeGreaterThanOrEqual(4.5);

    await jump(page).click();
    await expect(page.locator("ai-approval").getByRole("button").first()).toBeFocused();
  });

  test("while any of the card shows, the pill doesn't repeat it", async ({ page }) => {
    await askAfterOthers(page, "Clean up my project's build folder");
    // Scroll so only the top of the card shows, above the bottom edge.
    await transcript(page).evaluate((element) => {
      const card = element.querySelector("ai-approval")!;
      element.scrollTop += card.getBoundingClientRect().top - element.getBoundingClientRect().bottom + 60;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect(page.locator("ai-approval")).toBeInViewport();
    await expect(jump(page)).toHaveText("Jump to latest");
    await expect(jump(page)).not.toHaveAttribute("data-waiting", "");

    // Scrolled a little further up, so none of it shows, the pill says it waits.
    await transcript(page).evaluate((element) => {
      element.scrollTop -= 120;
      element.dispatchEvent(new Event("scroll"));
    });
    await expect(jump(page)).toHaveText("Waiting for your approval");
  });

  test("by keyboard, Enter on the pill moves focus into the card", async ({ page }) => {
    await askAfterOthers(page, "Clean up my project's build folder");
    await scrollUp(page);
    await expect(jump(page)).toHaveText("Waiting for your approval");
    await jump(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("ai-approval").getByRole("button").first()).toBeFocused();
  });
});

test("in <ai-chat>, a plan waiting below says so @theme", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/experiments/ai-composer.html");
  const chat = page.locator("#chat ai-chat");
  // An earlier reply first, so the plan can be fully out of view.
  await chat.getByRole("button", { name: "What are custom elements?" }).click();
  await expect(chat.locator("ai-composer")).not.toHaveAttribute("busy", { timeout: 20_000 });
  await chat.getByRole("textbox", { name: "Prompt" }).fill("Plan a surprise birthday party");
  await page.keyboard.press("Enter");
  await expect(chat.locator("ai-plan")).toBeVisible({ timeout: 20_000 });
  await expect(chat).not.toHaveAttribute("busy", "", { timeout: 20_000 });
  // Shorter, so the plan doesn't fit once scrolled to the top.
  await chat.evaluate((element) => (element.style.height = "18rem"));
  await chat.locator("ai-transcript").evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event("scroll"));
  });
  const pill = chat.locator("ai-transcript [data-part='jump']");
  await expect(pill).toHaveText("Waiting for your review");
  // With Reduce motion on, the dot keeps still.
  await expect(pill.locator("[data-part='jump-dot']")).toHaveCSS("animation-name", "none");
  await pill.click();
  await expect(chat.locator("ai-plan").getByRole("button").first()).toBeFocused();
  await expect(chat.locator("ai-message").last().locator(":scope > [data-part='actions']")).toBeInViewport();
  await expect(pill).toBeHidden();
});
