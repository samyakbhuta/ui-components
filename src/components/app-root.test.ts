import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { beforeAll, expect, test } from "vitest";

const agent = createAgent();

beforeAll(async () => {
  await import("./app-root.ts");
});

async function renderApp() {
  document.body.innerHTML = "<app-root></app-root>";
  const shadow = document.querySelector("app-root")!.shadowRoot!;
  await settle();
  // Testing Library's queries only need querySelectorAll, which a shadow root has.
  const view = within(shadow as unknown as HTMLElement);
  const input = view.getByRole<HTMLInputElement>("searchbox", { name: "Search" });
  return { shadow, view, input };
}

test("the search field is named, and Clear stays hidden while it's empty", async () => {
  const { view, input } = await renderApp();

  expect(input.value).toBe("");
  expect(input.placeholder).toBe("Search");
  expect(view.queryByRole("button", { name: "Clear" })).toBeNull();
  for (const name of ["aria-invalid", "aria-disabled", "data-filled", "data-disabled", "data-readonly", "data-required"]) {
    expect(input.hasAttribute(name), name).toBe(false);
  }
});

test("typing shows Clear, and pressing it empties the field and puts focus back in it", async () => {
  const user = userEvent.setup();
  const { shadow, view, input } = await renderApp();

  await user.type(input, "ui-sdk");
  expect(input.hasAttribute("data-filled")).toBe(true);
  await user.click(view.getByRole("button", { name: "Clear" }));

  expect(input.value).toBe("");
  expect(shadow.activeElement).toBe(input);
  expect(view.queryByRole("button", { name: "Clear" })).toBeNull();
});

test.each(["[Enter]", "[Space]"])("Clear works from the keyboard with %s", async (key) => {
  const user = userEvent.setup();
  const { shadow, view, input } = await renderApp();

  await user.type(input, "ui-sdk");
  // user-event's Tab doesn't look inside shadow roots, so focus the button directly.
  view.getByRole("button", { name: "Clear" }).focus();
  await user.keyboard(key);

  expect(input.value).toBe("");
  expect(shadow.activeElement).toBe(input);
});

test("an agent can find the search field, fill it and clear it", async () => {
  const { view, input } = await renderApp();

  const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more");
  for (const entry of components) {
    expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
  }
  expect(components.map((entry) => entry.label)).toContain("Search");

  const filled = await agent.act({ steps: [{ ref: "Search", action: "setValue", args: ["ui-sdk"] }] });
  expect(filled.ok, filled.error?.message).toBe(true);
  expect(input.value).toBe("ui-sdk");
  expect(view.getByRole("button", { name: "Clear" })).toBeDefined();

  const cleared = await agent.act({ steps: [{ ref: "Search", action: "clear" }] });
  expect(cleared.ok, cleared.error?.message).toBe(true);
  expect(input.value).toBe("");
  expect(view.queryByRole("button", { name: "Clear" })).toBeNull();
});
