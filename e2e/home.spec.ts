import { contrastRatio, expect, sidewaysOverflow, test } from "./fixtures";

test("the front page says what the package is, and leads to the chat demo and the docs page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("AI chat components");
  await expect(page.getByRole("heading", { level: 1, name: "AI chat components" })).toBeVisible();
  // npm shows first, until another package manager is chosen.
  await expect(page.locator(".home-install:visible")).toHaveText(
    "npm install @samyakbhuta/ui-components@beta @ui-sdk/web@0.1.0-beta.18 @ui-sdk/core@0.1.0-beta.18",
  );

  await page.getByRole("link", { name: "Try the chat demo" }).click();
  await expect(page).toHaveURL(/\/experiments\/chat-shell\.html$/);
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();

  await page.goBack();
  await page.getByRole("link", { name: "See every component" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "AI chat components" })).toBeVisible();
  await expect(page).toHaveURL(/\/experiments\/ai-composer\.html$/);
});

test("each component links to its live example on the docs page", async ({ page }) => {
  await page.goto("/");
  const links = page.locator(".home-components").getByRole("link", { name: /^<ai-[\w-]+>$/ });
  await expect(links).toHaveCount(10);
  for (const href of await links.evaluateAll((all) => all.map((link) => link.getAttribute("href")!))) {
    const id = href.split("#")[1];
    await page.goto(href);
    await expect(page.locator(`section#${id}`)).toBeVisible();
  }
});

test("npm, GitHub and the changelog are linked, and nothing scrolls sideways on a phone @theme", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "npm" })).toHaveAttribute("href", "https://www.npmjs.com/package/@samyakbhuta/ui-components");
  await expect(page.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/samyakbhuta/ui-components");
  await expect(page.getByRole("link", { name: "Changelog" })).toHaveAttribute("href", /CHANGELOG\.md$/);
  expect(await sidewaysOverflow(page)).toBe(0);

  const colours = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement("div"));
    probe.style.background = "Canvas";
    const canvas = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const primary = getComputedStyle(document.querySelector(".home-primary")!);
    return {
      canvas,
      muted: getComputedStyle(document.querySelector(".home-components p")!).color,
      primary: primary.color,
      primaryBackground: primary.backgroundColor,
    };
  });
  expect(contrastRatio(colours.muted, colours.canvas)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(colours.primary, colours.primaryBackground)).toBeGreaterThanOrEqual(4.5);
});

test("the install command copies for the chosen package manager, which is remembered", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("tab", { name: "pnpm" }).click();
  // Its name changes to "Copied…" and back, so hold on to the element.
  const copy = page.locator("ui-tabs-panel:not([hidden]) .copy-button button");
  await expect(copy).toHaveAccessibleName("Copy pnpm command");
  await copy.click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "pnpm add @samyakbhuta/ui-components@beta @ui-sdk/web@0.1.0-beta.18 @ui-sdk/core@0.1.0-beta.18",
  );
  await expect(copy).toHaveAccessibleName("Copied pnpm command");
  await expect(page.locator(".copy-status")).toHaveText("Copied");

  await page.reload();
  await expect(page.getByRole("tab", { name: "pnpm" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Copy quick start" }).click();
  const quickStart = await page.evaluate(() => navigator.clipboard.readText());
  expect(quickStart).toContain('import "@samyakbhuta/ui-components";');
  expect(quickStart).toContain("<ai-composer></ai-composer>");
});

test("each component card also links to its API reference", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "ai-approval API" })).toHaveAttribute(
    "href",
    "https://github.com/samyakbhuta/ui-components/blob/main/packages/ui-components/src/ai-approval/README.md",
  );
  await expect(page.getByRole("link", { name: /API$/ })).toHaveCount(10);
});
