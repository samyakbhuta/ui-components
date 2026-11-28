import type { Locator, Page } from "@playwright/test";
import { ask, contrastRatio, expect, sidewaysOverflow, skipThinking, test, waitForReply } from "./fixtures";

test.use({ viewport: { width: 1000, height: 800 } });

const quoteButton = (page: Page) => page.locator("ai-transcript [data-part='quote-button']");

/** Selects the words of a message's paragraph, from `from` to `to`, as dragging over them would. */
async function selectWords(paragraph: Locator, from: number, to: number) {
  await paragraph.evaluate(
    (element, [start, end]) => {
      const text = element.firstChild!;
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, end);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    },
    [from, to],
  );
}

/** The colour of text and the first real background behind it. */
const colours = (element: Locator) =>
  element.evaluate((node) => {
    let holder: Element | null = node;
    let background = "rgba(0, 0, 0, 0)";
    while (holder && /rgba\(.*, 0\)|transparent/.test(background)) {
      background = getComputedStyle(holder).backgroundColor;
      holder = holder.parentElement;
    }
    if (/rgba\(.*, 0\)|transparent/.test(background)) {
      const probe = document.body.appendChild(document.createElement("div"));
      probe.style.background = "Canvas";
      background = getComputedStyle(probe).backgroundColor;
      probe.remove();
    }
    return { text: getComputedStyle(node).color, background };
  });

test.describe("in the chat shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/chat-shell.html");
    await skipThinking(page);
    await ask(page, "Write a haiku about web components");
  });

  test("selecting words in a reply offers Quote, which puts them in the box; the sent quote takes you back", async ({ page }) => {
    const reply = page.locator("ai-message:not([from='user'])").first();
    const firstLine = reply.locator("[data-part='body'] p").first();
    // Double-clicking a word selects it, as people do.
    await firstLine.dblclick({ position: { x: 20, y: 8 } });
    await expect(quoteButton(page)).toBeVisible();
    await expect(quoteButton(page)).toHaveText("Quote");
    // It floats just above the words.
    const words = (await firstLine.boundingBox())!;
    const button = (await quoteButton(page).boundingBox())!;
    expect(button.y + button.height).toBeLessThanOrEqual(words.y + 4);

    await quoteButton(page).click();
    await expect(quoteButton(page)).toBeHidden();
    const cards = page.locator("ai-composer [data-part='quote']");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveText(/^Custom/);
    await expect(page.getByRole("textbox", { name: "Prompt" })).toBeFocused();

    // A second quote adds a second card; × removes one.
    await selectWords(firstLine, 0, 11);
    await quoteButton(page).click();
    await expect(cards).toHaveCount(2);
    await page.getByRole("button", { name: "Remove quote: Custom tags" }).click();
    await expect(cards).toHaveCount(1);

    await page.getByRole("textbox", { name: "Prompt" }).fill("What does this mean?");
    await page.keyboard.press("Enter");
    await waitForReply(page);
    await expect(cards).toHaveCount(0);
    const mine = page.locator("ai-message[from='user']").last();
    const sentQuote = mine.getByRole("button", { name: /^Quoted: Custom/ });
    await expect(sentQuote).toBeVisible();
    // It sits above the bubble, in the message, not floating elsewhere.
    const quoteBox = (await sentQuote.boundingBox())!;
    const bubble = (await mine.locator(":scope > [data-part='body']").boundingBox())!;
    expect(quoteBox.y + quoteBox.height).toBeLessThanOrEqual(bubble.y + 1);
    expect(await sentQuote.evaluate((element) => getComputedStyle(element).position)).toBe("static");
    await expect(page.locator("ai-message:not([from='user'])").last()).toContainText("You quoted:");

    // Pressing the quote goes back to the reply it came from.
    await page.locator("ai-transcript").evaluate((element) => (element.scrollTop = element.scrollHeight));
    await sentQuote.click();
    await expect(reply).toBeFocused();
    await expect(reply).toHaveAttribute("data-highlighted", "");
    await expect(reply).toBeInViewport();

    // Saved: after a reload the quote is still there, and still goes back.
    await page.reload();
    await page.locator("ai-message[from='user']").last().getByRole("button", { name: /^Quoted: Custom/ }).click();
    await expect(page.locator("ai-message:not([from='user'])").first()).toBeFocused();
  });

  test("Quote works by keyboard, and Escape hides it", async ({ page }) => {
    const firstLine = page.locator("ai-message:not([from='user'])").first().locator("[data-part='body'] p").first();
    await selectWords(firstLine, 0, 11);
    await expect(quoteButton(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(quoteButton(page)).toBeHidden();

    await selectWords(firstLine, 12, 17);
    await expect(quoteButton(page)).toBeVisible();
    await quoteButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("ai-composer [data-part='quote-text']")).toHaveText(["bloom"]);
  });

  test("words in your own messages can be quoted too, but not across messages", async ({ page }) => {
    const mine = page.locator("ai-message[from='user'] [data-part='body'] p").first();
    await selectWords(mine, 0, 5);
    await quoteButton(page).click();
    await expect(page.locator("ai-composer [data-part='quote-text']")).toHaveText(["Write"]);

    await page.evaluate(() => {
      const [asked, answered] = document.querySelectorAll("ai-message [data-part='body'] p");
      const range = document.createRange();
      range.setStart(asked.firstChild!, 0);
      range.setEnd(answered.firstChild!, 5);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    await page.waitForTimeout(100);
    await expect(quoteButton(page)).toBeHidden();
  });

  test("the Quote button and the quote cards are readable @theme", async ({ page }) => {
    const firstLine = page.locator("ai-message:not([from='user'])").first().locator("[data-part='body'] p").first();
    await selectWords(firstLine, 0, 11);
    await page.mouse.move(0, 0);
    const pill = await colours(quoteButton(page));
    expect(contrastRatio(pill.text, pill.background), "Quote button").toBeGreaterThanOrEqual(4.5);
    await quoteButton(page).click();
    const card = await colours(page.locator("ai-composer [data-part='quote-text']"));
    expect(contrastRatio(card.text, card.background), "quote card").toBeGreaterThanOrEqual(4.5);
    await page.getByRole("textbox", { name: "Prompt" }).fill("Why?");
    await page.keyboard.press("Enter");
    await waitForReply(page);
    await page.mouse.move(0, 0);
    const sent = await colours(page.locator("ai-message[from='user'] [data-part='quote']").first());
    expect(contrastRatio(sent.text, sent.background), "sent quote").toBeGreaterThanOrEqual(4.5);
  });

  test("on a phone, quote cards fit", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 760 });
    const firstLine = page.locator("ai-message:not([from='user'])").first().locator("[data-part='body'] p").first();
    await selectWords(firstLine, 0, 17);
    await quoteButton(page).click();
    await expect(page.locator("ai-composer [data-part='quote']")).toBeVisible();
    expect(await sidewaysOverflow(page)).toBe(0);
  });
});

test("on the docs page, the box can take quotes as > lines instead", async ({ page }) => {
  await page.goto("/experiments/ai-composer.html");
  const section = page.locator("#quotes");
  await section.getByLabel("Markdown quotes").check();
  const paragraph = section.locator("ai-message [data-part='body'] p");
  await paragraph.evaluate((element) => {
    const range = document.createRange();
    range.setStart(element.firstChild!, 0);
    range.setEnd(element.firstChild!, 15);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await section.locator("[data-part='quote-button']").click();
  await expect(section.getByRole("textbox", { name: "Prompt" })).toHaveValue("> Custom elements\n\n");
  await expect(section.locator(".event-log")).toHaveText('messagequote {"text":"Custom elements","message":"<ai-message>","from":"assistant"}');
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 760 } });

  test("Quote docks at the bottom of the conversation, clear of the phone's own menu, and a tap quotes", async ({ page }) => {
    await page.goto("/experiments/chat-shell.html");
    await skipThinking(page);
    await ask(page, "Write a haiku about web components");
    const firstLine = page.locator("ai-message:not([from='user'])").first().locator("[data-part='body'] p").first();
    // A touch on the words, then the selection the phone makes.
    const box = (await firstLine.boundingBox())!;
    await page.touchscreen.tap(box.x + 10, box.y + 8);
    await selectWords(firstLine, 0, 17);

    const pill = quoteButton(page);
    await expect(pill).toHaveText("Quote selection");
    await expect(pill).toHaveAttribute("data-docked", "");
    // At the bottom of the conversation, well away from the words and the menu above them.
    const transcript = (await page.locator("ai-transcript").boundingBox())!;
    const placed = (await pill.boundingBox())!;
    expect(placed.y + placed.height).toBeLessThanOrEqual(transcript.y + transcript.height);
    expect(placed.y + placed.height).toBeGreaterThan(transcript.y + transcript.height - 40);
    expect(placed.y).toBeGreaterThan(box.y + box.height + 40);
    await expect(page.locator("ai-transcript [data-part='jump']")).toBeHidden();

    await page.touchscreen.tap(placed.x + placed.width / 2, placed.y + placed.height / 2);
    await expect(page.locator("ai-composer [data-part='quote-text']")).toHaveText(["Custom tags bloom"]);
    await expect(pill).toBeHidden();
    expect(await sidewaysOverflow(page)).toBe(0);
  });
});

test("in <ai-chat>, words in a plan card can be quoted, labelled with the plan @theme", async ({ page }) => {
  await page.goto("/experiments/ai-composer.html");
  const chat = page.locator("#chat ai-chat");
  await chat.getByRole("button", { name: "Plan a surprise birthday party" }).click();
  const plan = chat.locator("ai-plan");
  await expect(plan).toBeVisible({ timeout: 20_000 });
  await expect(chat.locator("ai-composer")).not.toHaveAttribute("busy", { timeout: 20_000 });
  await plan.locator("[data-part='summary']").evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await chat.locator("[data-part='quote-button']").click();
  const card = chat.locator("ai-composer [data-part='quote']");
  await expect(card.locator("[data-part='quote-source']")).toHaveText("Plan: Surprise party for Sam's 40th");
  await expect(card.locator("[data-part='quote-text']")).toHaveText(/^Five steps/);
  const source = await card.locator("[data-part='quote-source']").evaluate((node) => ({
    text: getComputedStyle(node).color,
    background: getComputedStyle(node.closest("[data-part='quote']")!).backgroundColor,
  }));
  expect(contrastRatio(source.text, source.background)).toBeGreaterThanOrEqual(4.5);

  // Typed while the plan waits, it asks for changes, with the quote in the words.
  await chat.getByRole("textbox", { name: "Prompt" }).fill("Make it four");
  await page.keyboard.press("Enter");
  await expect(plan.locator("[data-part='decision']")).toContainText("Plan: Surprise party for Sam's 40th:");
  await expect(plan.locator("[data-part='decision']")).toContainText("Make it four");
});
