import { expect, test } from "./fixtures";

test("the showcase links to each experiment", async ({ page }) => {
  await page.goto("/showcase.html");
  await page.getByRole("link", { name: "AI chat app shell" }).click();
  await expect(page).toHaveURL(/\/experiments\/chat-shell\.html$/);
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();

  await page.goBack();
  await page.getByRole("link", { name: /docs and playground/ }).click();
  await expect(page).toHaveURL(/\/experiments\/ai-composer\.html$/);
  await expect(page.getByRole("heading", { name: "AI chat components" })).toBeVisible();

  await page.goBack();
  await page.getByRole("link", { name: "Search field" }).click();
  await expect(page).toHaveURL(/\/experiments\/search-field\.html$/);
});

test("each experiment links back to the showcase", async ({ page }) => {
  for (const path of ["/experiments/chat-shell.html", "/experiments/ai-composer.html"]) {
    await page.goto(path);
    await page.getByRole("link", { name: "← Showcase" }).first().click();
    await expect(page).toHaveURL(/\/showcase\.html$/);
  }
});
