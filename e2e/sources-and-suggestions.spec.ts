import { contrastRatio, expect, skipThinking, test, waitForReply } from "./fixtures";

test.use({ viewport: { width: 1000, height: 900 } });

test.describe("on the docs page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/ai-composer.html");
  });

  test("citations link to their sources and preview them on hover and keyboard focus", async ({ page }) => {
    const section = page.locator("#sources");
    const first = section.getByRole("link", { name: "Source 3: Custom elements" });
    await expect(first).toHaveAttribute("href", "https://html.spec.whatwg.org/multipage/custom-elements.html");
    await expect(first).toHaveAttribute("target", "_blank");
    await expect(section.locator("ai-message p code")).toHaveText("items[1]");

    await first.hover();
    const preview = section.locator("[data-part='preview']");
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("HTML Standard");
    await expect(preview).toContainText("The specification for defining and upgrading custom elements.");
    await page.mouse.move(0, 0);
    await expect(preview).toBeHidden();

    // Tab from the first citation to the second, as a keyboard user would.
    await first.focus();
    await page.keyboard.press("Tab");
    await expect(section.getByRole("link", { name: "Source 2: Using custom elements" })).toBeFocused();
    await expect(preview).toBeVisible();
    await expect(preview).toContainText("How to define a custom element");
    await page.keyboard.press("Escape");
    await expect(preview).toBeHidden();
  });

  test("Show more opens the rest of the sources and moves focus to the first one", async ({ page }) => {
    const section = page.locator("#sources");
    const list = section.getByRole("list", { name: "Sources" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await section.getByRole("button", { name: "Show 1 more" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list.getByRole("link", { name: "Custom elements", exact: true })).toBeFocused();
  });

  test("source numbers and site names are readable @theme", async ({ page }) => {
    const colours = await page.locator("#sources ai-sources").evaluate((root) => {
      const style = (selector: string) => getComputedStyle(root.querySelector(selector)!);
      const probe = document.body.appendChild(document.createElement("div"));
      probe.style.background = "Canvas";
      const canvas = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        canvas,
        number: style("[data-part='number']").color,
        numberBackground: style("[data-part='number']").backgroundColor,
        site: style("[data-part='site']").color,
        heading: style("[data-part='heading']").color,
      };
    });
    expect(contrastRatio(colours.number, colours.numberBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colours.site, colours.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colours.heading, colours.canvas)).toBeGreaterThanOrEqual(4.5);
  });

  test("a suggestion sends through its composer, and a follow-up fills the box to edit", async ({ page }) => {
    const section = page.locator("#suggestions");
    await section.getByRole("button", { name: "Write a haiku about web components" }).click();
    await expect(section.locator(".event-log")).toHaveText(/^promptsubmit \{"text":"Write a haiku about web components"/);

    await section.getByRole("button", { name: /Explain the README/ }).click();
    const box = section.getByRole("textbox", { name: "Prompt with suggestions" });
    await expect(box).toHaveValue("/explain @README.md");
    await expect(box).toBeFocused();
    await expect(section.locator(".event-log")).toHaveText(/^suggestionselect/);
  });
});

test.describe("in the chat shell", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/experiments/chat-shell.html");
    await skipThinking(page);
  });

  test("a reply cites its sources, and offers follow-ups that send", async ({ page }) => {
    await page.getByRole("button", { name: "What are web components? Cite your sources" }).click();
    await waitForReply(page);
    const reply = page.locator("ai-message:not([from='user'])").last();
    await expect(reply.getByRole("link", { name: "Source 1: Web components" })).toBeVisible();
    await expect(reply.getByRole("list", { name: "Sources" }).getByRole("listitem")).toHaveCount(2);

    await reply.getByRole("list", { name: "Follow-up questions" }).getByRole("button", { name: "How do I test this?" }).click();
    await waitForReply(page);
    await expect(page.locator("ai-message[from='user']").last()).toContainText("How do I test this?");
    await expect(page.locator("ai-suggestions.follow-ups")).toHaveCount(1);
  });
});
