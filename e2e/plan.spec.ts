import { contrastRatio, expect, sidewaysOverflow, test } from "./fixtures";

test.use({ viewport: { width: 1000, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.goto("/experiments/ai-composer.html");
});

test("by keyboard: open the plan, revise it with Enter, then reset and accept with a mode", async ({ page }) => {
  const section = page.locator("#plan");
  const plan = section.locator("ai-plan");
  await expect(plan).toHaveAccessibleName("Split the chat shell into modules");
  await expect(plan).toHaveAccessibleDescription("Waiting for your review");
  await expect(section.getByRole("button", { name: "Reset demo" })).toBeHidden();

  const open = plan.getByRole("button", { name: "Open plan" });
  await open.focus();
  await page.keyboard.press("Enter");
  await expect(plan.getByRole("button", { name: "Close plan" })).toHaveAttribute("aria-expanded", "true");
  await expect(plan.getByRole("heading", { name: "Steps" })).toBeVisible();

  await plan.getByRole("button", { name: "Revise…" }).press("Enter");
  await expect(plan.getByRole("textbox", { name: "What should change?" })).toBeFocused();
  await page.keyboard.type("Keep the sidebar where it is");
  await page.keyboard.press("Enter");
  await expect(section.locator(".event-log")).toHaveText('plandecision {"decision":"revise","mode":null,"feedback":"Keep the sidebar where it is"}');
  const decision = plan.locator("[data-part='decision']");
  await expect(decision).toHaveText("Asked for changes: “Keep the sidebar where it is”");
  await expect(decision).toBeFocused();

  await section.getByRole("button", { name: "Reset demo" }).click();
  await expect(plan.getByRole("button", { name: "Accept", exact: true })).toBeFocused();
  await plan.getByRole("button", { name: "Accept and use auto mode" }).press("Enter");
  await expect(section.locator(".event-log")).toHaveText('plandecision {"decision":"accept","mode":"auto","feedback":null}');
  await expect(decision).toHaveText("Accepted, using auto mode");
});

test("the waiting line, the link, the buttons, the plan and both outcomes are readable @theme", async ({ page }) => {
  const plan = page.locator("#plan ai-plan");
  await plan.getByRole("button", { name: "Open plan" }).click();
  const colours = await plan.evaluate((root) => {
    const probe = document.body.appendChild(document.createElement("div"));
    probe.style.background = "Canvas";
    const canvas = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const style = (selector: string) => getComputedStyle(root.querySelector(selector)!);
    return {
      canvas,
      waiting: style("[data-part='status']").color,
      border: getComputedStyle(root).borderTopColor,
      summary: style("[data-part='summary']").color,
      toggle: style("[data-part='toggle']").color,
      text: style("[data-part='plan'] li").color,
      planBackground: style("[data-part='plan']").backgroundColor,
      primary: style("[data-part='accept-with'] button").color,
      primaryBackground: style("[data-part='accept-with'] button").backgroundColor,
    };
  });
  expect(contrastRatio(colours.waiting, colours.canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(colours.border, colours.canvas)).toBeGreaterThanOrEqual(3);
  expect(contrastRatio(colours.summary, colours.canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(colours.toggle, colours.canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(colours.text, colours.planBackground)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(colours.primary, colours.primaryBackground)).toBeGreaterThanOrEqual(4.5);

  for (const [press, expected] of [
    ["Accept", "Accepted"],
    ["Reject", "Rejected"],
  ] as const) {
    const reset = page.locator("#plan").getByRole("button", { name: "Reset demo" });
    if (await reset.isVisible()) await reset.click();
    await plan.getByRole("button", { name: press, exact: true }).click();
    const line = plan.locator("[data-part='decision']");
    await expect(line).toHaveText(expected);
    const colour = await line.evaluate((element) => getComputedStyle(element).color);
    expect(contrastRatio(colour, colours.canvas), expected).toBeGreaterThanOrEqual(4.5);
  }
});

test("in a chat, the plan waits; Accept and use auto mode carries on in that mode", async ({ page }) => {
  const chat = page.locator("#chat ai-chat");
  await chat.getByRole("button", { name: "Refactor the chat shell" }).click();
  const plan = chat.locator("ai-plan");
  await expect(plan).toBeVisible();
  await expect(chat).toHaveAttribute("waiting", "");
  await expect(chat.getByRole("textbox", { name: "Prompt" })).toHaveAttribute("placeholder", "Accept or reject the plan above, or say what to change");
  await plan.getByRole("button", { name: "Accept and use auto mode" }).click();
  await expect(chat.locator("ai-message:not([from='user'])").last()).toContainText("Starting on step 1 in auto mode.");
  await expect(chat).not.toHaveAttribute("waiting", "");
});

test("in a chat, typing while the plan waits asks for changes", async ({ page }) => {
  const chat = page.locator("#chat ai-chat");
  await chat.getByRole("button", { name: "Refactor the chat shell" }).click();
  await expect(chat.locator("ai-plan")).toBeVisible();
  await chat.getByRole("textbox", { name: "Prompt" }).fill("Do it in two steps");
  await chat.getByRole("textbox", { name: "Prompt" }).press("Enter");
  await expect(chat.locator("ai-plan [data-part='decision']")).toHaveText("Asked for changes: “Do it in two steps”");
  await expect(chat.locator("ai-message:not([from='user'])").last()).toContainText("Got it: Do it in two steps.");
});

test("a plan fits a phone screen, with the buttons stacked", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const plan = page.locator("#plan ai-plan");
  await plan.scrollIntoViewIfNeeded();
  await plan.getByRole("button", { name: "Open plan" }).click();
  expect(await sidewaysOverflow(page)).toBe(0);
  const accept = await plan.locator("[data-part='primary']").boundingBox();
  const reject = await plan.locator("[data-part='secondary']").boundingBox();
  expect(accept!.y).toBeLessThan(reject!.y);
});
