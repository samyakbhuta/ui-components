import { contrastRatio, expect, sidewaysOverflow, test } from "./fixtures";

// The guides and component READMEs, rendered as site pages by scripts/guide-pages.mjs.

const pages = [
  "/guides/using-the-components.html",
  "/guides/making-ai-chat-your-own.html",
  ...[
    "ai-chat",
    "ai-composer",
    "ai-message",
    "ai-transcript",
    "ai-thinking",
    "ai-tool-call",
    "ai-sources",
    "ai-suggestions",
    "ai-question",
    "ai-approval",
    "ai-chat-list",
  ].map((name) => `/guides/components/${name}.html`),
];

test("every page loads with its heading, marks itself in the list, and links to its Markdown on GitHub", async ({ page }) => {
  for (const path of pages) {
    await page.goto(path);
    await expect(page.locator(".guide-content h1")).toBeVisible();
    await expect(page.locator(`.guide-nav a[href="${path}"]`)).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Edit this page on GitHub" })).toHaveAttribute("href", /^https:\/\/github\.com\/samyakbhuta\/ui-components\/blob\/main\/.+\.md$/);
  }
});

test("the front page leads to the guides, and a link between guides lands on its section", async ({ page }) => {
  await page.route("https://data.jsdelivr.com/**", (route) => route.fulfill({ json: { version: "0.1.0-beta.9" } }));
  await page.goto("/");
  await page.getByRole("link", { name: "Read the guide" }).click();
  await expect(page).toHaveURL(/\/guides\/using-the-components\.html$/);
  await page.getByRole("link", { name: "Making <ai-chat> your own" }).first().click();
  await expect(page).toHaveURL(/\/guides\/making-ai-chat-your-own\.html$/);

  // "Going further" in recipe 3 goes to <ai-chat>'s Translation section.
  await page.getByRole("link", { name: "chat's Translation table" }).click();
  await expect(page).toHaveURL(/\/guides\/components\/ai-chat\.html#translation$/);
  await expect(page.getByRole("heading", { name: "Translation" })).toBeInViewport();

  // "See it running" opens the live recipe on this same site.
  await page.goBack();
  await expect(page.getByRole("link", { name: /\/recipes\/ai-chat\/welcome\.html$/ })).toHaveAttribute("href", "/recipes/ai-chat/welcome.html");
});

test("code is coloured and copies as written", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/guides/making-ai-chat-your-own.html");
  const block = page.locator(".copy-block").filter({ hasText: "AI chat with a welcome" });
  await expect(block.locator("[data-token]").first()).toBeVisible();
  await block.getByRole("button", { name: "Copy html example" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.startsWith("<!doctype html>\n")).toBe(true);
  expect(copied).toContain('<h2 slot="empty">What can I help with?</h2>');
});

test("the text, links, code and current page are readable @theme", async ({ page }) => {
  await page.goto("/guides/making-ai-chat-your-own.html");
  const colours = await page.evaluate(() => {
    const style = (element: Element) => getComputedStyle(element);
    const background = style(document.body).backgroundColor;
    const pre = document.querySelector(".guide-content pre")!;
    return {
      background,
      text: style(document.querySelector(".guide-content p")!).color,
      link: style(document.querySelector(".guide-content a")!).color,
      heading: style(document.querySelector(".guide-nav h2")!).color,
      current: style(document.querySelector(".guide-nav [aria-current]")!).color,
      currentBackground: style(document.querySelector(".guide-nav [aria-current]")!).backgroundColor,
      code: style(pre).backgroundColor,
      tokens: [...document.querySelectorAll(".guide-content pre [data-token]")].map((token) => style(token).color),
    };
  });
  // The page's own background is the canvas: transparent on body means Canvas.
  const canvas = colours.background === "rgba(0, 0, 0, 0)" ? await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement("div"));
    probe.style.background = "Canvas";
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  }) : colours.background;
  expect(contrastRatio(colours.text, canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(colours.link, canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(colours.heading, canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(colours.current, colours.currentBackground)).toBeGreaterThanOrEqual(4.5);
  expect(colours.tokens.length).toBeGreaterThan(50);
  const worst = Math.min(...colours.tokens.map((token) => contrastRatio(token, colours.code)));
  expect(worst).toBeGreaterThanOrEqual(4.5);
});

test("on a phone, the list of guides starts closed and nothing scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const path of ["/guides/using-the-components.html", "/guides/components/ai-composer.html"]) {
    await page.goto(path);
    await expect(page.locator(".guide-nav details")).not.toHaveAttribute("open", "");
    expect(await sidewaysOverflow(page)).toBe(0);
  }
  // Wide tables scroll on their own, and keyboard users can reach them.
  await expect(page.locator(".guide-table").first()).toHaveAttribute("tabindex", "0");
});
