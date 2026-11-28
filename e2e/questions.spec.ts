import { contrastRatio, expect, sidewaysOverflow, skipThinking, test, waitForReply } from "./fixtures";

test.use({ viewport: { width: 1000, height: 900 } });

test.describe("on the docs page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/ai-composer.html");
  });

  test("a tap moves on by itself; keys don't; Send sends all, and the summary takes focus", async ({ page }) => {
    const set = page.locator("#questions ai-questions");
    await expect(set).toHaveAccessibleName("About the gift");
    await expect(set).toHaveAccessibleDescription("Waiting for your answers");
    const position = set.locator("[data-part='position']");
    await expect(position).toHaveText("1 of 3");

    // A tap on a single choice moves on.
    await set.getByRole("radio", { name: "A parent" }).click();
    await expect(position).toHaveText("2 of 3");

    // Checkboxes wait for Continue.
    await set.getByRole("checkbox", { name: "Books" }).click();
    await set.getByRole("checkbox", { name: "Gardening" }).click();
    await expect(position).toHaveText("2 of 3");
    await set.getByRole("button", { name: "Continue" }).click();
    await expect(position).toHaveText("3 of 3");

    // By keyboard: back with the arrow, the answer is kept, arrow keys choose without moving on.
    await set.getByRole("button", { name: "Previous question" }).click();
    await set.getByRole("button", { name: "Previous question" }).click();
    await expect(position).toHaveText("1 of 3");
    await expect(set.getByRole("radio", { name: "A parent" })).toBeChecked();
    await set.getByRole("radio", { name: "A parent" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(set.getByRole("radio", { name: "A child" })).toBeChecked();
    await page.waitForTimeout(700);
    await expect(position).toHaveText("1 of 3");

    await set.getByRole("button", { name: "Next question" }).click();
    await set.getByRole("button", { name: "Next question" }).click();
    await set.getByRole("radio", { name: "£20 to £50" }).click();
    await expect(position).toHaveText("3 of 3");
    await set.getByRole("button", { name: "Send" }).click();

    await expect(page.locator("#questions .event-log")).toContainText('questionsanswer {"answers":[{"value":"A child"');
    const summary = set.locator("[data-part='summary']");
    await expect(summary).toBeFocused();
    await expect(summary.locator("dd")).toHaveText(["A child", "Books, Gardening", "£20 to £50"]);
    await expect(set.getByRole("radio")).toHaveCount(0);
  });

  test("the waiting line, the position, the arrows and the summary are readable @theme", async ({ page }) => {
    const set = page.locator("#questions ai-questions");
    const canvas = await page.evaluate(() => {
      const probe = document.body.appendChild(document.createElement("div"));
      probe.style.background = "Canvas";
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });
    const colour = (selector: string, property = "color") => set.locator(selector).first().evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
    expect(contrastRatio(await colour("[data-part='status']"), canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(await colour("[data-part='position']"), canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(await colour("[data-part='next'] button"), canvas)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(await set.evaluate((element) => getComputedStyle(element).borderTopColor), canvas)).toBeGreaterThanOrEqual(3);

    await set.evaluate((element) => {
      (element as HTMLElement & { answers: unknown }).answers = [{ value: "A friend", labels: ["A friend"], other: null }, { value: ["Games"], labels: ["Games"], other: null }, { skipped: true }];
    });
    expect(contrastRatio(await colour("dt"), canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(await colour("dd[data-skipped]"), canvas)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("in the chat shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/chat-shell.html");
    await skipThinking(page);
  });

  test("a gift asks three questions at once; typing answers the one showing; a reload keeps the answers", async ({ page }) => {
    await page.getByRole("button", { name: "Help me pick a gift" }).click();
    await waitForReply(page);
    const set = page.locator("ai-questions");
    await expect(set).toHaveAccessibleDescription("Waiting for your answers");
    await expect(page.locator("ai-chat-list").getByRole("link", { name: "Help me pick a gift" })).toHaveAccessibleDescription("Needs your answers");
    await expect(page.getByRole("textbox", { name: "Prompt" })).toHaveAttribute("placeholder", "Answer the question above, or type your answer");

    await page.getByRole("textbox", { name: "Prompt" }).fill("My aunt");
    await page.keyboard.press("Enter");
    await expect(set.locator("[data-part='position']")).toHaveText("2 of 3");
    await set.getByRole("checkbox", { name: "Cooking" }).click();
    await set.getByRole("button", { name: "Continue" }).click();
    await set.getByRole("button", { name: "Skip" }).click();
    await waitForReply(page);
    await expect(page.locator("ai-message:not([from='user'])").last()).toContainText("Some ideas for my aunt, who enjoys cooking");

    await page.reload();
    await expect(page.locator("ai-questions dd")).toHaveText(["My aunt", "Cooking", "Skipped"]);
  });

  test("a set of questions fits a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByRole("button", { name: "Help me pick a gift" }).click();
    await waitForReply(page);
    await expect(page.locator("ai-questions")).toBeVisible();
    expect(await sidewaysOverflow(page)).toBe(0);
  });
});
