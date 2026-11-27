import { expect, test } from "./fixtures";

// The front page asks jsDelivr for the newest version; answer for it, so tests don't need the network.
test.beforeEach(async ({ page }) => {
  await page.route("https://data.jsdelivr.com/**", (route) => route.fulfill({ json: { version: "0.1.0-beta.9" } }));
});

test("it shows the version @beta installs today, and hides the line when it can't tell", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".home-version")).toHaveText(/Latest on npm: 0\.1\.0-beta\.9\./);

  await page.unrouteAll();
  await page.route("https://data.jsdelivr.com/**", (route) => route.fulfill({ json: {} }));
  await page.reload();
  await expect(page.locator(".home-version")).toBeHidden();
});

test("No build step copies a script tag, and the starter command copies", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("tab", { name: "No build step" }).click();
  await page.getByRole("button", { name: "Copy script tag" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '<script type="module">\n  import "https://esm.sh/@samyakbhuta/ui-components@beta";\n</script>',
  );
  await page.getByRole("button", { name: "Copy starter command" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npx degit samyakbhuta/ui-components/examples/quick-start my-chat");
  await expect(page.getByRole("link", { name: "Open in StackBlitz" })).toHaveAttribute(
    "href",
    "https://stackblitz.com/github/samyakbhuta/ui-components/tree/main/examples/quick-start",
  );
});
