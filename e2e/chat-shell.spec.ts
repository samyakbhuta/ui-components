import { ask, expect, fakeSpeech, sidewaysOverflow, skipThinking, syntaxContrast, test, waitForReply } from "./fixtures";

test.use({ viewport: { width: 900, height: 760 }, permissions: ["clipboard-read", "clipboard-write"] });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(fakeSpeech);
  await page.goto("/experiments/chat-shell.html");
});

const prompt = (page: import("@playwright/test").Page) => page.getByRole("textbox", { name: "Prompt" });
const sendButton = (page: import("@playwright/test").Page) => page.locator("[data-part='send-button']");
const userMessages = (page: import("@playwright/test").Page) => page.locator("ai-message[from='user']");
const replies = (page: import("@playwright/test").Page) => page.locator("ai-message:not([from='user'])");

test("Send waits for text, Shift+Enter adds a line, the box grows, and Enter sends", async ({ page }) => {
  const box = prompt(page);
  await expect(sendButton(page)).toHaveAttribute("aria-disabled", "true");
  await box.click();
  await page.keyboard.type("Hello");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("world");
  await expect(box).toHaveValue("Hello\nworld");
  await expect(sendButton(page)).not.toHaveAttribute("aria-disabled", "true");
  expect((await box.boundingBox())!.height).toBeGreaterThan(40);

  await page.keyboard.press("Enter");
  await expect(userMessages(page)).toHaveCount(1);
  await expect(box).toHaveValue("");
});

test("a reply thinks with a shimmer, then streams in as Markdown with readable code colours", { tag: "@theme" }, async ({ page }) => {
  await prompt(page).fill("Hello");
  await page.keyboard.press("Enter");

  const thinking = replies(page).first().locator("ai-thinking");
  const label = thinking.locator("[data-part='label']");
  await expect(label).toHaveAttribute("data-shimmer");
  const shimmer = await label.evaluate((element) => ({
    animation: getComputedStyle(element).animationName,
    clip: getComputedStyle(element).backgroundClip,
  }));
  expect(shimmer.animation).toBe("ai-thinking-shimmer");
  expect(shimmer.clip).toContain("text");
  await expect(sendButton(page)).toHaveAttribute("aria-label", "Stop");
  await expect(page.locator("ai-transcript")).toHaveAttribute("aria-busy", "true");

  await waitForReply(page);
  await expect(label).toHaveText(/^Thought for \ds$/);
  await expect(replies(page).first().locator("[data-part='body'] p").first()).toHaveText(/^This is a pretend reply from Sonnet 5\.5/);
  await expect(page.locator("ai-transcript")).not.toHaveAttribute("aria-busy");

  const colours = await syntaxContrast(replies(page).first());
  expect(colours.kinds.length, colours.kinds.join(", ")).toBeGreaterThanOrEqual(4);
  expect(colours.worst.ratio, `${colours.worst.token} is the least readable`).toBeGreaterThanOrEqual(4.5);

  await thinking.locator("summary").click();
  await expect(thinking.locator("details")).toHaveJSProperty("open", true);
});

test("Stop ends a reply part way, and focus goes back to the prompt", async ({ page }) => {
  await prompt(page).fill("Another");
  await page.keyboard.press("Enter");
  await expect(replies(page).first().locator("ai-thinking")).toBeVisible();
  await sendButton(page).click();
  await waitForReply(page);
  await expect(replies(page).first().locator(".message-meta")).toHaveText("Stopped");
  await expect(prompt(page)).toBeFocused();
});

test("/ lists commands and @ lists references, and Enter picks from the list instead of sending", async ({ page }) => {
  const box = prompt(page);
  const listbox = page.getByRole("listbox");
  await box.click();
  await page.keyboard.type("/ex");
  await expect(listbox.getByRole("option", { name: "explain" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(box).toHaveValue("/explain ");
  await expect(userMessages(page)).toHaveCount(0);

  await page.keyboard.type("@pack");
  await expect(listbox.getByRole("option", { name: "package.json" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(box).toHaveValue("/explain @package.json ");
  await page.keyboard.press("Enter");
  await expect(userMessages(page).first().locator(".message-meta")).toHaveText(/Command: \/explain · References: @package\.json/);
});

test("Mode, Model and Thinking go with the prompt, and thinking off skips the indicator", async ({ page }) => {
  await page.getByRole("radio", { name: "Plan" }).click();
  await page.getByRole("combobox", { name: "Model" }).click();
  await page.getByRole("option", { name: /Opus 5\.5/ }).click();
  await page.getByRole("combobox", { name: "Thinking" }).click();
  await page.getByRole("option", { name: "Off" }).click();
  await ask(page, "Quick one");
  await expect(userMessages(page).last().locator(".message-meta")).toHaveText(/^Plan · Opus 5\.5 · Thinking: Off/);
  await expect(replies(page).last().locator("ai-thinking")).toHaveCount(0);
});

test("files attach through the file picker, and voice input adds what's said", async ({ page }) => {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files" }).click();
  await (await chooser).setFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.locator("[data-part='attachment-name']")).toHaveText("notes.txt");

  const voice = page.getByRole("button", { name: "Voice input" });
  await voice.click();
  await expect(prompt(page)).toHaveValue(/hello from voice/);
  await expect(voice).toHaveAttribute("aria-pressed", "false");
});

test("/clear from the list empties the conversation and brings the empty state back", async ({ page }) => {
  await skipThinking(page);
  await ask(page, "Hello");
  await expect(page.locator("ai-message")).toHaveCount(2);
  await prompt(page).click();
  await page.keyboard.type("/clea");
  await expect(page.getByRole("option", { name: "clear" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("ai-message")).toHaveCount(0);
  await expect(page.locator(".transcript-empty")).toBeVisible();
});

test("ArrowUp and ArrowDown walk through earlier prompts and back to the draft", async ({ page }) => {
  await skipThinking(page);
  await ask(page, "first");
  await ask(page, "second");
  const box = prompt(page);
  await box.focus();
  await page.keyboard.press("ArrowUp");
  await expect(box).toHaveValue("second");
  await page.keyboard.press("ArrowUp");
  await expect(box).toHaveValue("first");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(box).toHaveValue("");
});

test("a draft and the choices survive a reload", async ({ page }) => {
  await page.getByRole("combobox", { name: "Thinking" }).click();
  await page.getByRole("option", { name: "Off" }).click();
  await prompt(page).fill("a draft to keep");
  // The composer saves a moment after the last change.
  await page.waitForTimeout(400);
  await page.reload();
  await expect(prompt(page)).toHaveValue("a draft to keep");
  await expect(page.getByRole("combobox", { name: "Thinking" })).toContainText("Off");
});

test("a suggestion sends, and Copy, Retry and Edit work on the messages", async ({ page }) => {
  await skipThinking(page);
  await page.getByRole("button", { name: "Write a haiku about web components" }).click();
  await waitForReply(page);
  const haiku = replies(page).last();
  await expect(haiku).toContainText("Custom tags bloom");

  await haiku.getByRole("button", { name: "Copy" }).click();
  await expect(haiku.locator("[data-part='actions'] button").first()).toHaveAttribute("aria-label", "Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Custom tags bloom —\n\*shadow roots/);

  await haiku.getByRole("button", { name: "Retry" }).click();
  await waitForReply(page);
  await expect(replies(page)).toHaveCount(1);
  await expect(replies(page).last()).toContainText("Custom tags bloom");

  await userMessages(page).last().getByRole("button", { name: "Edit" }).click();
  await expect(prompt(page)).toHaveValue("Write a haiku about web components");
  await expect(prompt(page)).toBeFocused();
});

test("the conversation follows a streaming reply, stays put when scrolled up, and Jump to latest returns", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 560 });
  await skipThinking(page);
  await ask(page, "Write a haiku about web components");
  await prompt(page).fill("Show me a long reply");
  await page.keyboard.press("Enter");

  const transcript = page.locator("ai-transcript");
  const atBottom = () => transcript.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight < 30);
  await expect.poll(() => transcript.evaluate((element) => element.scrollHeight > element.clientHeight + 200)).toBe(true);
  await expect.poll(atBottom).toBe(true);

  await transcript.evaluate((element) => element.scrollBy(0, -400));
  const jump = page.getByRole("button", { name: "Jump to latest" });
  await expect(jump).toBeVisible();
  await waitForReply(page);
  expect(await atBottom()).toBe(false);

  await jump.click();
  await expect.poll(atBottom).toBe(true);
  await expect(jump).toBeHidden();
});

test("a rich reply renders a table, a list and coloured code, shows HTML as text, and code copies on its own", async ({ page }) => {
  await skipThinking(page);
  await ask(page, "Show me a rich reply");
  const reply = replies(page).last();
  await expect(reply.locator("table")).toHaveCount(1);
  await expect(reply.locator("ol li")).toHaveCount(3);
  await expect(reply.locator("pre code")).toHaveCount(2);
  await expect(reply.locator("pre code").first().locator("[data-token='keyword']").first()).toBeVisible();
  await expect(reply.locator("blockquote")).toContainText("<b>this</b>");
  await expect(reply.locator("blockquote b")).toHaveCount(0);

  await reply.getByRole("button", { name: "Copy ts code" }).click();
  await expect(reply.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^composer\.addEventListener\("promptsubmit"/);
});

test("a long paste becomes an attachment, images show a thumbnail, and a counter appears near the limit", async ({ page }) => {
  const box = prompt(page);
  await page.evaluate(() => navigator.clipboard.writeText("log line\n".repeat(300)));
  await box.focus();
  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.locator("[data-part='attachment-name']")).toHaveText(["Pasted text.txt"]);
  await expect(box).toHaveValue("");

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach files" }).click();
  await (await chooser).setFiles({ name: "dot.png", mimeType: "image/png", buffer: png });
  const thumbnail = page.locator("[data-part='attachment']", { hasText: "dot.png" }).locator("img");
  await expect(thumbnail).toBeVisible();
  await expect(thumbnail).toHaveAttribute("src", /^blob:/);

  await box.fill("x".repeat(6500));
  await expect(page.locator("[data-part='counter']")).toHaveText("6,500 / 8,000");
});

test("Tab goes through the composer bar in order", async ({ page }) => {
  await prompt(page).focus();
  const order: string[] = [];
  for (let step = 0; step < 6; step++) {
    await page.keyboard.press("Tab");
    order.push(
      await page.evaluate(() => {
        const element = document.activeElement as HTMLElement;
        return (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().split(/\s+/)[0];
      }),
    );
  }
  expect(order).toEqual(["Attach", "Auto", "Model", "Thinking", "Voice", "Send"]);
});

test("on a phone there's no sideways scrolling and the hint makes room", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 });
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  await expect(page.locator("[data-part='hint']")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
});

test.describe("without speech recognition", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const speech = window as unknown as Record<string, unknown>;
      delete speech.SpeechRecognition;
      delete speech.webkitSpeechRecognition;
    });
    await page.goto("/experiments/chat-shell.html");
  });

  test("voice is greyed out with a reason", async ({ page }) => {
    const voice = page.getByRole("button", { name: "Voice input" });
    await expect(voice).toBeDisabled();
    await expect(voice).toHaveAttribute("title", /isn't supported/);
  });
});
