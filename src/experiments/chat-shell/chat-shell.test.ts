import { screen, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { expect, test } from "vitest";
import { mountChatShell } from "./chat-shell.ts";

const agent = createAgent();

async function renderShell() {
  const root = document.createElement("div");
  document.body.append(root);
  mountChatShell(root);
  await settle();
  return {
    prompt: screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Prompt" }),
    send: screen.getByRole("button", { name: "Send" }),
    messages: () => within(screen.getByRole("region", { name: "Conversation" })).queryAllByRole("listitem"),
  };
}

test("the prompt box and Send button are named, and nothing is sent yet", async () => {
  const { prompt, send, messages } = await renderShell();

  expect(prompt.value).toBe("");
  expect(send.getAttribute("type")).toBe("submit");
  expect(send.hasAttribute("aria-disabled")).toBe(false);
  expect(messages()).toHaveLength(0);
});

test("Send adds the prompt to the conversation, empties the box and keeps focus there", async () => {
  const user = userEvent.setup();
  const { prompt, send, messages } = await renderShell();

  await user.type(prompt, "Explain web components");
  await user.click(send);

  expect(messages().map((item) => item.textContent)).toEqual(["Explain web components"]);
  expect(prompt.value).toBe("");
  expect(document.activeElement).toBe(prompt);
});

test("Enter sends, Shift+Enter adds a line, and an empty box sends nothing", async () => {
  const user = userEvent.setup();
  const { prompt, messages } = await renderShell();

  await user.click(prompt);
  await user.keyboard("{Enter}");
  expect(messages()).toHaveLength(0);

  await user.keyboard("first{Shift>}{Enter}{/Shift}second{Enter}");
  expect(messages().map((item) => item.querySelector("p")!.textContent)).toEqual(["first\nsecond"]);
});

// jsdom never reports a trigger match while typing, so typing into the list is checked in a real browser.
test("/ offers commands at the start of the prompt and @ offers files and docs", async () => {
  await renderShell();
  const [slash, at] = document.querySelector("ui-trigger-menu")!.triggers!;
  const labels = (items: unknown) =>
    (items as { label: string; items?: unknown[] }[]).map((item) =>
      item.items ? `${item.label}: ${item.items.join(", ")}` : item.label,
    );

  expect(slash).toMatchObject({ char: "/", boundary: "start" });
  expect(labels(slash.items)).toEqual(["summarize", "explain", "translate", "model", "clear"]);
  expect(at.char).toBe("@");
  expect(labels(at.items)).toEqual([
    "Files: README.md, package.json, src/main.ts, src/components/app-root.ts",
    "Docs: llms.txt, trigger-menu.md, button.md",
  ]);
});

test("a sent prompt notes its command and the files it references", async () => {
  const user = userEvent.setup();
  const { prompt, send, messages } = await renderShell();

  await user.type(prompt, "/explain @package.json and @llms.txt");
  await user.click(send);

  expect(messages()[0].querySelector(".message-meta")!.textContent).toBe(
    "Command: /explain · References: @package.json, @llms.txt",
  );
});

test("/clear empties the conversation", async () => {
  const user = userEvent.setup();
  const { prompt, messages } = await renderShell();

  await user.type(prompt, "hello{Enter}");
  expect(messages()).toHaveLength(1);
  await user.type(prompt, "/clear{Enter}");

  expect(messages()).toHaveLength(0);
  expect(prompt.value).toBe("");
});

test("an agent can find the prompt box and Send, write a command with a reference and send it", async () => {
  const { prompt, messages } = await renderShell();

  const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more");
  for (const entry of components) {
    expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
  }
  const labels = components.map((entry) => entry.label);
  expect(labels).toContain("Prompt");
  expect(labels).toContain("Send");

  const result = await agent.act({
    steps: [
      { ref: "Prompt", action: "setValue", args: ["/summarize @README.md"] },
      { ref: "Send", action: "press" },
    ],
  });
  expect(result.ok, result.error?.message).toBe(true);
  expect(messages()[0].textContent).toBe("/summarize @README.mdCommand: /summarize · References: @README.md");
  expect(prompt.value).toBe("");
});
