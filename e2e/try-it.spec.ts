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
});

test("the quick start shows the one-tag chat first, and the parts version is a tab away", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const quickStart = page.locator(".home-start-tabs");
  await expect(quickStart.getByRole("tab", { name: "One tag" })).toHaveAttribute("aria-selected", "true");
  await expect(quickStart.getByRole("button", { name: "Copy parts example" })).toBeHidden();

  await quickStart.getByRole("tab", { name: "One tag" }).press("ArrowRight");
  await expect(quickStart.getByRole("tab", { name: "From the parts" })).toBeFocused();
  await expect(quickStart.getByRole("tab", { name: "From the parts" })).toHaveAttribute("aria-selected", "true");
  await expect(quickStart.getByRole("button", { name: "Copy quick start" })).toBeHidden();
  await quickStart.getByRole("button", { name: "Copy parts example" }).click();
  const parts = await page.evaluate(() => navigator.clipboard.readText());
  expect(parts).toContain("<ai-composer></ai-composer>");
  expect(parts).not.toContain("<ai-chat");
  await quickStart.getByRole("button", { name: "Copy parts starter command" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npx degit samyakbhuta/ui-components/examples/from-parts my-chat");
});

test("Open in StackBlitz sends the starter's files to StackBlitz, in a new tab", async ({ page, context }) => {
  // Catch the request rather than open StackBlitz.
  const sent = new Promise<{ url: string; form: URLSearchParams }>((resolve) =>
    context.route("https://stackblitz.com/**", async (route) => {
      resolve({ url: route.request().url(), form: new URLSearchParams(route.request().postData() ?? "") });
      await route.fulfill({ contentType: "text/html", body: "<title>StackBlitz</title>" });
    }),
  );
  await page.goto("/");
  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Open in StackBlitz" }).click()]);
  const { url, form } = await sent;
  expect(url).toBe("https://stackblitz.com/run?file=index.html");
  expect(form.get("project[template]")).toBe("node");
  expect(form.get("project[files][index.html]")).toContain('import "@samyakbhuta/ui-components";');
  expect(form.get("project[files][index.html]")).toContain("<ai-chat");
  expect(JSON.parse(form.get("project[files][package.json]")!).dependencies).toHaveProperty("@samyakbhuta/ui-components");
  expect(form.get("project[files][README.md]")).toContain("# AI chat quick start");
  // A new tab, which can't reach back into this page.
  expect(await tab.evaluate(() => window.opener)).toBeNull();
});
