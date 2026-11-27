import { expect, test } from "./fixtures";

test.use({ viewport: { width: 1000, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.goto("/experiments/ai-composer.html");
});

const example = (page: import("@playwright/test").Page, id: string) => page.locator(`#${id}`);

test("every example renders, prompts have their own ids, and the minimal one is only Send", async ({ page }) => {
  const composers = page.locator("ai-composer");
  await expect(page.locator("ai-composer [data-part='card']")).toHaveCount(await composers.count());
  const ids = await page.locator("ai-composer textarea").evaluateAll((fields) => fields.map((field) => field.id));
  expect(new Set(ids).size).toBe(ids.length);
  await expect(example(page, "minimal").locator("ai-composer").getByRole("button")).toHaveCount(1);
});

test("attachment rules turn a file away with a message and an event", async ({ page }) => {
  const section = example(page, "attachments");
  const chooser = page.waitForEvent("filechooser");
  await section.getByRole("button", { name: "Attach files" }).click();
  await (await chooser).setFiles({ name: "setup.exe", mimeType: "application/octet-stream", buffer: Buffer.from("x") });
  await expect(section.locator("[data-part='status']")).toHaveText("setup.exe wasn't attached: that type of file isn't accepted.");
  await expect(section.locator(".event-log")).toHaveText(/^filereject/);
});

test("@ search loads matches, and options can be disabled or described", async ({ page }) => {
  const section = example(page, "search");
  await section.getByRole("textbox").click();
  await page.keyboard.type("@comp");
  await expect(section.getByRole("option", { name: /ai-composer\.ts/ })).toBeVisible();
  await page.keyboard.press("Escape");

  await section.getByRole("combobox", { name: "Model" }).click();
  await expect(page.getByRole("option", { name: /Legacy/ })).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("option", { name: /Haiku/ })).toContainText("Fastest");
});

test("the streaming example stops on Stop", async ({ page }) => {
  const section = example(page, "streaming");
  await section.getByRole("textbox").fill("Hi");
  await section.getByRole("textbox").press("Enter");
  await expect(section.locator("ai-thinking")).toBeVisible();
  await section.getByRole("button", { name: "Stop" }).click();
  await expect(section.locator(".mini-transcript")).toContainText("Stopped");
  await expect(section.locator(".event-log")).toHaveText(/^promptstop/);
});

test("slots place your own buttons in the bar and your own footer", async ({ page }) => {
  const section = example(page, "slots");
  await expect(section.locator("[data-part='start'] ui-toggle")).toHaveCount(1);
  await expect(section.locator("[data-part='footer']")).toContainText("AI can make mistakes");
  const toggle = section.getByRole("button", { name: /Web search/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});

test("custom properties and rows restyle the composer", async ({ page }) => {
  const section = example(page, "theme");
  await section.getByRole("textbox").fill("x");
  await expect(section.locator("[data-part='send-button']")).toHaveCSS("background-color", "rgb(109, 40, 217)");
  expect((await section.getByRole("textbox").boundingBox())!.height).toBeGreaterThanOrEqual(72);
});

test("a translated composer adds lines with Enter and sends with Ctrl+Enter", async ({ page }) => {
  const section = example(page, "localized");
  const field = section.getByRole("textbox", { name: "Message" });
  await expect(section.getByRole("button", { name: "Joindre des fichiers" })).toBeVisible();
  await field.click();
  await page.keyboard.type("Bonjour");
  await page.keyboard.press("Enter");
  await expect(field).toHaveValue("Bonjour\n");
  await page.keyboard.press("Control+Enter");
  await expect(field).toHaveValue("");
  await expect(section.locator(".event-log")).toHaveText(/^promptsubmit/);
});

test("right to left mirrors the bar, and two composers are separately named groups", async ({ page }) => {
  const rtl = example(page, "rtl");
  const attach = await rtl.getByRole("button", { name: "إرفاق ملفات" }).boundingBox();
  const send = await rtl.locator("[data-part='send-button']").boundingBox();
  expect(attach!.x).toBeGreaterThan(send!.x);

  const groups = await example(page, "two")
    .locator("ai-composer")
    .evaluateAll((composers) => composers.map((composer) => `${composer.getAttribute("role")}:${composer.getAttribute("aria-label")}`));
  expect(groups).toEqual(["group:Prompt", "group:Reply to review"]);
});

test("the playground changes a live composer and writes its code", async ({ page }) => {
  const playground = example(page, "playground");
  const code = playground.locator(".playground-code");
  await expect(code).toContainText('default-model="sonnet-5.5"');
  await expect(code).not.toContainText("voice");

  await playground.getByRole("switch", { name: "Voice", exact: true }).click();
  await expect(playground.locator("ai-composer [data-part='voice']")).toHaveCount(1);
  await expect(code).toContainText("  voice");

  await playground.getByRole("switch", { name: "Mode", exact: true }).click();
  await expect(playground.locator("ai-composer").getByRole("radiogroup")).toHaveCount(0);
  await expect(code).not.toContainText("defaultModes");

  await playground.getByRole("slider", { name: "Corner radius" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(code).toContainText("--ai-composer-radius: 21px");

  await playground.locator("input[type='color']").fill("#ff0000");
  await expect(code).toContainText("--ai-composer-accent: #ff0000");
  await expect(code).toContainText("--ai-composer-accent-text: #ffffff");

  await playground.getByRole("radio", { name: "Ctrl+Enter" }).click();
  await expect(code).toContainText('submit-on="mod-enter"');
});

test("the messages example streams the reply again on Retry", async ({ page }) => {
  const reply = example(page, "messages").locator(".sample-reply");
  await reply.getByRole("button", { name: "Retry" }).click();
  await expect(reply).toHaveAttribute("streaming");
  await expect(reply).not.toHaveAttribute("streaming");
  await expect(reply.locator("table")).toHaveCount(1);
});

test("the transcript example offers Jump to latest after scrolling up", async ({ page }) => {
  const section = example(page, "transcript");
  const transcript = section.locator("ai-transcript");
  await section.getByRole("button", { name: "Add a long reply" }).click();
  await expect.poll(() => transcript.evaluate((element) => element.scrollHeight > element.clientHeight + 150)).toBe(true);
  await transcript.evaluate((element) => element.scrollBy(0, -200));
  const jump = section.getByRole("button", { name: "Jump to latest" });
  await expect(jump).toBeVisible();
  await jump.click();
  await expect
    .poll(() => transcript.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight < 30))
    .toBe(true);
  await expect(jump).toBeHidden();
});

test("the syntax example colours every language, and colouring can be turned off", async ({ page }) => {
  const section = example(page, "syntax");
  const blocks = section.locator(".syntax-sample pre code");
  await expect(blocks).toHaveCount(6);
  for (const block of await blocks.all()) await expect(block.locator("[data-token]").first()).toBeAttached();

  await section.getByRole("button", { name: "Colouring on" }).click();
  await expect(section.locator(".syntax-sample [data-token]")).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Colouring off" })).toHaveAttribute("aria-pressed", "false");
});

test("the chat list example adds a chat and logs its events", async ({ page }) => {
  const list = example(page, "chat-list").locator("ai-chat-list");
  await list.getByRole("button", { name: "New chat" }).click();
  await expect(list.locator("[data-part='chat']").first()).toHaveText("New chat 1");
  await expect(example(page, "chat-list").locator(".event-log")).toHaveText(/^chatnew/);
});

test("the thinking examples show their labels and summaries", async ({ page }) => {
  const labels = example(page, "thinking").locator("[data-part='label']");
  await expect(labels.nth(1)).toHaveText("Searching files…");
  // One example finishes after three seconds.
  await expect(labels.nth(3)).toHaveText("Thought for 3s", { timeout: 6_000 });
});

test.describe("with Reduce motion turned on", () => {
  test.use({ reducedMotion: "reduce" });

  test("the shimmer becomes a gentle colour change", async ({ page }) => {
    const label = example(page, "thinking").locator("ai-thinking [data-part='label']").first();
    await expect(label).toHaveCSS("animation-name", "ai-thinking-fade");
    await expect(label).toHaveCSS("background-image", "none");
  });
});

test("each example's code has a Copy button", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/experiments/ai-composer.html");
  const section = page.locator("#approval");
  await section.getByText("Code", { exact: true }).click();
  await section.getByRole("button", { name: "Copy code" }).first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("<ai-approval");
});
