import { contrastRatio, expect, sidewaysOverflow, skipThinking, test, waitForReply } from "./fixtures";

test.use({ viewport: { width: 1000, height: 900 } });

test.describe("on the docs page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/ai-composer.html");
  });

  test("by keyboard: Tab reaches the input and the buttons, Enter in the box denies with a reason", async ({ page }) => {
    const approval = page.locator("#approval .command-approval");
    await expect(approval).toHaveAccessibleName("Run a command");
    await expect(approval).toHaveAccessibleDescription("Waiting for your approval");

    await approval.getByRole("textbox", { name: "What should it do instead?" }).focus();
    await page.keyboard.press("Shift+Tab");
    await expect(approval.locator("[data-part='input']")).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.type("Only clear dist/cache");
    await page.keyboard.press("Enter");

    await expect(page.locator("#approval .event-log")).toHaveText('approvaldecision {"decision":"deny","reason":"Only clear dist/cache"}');
    const decision = approval.locator("[data-part='decision']");
    await expect(decision).toHaveText("Denied: Only clear dist/cache");
    await expect(decision).toBeFocused();
    await expect(approval.getByRole("status")).toHaveText("Denied: Only clear dist/cache");
    await expect(approval.getByRole("button")).toHaveCount(0);

    await page.locator("#approval").getByRole("button", { name: "Ask again" }).click();
    await approval.getByRole("button", { name: "Always allow" }).press("Enter");
    await expect(page.locator("#approval .event-log")).toHaveText('approvaldecision {"decision":"always","reason":null}');
  });

  test("the waiting line, the border, the buttons and both outcomes are readable @theme", async ({ page }) => {
    const section = page.locator("#approval");
    const measure = () =>
      section.evaluate((root) => {
        const probe = document.body.appendChild(document.createElement("div"));
        probe.style.background = "Canvas";
        const canvas = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const command = root.querySelector(".command-approval")!;
        const email = root.querySelector(".email-approval")!;
        const style = (scope: Element, selector: string) => getComputedStyle(scope.querySelector(selector)!);
        return {
          canvas,
          waiting: style(command, "[data-part='status']").color,
          border: getComputedStyle(command).borderTopColor,
          description: style(command, "[data-part='description']").color,
          input: style(command, "[data-part='input']").color,
          inputBackground: style(command, "[data-part='input']").backgroundColor,
          allow: style(command, "[data-part='allow'] button").color,
          allowBackground: style(command, "[data-part='allow'] button").backgroundColor,
          denied: style(command, "[data-part='decision']").color,
          allowed: style(email, "[data-part='decision']").color,
        };
      });
    const before = await measure();
    expect(contrastRatio(before.waiting, before.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(before.border, before.canvas)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(before.description, before.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(before.input, before.inputBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(before.allow, before.allowBackground)).toBeGreaterThanOrEqual(4.5);

    await section.locator(".command-approval").getByRole("button", { name: "Deny" }).click();
    await section.locator(".email-approval").getByRole("button", { name: "Allow once" }).click();
    const after = await measure();
    expect(contrastRatio(after.denied, after.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(after.allowed, after.canvas)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("in the chat shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/chat-shell.html");
    await skipThinking(page);
  });

  test("cleaning up waits for approval, Allow once runs it, and a reload keeps the decision", async ({ page }) => {
    await page.getByRole("button", { name: "Clean up my project's build folder" }).click();
    await waitForReply(page);
    const approval = page.locator("ai-approval");
    await expect(approval).toHaveAccessibleDescription("Waiting for your approval");
    await expect(page.getByRole("textbox", { name: "Prompt" })).toHaveAttribute("placeholder", "Allow or deny above, or tell it what to do instead");
    await expect(page.locator("ai-chat-list").getByRole("link", { name: "Clean up my project's build folder" })).toHaveAccessibleDescription(
      "Needs your approval",
    );

    await approval.getByRole("button", { name: "Allow once" }).click();
    await waitForReply(page);
    const done = page.locator("ai-message:not([from='user'])").last();
    await expect(done.locator("ai-tool-call")).toHaveAttribute("status", "done");
    await expect(done).toContainText("The build folder is gone");

    await page.reload();
    await expect(page.locator("ai-approval [data-part='decision']")).toHaveText("Allowed once");
    await expect(page.locator("ai-approval").getByRole("button")).toHaveCount(0);
  });

  test("an approval fits a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.getByRole("button", { name: "Clean up my project's build folder" }).click();
    await waitForReply(page);
    await expect(page.locator("ai-approval")).toBeVisible();
    expect(await sidewaysOverflow(page)).toBe(0);
  });
});
