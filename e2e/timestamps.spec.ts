import { ask, contrastRatio, expect, sidewaysOverflow, skipThinking, test } from "./fixtures";

test.use({ viewport: { width: 1000, height: 900 } });

test.describe("in the chat shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.goto("/experiments/chat-shell.html");
    await skipThinking(page);
  });

  const reply = (page: import("@playwright/test").Page) => page.locator("ai-message:not([from='user'])").last();
  const meta = (message: import("@playwright/test").Locator) => message.locator("[data-part='meta']");

  test("each message's time and the reply's model show on hover or focus, and keep up", async ({ page }) => {
    await ask(page, "Write a haiku about web components");
    const sent = page.locator("ai-message[from='user']").last();
    await page.mouse.move(0, 0);
    await expect(meta(reply(page))).toHaveCSS("opacity", "0");
    await expect(meta(reply(page))).toHaveText("Sonnet 5.5 · just now");
    await expect(meta(sent)).toHaveText("just now");

    // Pointing at it shows it.
    await reply(page).hover();
    await expect(meta(reply(page))).toHaveCSS("opacity", "1");
    await expect(meta(sent)).toHaveCSS("opacity", "0");

    // So does focusing one of its buttons from the keyboard.
    await page.mouse.move(0, 0);
    await reply(page).getByRole("button", { name: "Copy" }).focus();
    await expect(meta(reply(page))).toHaveCSS("opacity", "1");

    // The full date and time is on hover, and the time keeps up.
    const time = reply(page).locator("time");
    await expect(time).toHaveAttribute("title", /\d{4}.*\d:\d\d/);
    await expect(time).toHaveAttribute("datetime", /^\d{4}-\d\d-\d\dT/);
    await page.clock.fastForward("03:00");
    await expect(time).toHaveText("3 minutes ago");

    // The time isn't read out with the reply.
    await expect(page.locator("ai-transcript > [data-part='announcement']")).not.toContainText("ago");

    // Saved, and shown again after a reload.
    const at = await time.getAttribute("datetime");
    await page.reload();
    await expect(reply(page).locator("time")).toHaveAttribute("datetime", at!);
    await expect(meta(reply(page))).toHaveText("Sonnet 5.5 · 3 minutes ago");
  });

  test("the line is readable @theme", async ({ page }) => {
    await ask(page, "Write a haiku about web components");
    await reply(page).hover();
    await expect(meta(reply(page))).toHaveCSS("opacity", "1");
    const colours = await meta(reply(page)).evaluate((line) => {
      let holder: Element | null = line;
      let background = "rgba(0, 0, 0, 0)";
      while (holder && /rgba\(.*, 0\)|transparent/.test(background)) {
        background = getComputedStyle(holder).backgroundColor;
        holder = holder.parentElement;
      }
      // Nothing set one: the page shows its canvas colour.
      if (/rgba\(.*, 0\)|transparent/.test(background)) {
        const probe = document.body.appendChild(document.createElement("div"));
        probe.style.background = "Canvas";
        background = getComputedStyle(probe).backgroundColor;
        probe.remove();
      }
      return { text: getComputedStyle(line).color, background };
    });
    expect(contrastRatio(colours.text, colours.background), JSON.stringify(colours)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 800 } });

  test("the line always shows, and nothing scrolls sideways", async ({ page }) => {
    await page.goto("/experiments/chat-shell.html");
    await skipThinking(page);
    await ask(page, "Write a haiku about web components");
    await expect(page.locator("ai-message:not([from='user'])").last().locator("[data-part='meta']")).toHaveCSS("opacity", "1");
    expect(await sidewaysOverflow(page)).toBe(0);
  });
});

test("on the docs page, the sample messages show when they were sent", async ({ page }) => {
  await page.goto("/experiments/ai-composer.html");
  const section = page.locator("#messages");
  const question = section.locator("ai-message[from='user']");
  const answer = section.locator("ai-message.sample-reply");
  await expect(question.locator("[data-part='meta']")).toHaveText("2 days ago");
  await expect(answer.locator("[data-part='meta']")).toHaveText("Sonnet 5.5 · just now");
  await answer.hover();
  await expect(answer.locator("[data-part='meta']")).toBeVisible();
});
