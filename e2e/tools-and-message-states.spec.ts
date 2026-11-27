import { contrastRatio, expect, skipThinking, test, waitForReply } from "./fixtures";

test.use({ viewport: { width: 1000, height: 900 } });

/** The colour behind an element: its own background, or the nearest ancestor's that isn't transparent. */
const backgroundOf = `(element) => {
  for (let node = element; node; node = node.parentElement) {
    const colour = getComputedStyle(node).backgroundColor;
    if (!/rgba\\(0, 0, 0, 0\\)|transparent/.test(colour)) return colour;
  }
  // Nothing sets one, so it's the page's canvas, which follows the colour scheme.
  const probe = document.body.appendChild(document.createElement("div"));
  probe.style.background = "Canvas";
  const canvas = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return canvas;
}`;

test.describe("on the docs page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/ai-composer.html");
  });

  test("tool calls run, finish or fail, and open to show their input and result", async ({ page }) => {
    const section = page.locator("#tools");
    const calls = section.locator("ai-tool-call");
    await expect(calls.first()).toHaveAttribute("aria-busy", "true");
    await expect(calls.nth(2)).toHaveAttribute("data-error", "", { timeout: 10_000 });
    await expect(calls.first()).toHaveAttribute("data-done", "");

    const search = calls.first().locator("summary");
    await expect(search).toHaveText("Found 3 pages");
    await search.focus();
    await page.keyboard.press("Enter");
    await expect(section.getByLabel("Input").first()).toContainText('"query": "custom elements lifecycle"');
    await expect(section.getByLabel("Result").first()).toContainText("Using custom elements");
    await calls.nth(2).locator("summary").click();
    await expect(section.getByLabel("Error")).toHaveText("npm test exited with code 1: 2 of 98 tests failed.");
  });

  test("tool call colours are readable @theme", async ({ page }) => {
    const section = page.locator("#tools");
    await expect(section.locator("ai-tool-call[data-error]")).toHaveCount(1, { timeout: 10_000 });
    const colours = await section.evaluate((root, source) => {
      const background = (0, eval)(source)(root.querySelector("ai-tool-call")) as string;
      const pick = (selector: string) => getComputedStyle(root.querySelector(selector)!).color;
      return {
        background,
        label: pick("ai-tool-call [data-part='label']"),
        done: pick("ai-tool-call[data-done] [data-part='icon']"),
        error: pick("ai-tool-call[data-error] [data-part='icon']"),
      };
    }, backgroundOf);
    expect(contrastRatio(colours.label, colours.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colours.done, colours.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colours.error, colours.background)).toBeGreaterThanOrEqual(3);
  });

  test("a message shows attachments and an error, rates a reply, and steps between versions", async ({ page }) => {
    const section = page.locator("#message-states");
    const files = section.getByRole("list", { name: "Attachments" });
    await expect(files.getByRole("img", { name: "chart.svg" })).toBeVisible();
    await expect(files.getByRole("listitem")).toHaveCount(3);
    await expect(section.locator(".failed-reply [data-part='error']")).toHaveText("The connection dropped. Try again.");

    const reply = section.locator(".rated-reply");
    await reply.getByRole("button", { name: "Good response" }).click();
    await expect(reply.getByRole("button", { name: "Good response" })).toHaveAttribute("aria-pressed", "true");
    await expect(section.locator(".event-log")).toHaveText(/^messagefeedback \{"feedback":"good"/);

    await expect(reply.getByRole("group", { name: "Version 3 of 3" })).toBeVisible();
    await reply.getByRole("button", { name: "Previous version" }).click();
    await expect(reply).toContainText("Sales grew every quarter");
    await expect(reply.getByRole("group", { name: "Version 2 of 3" })).toBeVisible();
    await reply.getByRole("button", { name: "Previous version" }).click();
    await expect(reply.getByRole("button", { name: "Previous version" })).toBeDisabled();
    await expect(reply.getByRole("button", { name: "Next version" })).toBeFocused();
  });

  test("the error's border and icon are readable @theme", async ({ page }) => {
    const colours = await page.locator("#message-states").evaluate((root, source) => {
      const error = root.querySelector(".failed-reply [data-part='error']")!;
      return {
        background: (0, eval)(source)(error) as string,
        border: getComputedStyle(error).borderTopColor,
        icon: getComputedStyle(error.querySelector("svg")!).color,
        text: getComputedStyle(error).color,
      };
    }, backgroundOf);
    expect(contrastRatio(colours.border, colours.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colours.icon, colours.background)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(colours.text, colours.background)).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe("in the chat shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/chat-shell.html");
    await skipThinking(page);
  });

  test("an @reference is read with a tool, and the reply can be rated", async ({ page }) => {
    await page.getByRole("button", { name: "/explain @src/main.ts" }).click();
    await waitForReply(page);
    const reply = page.locator("ai-message:not([from='user'])");
    await expect(reply.locator("ai-tool-call [data-part='label']")).toHaveText("Read src/main.ts");
    await reply.getByRole("button", { name: "Bad response" }).click();
    await expect(reply.getByRole("button", { name: "Bad response" })).toHaveAttribute("aria-pressed", "true");
  });

  test("attached files show on your message", async ({ page }) => {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Attach files" }).click();
    await (await chooser).setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await page.getByRole("textbox", { name: "Prompt" }).fill("What's in this?");
    await page.keyboard.press("Enter");
    await waitForReply(page);
    await expect(page.locator("ai-message[from='user']").getByRole("list", { name: "Attachments" })).toContainText("notes.txt");
  });

  test("a failed reply shows an error, and Retry adds a second version", async ({ page }) => {
    await page.getByRole("button", { name: "Show me a reply that fails" }).click();
    await waitForReply(page);
    const reply = page.locator("ai-message:not([from='user'])");
    await expect(reply.locator("[data-part='error']")).toHaveText("The connection dropped. Press Retry to try again.");
    await reply.getByRole("button", { name: "Retry" }).click();
    await waitForReply(page);
    await expect(reply.getByRole("group", { name: "Version 2 of 2" })).toBeVisible();
    await reply.getByRole("button", { name: "Previous version" }).click();
    await expect(reply.getByRole("group", { name: "Version 1 of 2" })).toBeVisible();
    await expect(reply.locator("[data-part='error']")).toBeHidden();
  });
});

test("the hidden attribute hides every component, and a streaming reply hides its actions", async ({ page }) => {
  await page.goto("/experiments/ai-composer.html");
  const displays = await page.evaluate(() =>
    ["ai-composer", "ai-message", "ai-transcript", "ai-thinking", "ai-tool-call", "ai-chat-list"].map((tag) => {
      const element = document.createElement(tag);
      element.hidden = true;
      document.body.append(element);
      const display = getComputedStyle(element).display;
      element.remove();
      return `${tag}: ${display}`;
    }),
  );
  expect(displays).toEqual(["ai-composer", "ai-message", "ai-transcript", "ai-thinking", "ai-tool-call", "ai-chat-list"].map((tag) => `${tag}: none`));

  const reply = page.locator("#messages .sample-reply");
  await page.locator("#messages .replay").click();
  await expect(reply).toHaveAttribute("streaming", "");
  await expect(reply.getByRole("button", { name: "Copy", exact: true })).toBeHidden();
  await expect(reply).not.toHaveAttribute("streaming", { timeout: 15_000 });
  await expect(reply.getByRole("button", { name: "Copy", exact: true })).toBeVisible();
});
