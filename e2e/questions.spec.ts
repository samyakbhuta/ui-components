import { contrastRatio, expect, sidewaysOverflow, skipThinking, test, waitForReply } from "./fixtures";

test.use({ viewport: { width: 1000, height: 900 } });

test.describe("on the docs page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/ai-composer.html");
  });

  test("a tap moves on by itself; keys don't; Send sends all, and the summary takes focus", async ({ page }) => {
    const set = page.locator("#questions ai-questions");
    // The carousel is the set's region.
    const carousel = set.getByRole("region", { name: "About the gift" });
    await expect(carousel).toHaveAccessibleDescription("Waiting for your answers");
    await expect(carousel).toHaveAttribute("aria-roledescription", "carousel");
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
    // Focus follows into the question it moved to.
    await expect(set.getByRole("radio", { name: "Under £20" })).toBeFocused();

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
    await set.getByRole("button", { name: "Send answers" }).click();

    const log = page.locator("#questions .event-log");
    await expect(log).toHaveText(/^answerschange /);
    for (const piece of ['"value":[{"value":"A child"', '"reason":"press"', '"source":"mouse"']) await expect(log).toContainText(piece);
    const summary = set.locator("[data-part='summary']");
    await expect(summary).toBeFocused();
    await expect(summary.locator("dd")).toHaveText(["A child", "Books, Gardening", "£20 to £50"]);
    await expect(set.getByRole("radio")).toHaveCount(0);
    await expect(page.locator("[aria-live]").filter({ hasText: "Sent 3 answers" })).toHaveCount(1);
  });

  test("the carousel pages with its arrows, a drag and code, and keeps the questions out of view inert", async ({ page }) => {
    const set = page.locator("#questions ai-questions");
    const position = set.locator("[data-part='position']");
    const slides = set.locator("ui-carousel-item");
    const previous = set.getByRole("button", { name: "Previous question" });
    const next = set.getByRole("button", { name: "Next question" });
    await expect(slides).toHaveCount(3);
    await expect(slides.nth(0)).not.toHaveAttribute("inert");
    await expect(slides.nth(1)).toHaveAttribute("inert", "");
    await expect(slides.nth(2)).toHaveAttribute("inert", "");
    // At the start, Previous is marked, not removed: it stays focusable and does nothing.
    await expect(previous).toHaveAttribute("aria-disabled", "true");

    await next.click();
    await expect(position).toHaveText("2 of 3");
    await expect(slides.nth(0)).toHaveAttribute("inert", "");
    await expect(slides.nth(1)).not.toHaveAttribute("inert");
    await expect(set.getByRole("checkbox", { name: "Books" })).toBeVisible();

    // A mouse drags the questions too, like a swipe on a touch screen.
    const box = (await set.locator("[data-part='viewport']").boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(position).toHaveText("3 of 3");
    await expect(slides.nth(2)).not.toHaveAttribute("inert");
    await expect(next).toHaveAttribute("aria-disabled", "true");

    // Code moving the set moves the carousel.
    await set.evaluate((element) => ((element as HTMLElement & { index: number }).index = 0));
    await expect(slides.nth(0)).not.toHaveAttribute("inert");
    await expect(position).toHaveText("1 of 3");
  });

  test("Send with a question unanswered goes back to it, says so, and focuses it", async ({ page }) => {
    const set = page.locator("#questions ai-questions");
    const position = set.locator("[data-part='position']");
    await set.getByRole("button", { name: "Next question" }).click();
    await set.getByRole("button", { name: "Next question" }).click();
    await expect(position).toHaveText("3 of 3");
    await set.getByRole("radio", { name: "Over £50" }).click();
    await set.getByRole("button", { name: "Send answers" }).click();
    await expect(position).toHaveText("1 of 3");
    await expect(set.getByRole("radio", { name: "A friend" })).toBeFocused();
    await expect(page.locator("[aria-live]").filter({ hasText: "Question 1 still needs an answer." })).toHaveCount(1);
    await expect(set).not.toHaveAttribute("answered");
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

test("on a phone, the set fits the docs page's column: its row of questions doesn't widen it", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/experiments/ai-composer.html");
  const set = page.locator("#questions ai-questions");
  await expect(set.locator("ui-carousel-item")).toHaveCount(3);
  const { width, room } = await set.evaluate((element) => {
    const stage = getComputedStyle(element.parentElement!);
    const room = element.parentElement!.clientWidth - parseFloat(stage.paddingLeft) - parseFloat(stage.paddingRight);
    return { width: element.getBoundingClientRect().width, room };
  });
  expect(width).toBeLessThanOrEqual(room);
  expect(await sidewaysOverflow(page)).toBe(0);
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
    await expect(set.getByRole("region", { name: "About the gift" })).toHaveAccessibleDescription("Waiting for your answers");
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
