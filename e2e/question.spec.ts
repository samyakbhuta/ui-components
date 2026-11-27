import { contrastRatio, expect, sidewaysOverflow, skipThinking, test, waitForReply } from "./fixtures";

test.use({ viewport: { width: 1000, height: 900 } });

test.describe("on the docs page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/ai-composer.html");
  });

  test("one choice works by keyboard: arrows choose, typing chooses Other, Enter sends", async ({ page }) => {
    const question = page.locator("#question .city-question");
    const send = question.getByRole("button", { name: "Send" });
    await expect(send).toBeDisabled();
    await expect(page.locator("#question").getByRole("button", { name: "Reset demo" })).toBeHidden();

    // Tab into the group, then arrows move and choose, as with native radios.
    await question.getByRole("radio", { name: "Paris" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(question.getByRole("radio", { name: "Rome" })).toBeChecked();
    await expect(send).toBeEnabled();

    await question.getByRole("textbox", { name: "Your own answer" }).fill("Porto");
    await expect(question.getByRole("radio", { name: "Other" })).toBeChecked();
    await question.getByRole("textbox", { name: "Your own answer" }).press("Enter");

    await expect(page.locator("#question .event-log")).toHaveText('questionanswer {"value":"Porto","labels":["Porto"],"other":"Porto"}');
    await expect(question.locator("[data-part='answer']")).toHaveText("Answered: Porto");
    await expect(question.locator("[data-part='answer']")).toBeFocused();
    await expect(send).toBeHidden();
    await expect(question.getByRole("status")).toHaveText("Answered: Porto");

    // Reset demo shows once something is answered, and puts focus back on the first choice.
    const reset = page.locator("#question").getByRole("button", { name: "Reset demo" });
    await reset.click();
    await expect(send).toBeVisible();
    await expect(reset).toBeHidden();
    await expect(question.getByRole("radio").first()).toBeFocused();
  });

  test("several choices: max disables the rest until one is unchecked", async ({ page }) => {
    const question = page.locator("#question .plans-question");
    await expect(question.getByRole("group", { name: "What would you like to do there?" })).toHaveAccessibleDescription("Waiting for your answer Choose up to 2.");
    await question.getByRole("checkbox", { name: "Food" }).click();
    await question.getByRole("checkbox", { name: "Museums" }).click();
    await expect(question.getByRole("checkbox", { name: "Beaches" })).toBeDisabled();
    await expect(question.getByRole("textbox", { name: "Your own answer" })).toBeDisabled();
    await question.getByRole("checkbox", { name: "Food" }).click();
    await expect(question.getByRole("checkbox", { name: "Beaches" })).toBeEnabled();
    await question.getByRole("checkbox", { name: "Beaches" }).press("Space");
    await question.getByRole("button", { name: "Send" }).click();
    await expect(page.locator("#question .event-log")).toHaveText('questionanswer {"value":["Museums","Beaches"],"labels":["Museums","Beaches"],"other":null}');
  });

  test("its text, controls and borders are readable @theme", async ({ page }) => {
    const question = page.locator("#question .plans-question");
    await question.getByRole("checkbox", { name: "Food" }).click();
    const colours = await question.evaluate((root) => {
      const style = (selector: string) => getComputedStyle(root.querySelector(selector)!);
      const probe = document.body.appendChild(document.createElement("div"));
      probe.style.background = "Canvas";
      const canvas = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        canvas,
        legend: style("[data-part='legend']").color,
        waiting: style("[data-part='status']").color,
        border: getComputedStyle(root).borderTopColor,
        hint: style("[data-part='hint']").color,
        control: style("ui-checkbox:not([data-checked])").borderTopColor,
        checked: style("ui-checkbox[data-checked]").backgroundColor,
        tick: style("ui-checkbox[data-checked]").color,
        send: style("[data-part='send'] button").color,
        sendBackground: style("[data-part='send'] button").backgroundColor,
      };
    });
    expect(contrastRatio(colours.legend, colours.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colours.hint, colours.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colours.waiting, colours.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colours.border, colours.canvas)).toBeGreaterThanOrEqual(3);
    // Controls are graphics: 3:1 against the page.
    expect(contrastRatio(colours.control, colours.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colours.checked, colours.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colours.tick, colours.checked)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colours.send, colours.sendBackground)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("in the chat shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/chat-shell.html");
    await skipThinking(page);
  });

  test("planning a trip asks two questions, sends each answer, and a reload keeps them answered", async ({ page }) => {
    await page.getByRole("button", { name: "Plan a weekend trip for me" }).click();
    await waitForReply(page);
    await page.getByRole("radio", { name: "Lisbon" }).click();
    await page.locator("ai-question:not([answered])").getByRole("button", { name: "Send" }).click();
    await waitForReply(page);
    await expect(page.locator("ai-message[from='user']").last()).toContainText("Lisbon");

    await page.getByRole("checkbox", { name: "Food" }).click();
    await page.getByRole("checkbox", { name: "Beaches" }).click();
    await page.locator("ai-question:not([answered])").getByRole("button", { name: "Send" }).click();
    await waitForReply(page);
    await expect(page.locator("ai-message:not([from='user'])").last()).toContainText("A weekend in Lisbon");

    await page.reload();
    const answers = page.locator("ai-question [data-part='answer']");
    await expect(answers).toHaveText(["Answered: Lisbon", "Answered: Food, Beaches"]);
    await expect(page.getByRole("radio", { name: "Lisbon" })).toBeChecked();
  });

  test("while a question waits, the card, the box and the sidebar say so, and the badge is readable @theme", async ({ page }) => {
    await page.getByRole("button", { name: "Plan a weekend trip for me" }).click();
    await waitForReply(page);
    const question = page.locator("ai-question");
    await expect(question.locator("[data-part='status']")).toHaveText("Waiting for your answer");
    await expect(question.getByRole("radiogroup")).toHaveAccessibleDescription("Waiting for your answer");
    await expect(page.getByRole("textbox", { name: "Prompt" })).toHaveAttribute("placeholder", "Answer the question above, or type your answer");
    const chat = page.locator("ai-chat-list").getByRole("link", { name: "Plan a weekend trip for me" });
    await expect(chat).toHaveAccessibleDescription("Needs your answer");
    const badge = await chat.locator("[data-part='status']").evaluate((element) => {
      let node: Element | null = element;
      let background = "rgba(0, 0, 0, 0)";
      while (node && background === "rgba(0, 0, 0, 0)") {
        background = getComputedStyle(node).backgroundColor;
        node = node.parentElement;
      }
      return { color: getComputedStyle(element).color, background };
    });
    expect(contrastRatio(badge.color, badge.background)).toBeGreaterThanOrEqual(4.5);

    // Typing in the box answers it, and the waiting signs go away.
    await page.getByRole("textbox", { name: "Prompt" }).fill("Porto");
    await page.keyboard.press("Enter");
    await waitForReply(page);
    await expect(question.first().locator("[data-part='answer']")).toHaveText("Answered: Porto");
    await expect(page.locator("ai-message:not([from='user'])").last()).toContainText("Porto it is.");
    await expect(page.locator("ai-question:not([answered])")).toHaveCount(1);
  });

  test("a question fits a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByRole("button", { name: "Plan a weekend trip for me" }).click();
    await waitForReply(page);
    await expect(page.locator("ai-question")).toBeVisible();
    expect(await sidewaysOverflow(page)).toBe(0);
  });
});
