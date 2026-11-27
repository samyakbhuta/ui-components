import { contrastRatio, expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("/experiments/search-field.html");
});

test("Clear shows only while there's text, and puts focus back in the field", async ({ page }) => {
  const field = page.getByRole("searchbox", { name: "Search" });
  const clear = page.getByRole("button", { name: "Clear" });
  await expect(clear).toBeHidden();

  await field.fill("web components");
  await expect(clear).toBeVisible();
  await clear.click();
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
  await expect(clear).toBeHidden();
});

test("Clear works from the keyboard, and Escape empties the field too", async ({ page }) => {
  const field = page.getByRole("searchbox", { name: "Search" });
  const clear = page.getByRole("button", { name: "Clear" });
  await field.focus();
  await page.keyboard.type("abc");
  await page.keyboard.press("Tab");
  await expect(clear).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();

  await page.keyboard.type("xyz");
  await page.keyboard.press("Escape");
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
});

test("the field shows a focus ring and readable colours", { tag: "@theme" }, async ({ page }) => {
  const field = page.getByRole("searchbox", { name: "Search" });
  await field.focus();
  const styles = await field.evaluate((input) => {
    const group = input.closest("[data-slot='input-group']")!;
    const page = getComputedStyle(document.body).backgroundColor;
    return {
      ring: getComputedStyle(group).outlineStyle,
      placeholder: getComputedStyle(input, "::placeholder").color,
      field: getComputedStyle(group).backgroundColor,
      border: getComputedStyle(group).borderTopColor,
      page: page === "rgba(0, 0, 0, 0)" ? getComputedStyle(group).backgroundColor : page,
    };
  });
  expect(styles.ring).toBe("auto");
  expect(contrastRatio(styles.placeholder, styles.field), "placeholder against the field").toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(styles.border, styles.field), "border against the field").toBeGreaterThanOrEqual(3);
});
