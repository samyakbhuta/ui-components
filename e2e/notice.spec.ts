import { contrastRatio, expect, sidewaysOverflow, skipThinking, test, waitForReply } from "./fixtures";

test.use({ viewport: { width: 1000, height: 900 } });

test.describe("on the docs page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/ai-composer.html");
  });

  test("the usage limit says when it resets, and its buttons work by keyboard", async ({ page }) => {
    const section = page.locator("#notice");
    const limit = section.locator("ai-notice.sample-limit");
    await expect(limit).toHaveAccessibleName("Warning: You've reached your usage limit");
    await expect(limit).toHaveAccessibleDescription(/^You've used this plan's messages for now\. .* Resets at .+ · in 2 hours$/);

    await limit.getByRole("button", { name: "Notify me" }).focus();
    await page.keyboard.press("Enter");
    await expect(section.locator(".event-log")).toHaveText('noticeaction {"value":"notify"}');
    await expect(limit.getByRole("button", { name: "We'll remind you" })).toBeDisabled();

    // The upgrade link is the main action; the demo keeps it on the page.
    const upgrade = limit.getByRole("link", { name: "Upgrade plan" });
    await expect(upgrade).toHaveAttribute("data-primary", "");
    await upgrade.click();
    await expect(section.locator(".event-log")).toHaveText('noticeaction {"value":"upgrade"}');
    await expect(page).toHaveURL(/ai-composer\.html/);
  });

  test("an info notice can be dismissed", async ({ page }) => {
    const section = page.locator("#notice");
    const offline = section.locator("ai-notice.sample-offline");
    await expect(offline).toHaveAccessibleName("Note: You're offline");
    await offline.getByRole("button", { name: "Dismiss" }).click();
    await expect(offline).toBeHidden();
    await expect(section.locator(".event-log")).toHaveText("noticedismiss null");
  });

  test("each tone's border, icon and text are readable @theme", async ({ page }) => {
    const limit = page.locator("#notice ai-notice.sample-limit");
    for (const tone of ["warning", "error", "info"] as const) {
      await limit.evaluate((notice, tone) => notice.setAttribute("tone", tone), tone);
      const colours = await limit.evaluate((notice) => {
        const style = (selector: string) => getComputedStyle(notice.querySelector(selector)!);
        const probe = document.body.appendChild(document.createElement("div"));
        probe.style.background = "Canvas";
        const canvas = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
          canvas,
          background: getComputedStyle(notice).backgroundColor,
          border: getComputedStyle(notice).borderTopColor,
          icon: style("[data-part='icon']").color,
          heading: style("[data-part='heading']").color,
          resets: style("[data-part='resets']").color,
          primary: style("[data-part='action'][data-primary]").color,
          primaryBackground: style("[data-part='action'][data-primary]").backgroundColor,
        };
      });
      expect(contrastRatio(colours.border, colours.canvas), `${tone} border`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(colours.icon, colours.background), `${tone} icon`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(colours.heading, colours.background), `${tone} heading`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colours.resets, colours.background), `${tone} reset line`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(colours.primary, colours.primaryBackground), `${tone} primary`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("on a phone, the buttons wrap and nothing scrolls sideways", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const limit = page.locator("#notice ai-notice.sample-limit");
    await limit.scrollIntoViewIfNeeded();
    expect(await sidewaysOverflow(page)).toBe(0);
    const first = (await limit.getByRole("link", { name: "Upgrade plan" }).boundingBox())!;
    const last = (await limit.getByRole("button", { name: "Notify me" }).boundingBox())!;
    expect(last.y).toBeGreaterThan(first.y);
  });

  test("in a chat, the usage limit locks the box until a way round it is chosen", async ({ page }) => {
    const chat = page.locator("#chat ai-chat");
    await chat.getByRole("button", { name: "Show me the usage limit" }).click();
    await expect(chat.locator("ai-notice")).toBeVisible();
    await expect(chat).toHaveAttribute("locked", "");
    await expect(chat.getByRole("textbox", { name: "Prompt" })).toBeDisabled();
    await expect(chat.locator("ai-composer [data-part='hint']")).toHaveText(/^Sending is paused until /);
    await chat.locator("ai-notice").getByRole("button", { name: "Use extra credits" }).click();
    await expect(chat).not.toHaveAttribute("locked", "");
    await expect(chat.getByRole("textbox", { name: "Prompt" })).toBeEnabled();
  });
});

test.describe("in the chat shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
    await page.goto("/experiments/chat-shell.html");
    await skipThinking(page);
  });

  const limit = (page: import("@playwright/test").Page) => page.locator("ai-notice");
  const prompt = (page: import("@playwright/test").Page) => page.getByRole("textbox", { name: "Prompt" });

  test("the usage limit locks the box, stays locked after a reload, and unlocks when it resets", async ({ page }) => {
    await page.getByRole("button", { name: "Show me the usage limit" }).click();
    await waitForReply(page);
    await expect(limit(page)).toHaveAccessibleName("Warning: You've reached your usage limit");
    await expect(limit(page).locator("[data-part='resets']")).toHaveText(/^Resets at .+ · in 2 minutes$/);
    await expect(prompt(page)).toBeDisabled();
    await expect(page.locator("ai-composer [data-part='hint']")).toHaveText(/^Sending is paused until /);

    await page.reload();
    await expect(limit(page)).toBeVisible();
    await expect(prompt(page)).toBeDisabled();

    await page.clock.fastForward("02:05");
    await expect(limit(page).locator("[data-part='resets']")).toHaveText("You can carry on now.");
    await expect(limit(page)).toHaveAttribute("expired", "");
    await expect(limit(page).getByRole("button")).toHaveCount(0);
    await expect(prompt(page)).toBeEnabled();
    await expect(page.locator("ai-composer [data-part='hint']")).not.toHaveText(/paused/);
  });

  test("Switch to a smaller model picks Haiku and carries on", async ({ page }) => {
    await page.getByRole("button", { name: "Show me the usage limit" }).click();
    await waitForReply(page);
    await limit(page).getByRole("button", { name: "Switch to a smaller model" }).click();
    await waitForReply(page);
    await expect(page.locator("ai-message:not([from='user'])").last()).toContainText("Switched to Haiku 5.5");
    await expect(page.getByRole("combobox", { name: "Model" })).toContainText("Haiku 5.5");
    await expect(prompt(page)).toBeEnabled();

    // Once a way round it was chosen, a reload doesn't lock again.
    await page.reload();
    await expect(limit(page)).toBeVisible();
    await expect(prompt(page)).toBeEnabled();
  });

  test("Use extra credits carries on, Notify me says it will, and Upgrade plan stays on the page", async ({ page }) => {
    await page.getByRole("button", { name: "Show me the usage limit" }).click();
    await waitForReply(page);
    await limit(page).getByRole("button", { name: "Notify me" }).click();
    await expect(limit(page).getByRole("button", { name: "We'll remind you" })).toBeDisabled();
    await expect(prompt(page)).toBeDisabled();

    await limit(page).getByRole("link", { name: "Upgrade plan" }).click();
    await expect(page.locator(".upgrade-note")).toHaveText("A real app would open its pricing page here.");
    await expect(page).not.toHaveURL(/#pricing/);

    await limit(page).getByRole("button", { name: "Use extra credits" }).click();
    await waitForReply(page);
    await expect(page.locator("ai-message:not([from='user'])").last()).toContainText("Extra usage is on");
    await expect(prompt(page)).toBeEnabled();
  });

  test("on a phone, the notice fits", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByRole("button", { name: "Show me the usage limit" }).click();
    await waitForReply(page);
    await expect(limit(page)).toBeVisible();
    expect(await sidewaysOverflow(page)).toBe(0);
  });
});
