import { screen, within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { expect, test, vi } from "vitest";
import "./ai-chat-list.ts";
import type { AiChatListElement, ChatSummary } from "./ai-chat-list.ts";

const hour = 60 * 60 * 1000;
const day = 24 * hour;
const midday = new Date().setHours(12, 0, 0, 0);

const chats: ChatSummary[] = [
  { id: "old", title: "Trip ideas", updatedAt: midday - 45 * day },
  { id: "today", title: "Web components", updatedAt: midday },
  { id: "week", title: "Recipe", updatedAt: midday - 3 * day },
  { id: "yesterday", title: "Haiku", updatedAt: midday - day },
];

async function mount(markup = "<ai-chat-list></ai-chat-list>", setup?: (list: AiChatListElement) => void) {
  document.body.insertAdjacentHTML("beforeend", markup);
  const list = document.body.lastElementChild as AiChatListElement;
  list.chats = chats;
  setup?.(list);
  await settle();
  const nav = list.querySelector("nav")!;
  return {
    list,
    nav,
    titles: () => [...list.querySelectorAll("[data-part='chat']")].map((chat) => chat.textContent),
    groups: () => [...list.querySelectorAll("[data-part='group-label']")].map((label) => label.textContent),
  };
}

test("chats are grouped by day, newest first, under New chat", async () => {
  const { nav, titles, groups } = await mount();
  expect(nav.getAttribute("aria-label")).toBe("Chats");
  expect(within(nav).getByRole("button", { name: "New chat" })).toBeDefined();
  expect(groups()).toEqual(["Today", "Yesterday", "Previous 7 days", "Older"]);
  expect(titles()).toEqual(["Web components", "Haiku", "Recipe", "Trip ideas"]);
  expect(within(nav).getByRole("list", { name: "Today" })).toBeDefined();
});

test("with no chats it says so", async () => {
  const { list } = await mount("<ai-chat-list></ai-chat-list>", (list) => (list.chats = []));
  expect(list.querySelector("[data-part='empty']")!.textContent).toBe("No chats yet");
});

test("with href, chats are links, and the selected one is the current page", async () => {
  const { list } = await mount('<ai-chat-list selected="today"></ai-chat-list>', (list) => {
    list.href = (chat) => `#chat/${chat.id}`;
  });
  const link = within(list).getByRole("link", { name: "Web components" });
  expect(link.getAttribute("href")).toBe("#chat/today");
  expect(link.getAttribute("aria-current")).toBe("page");

  list.selected = "week";
  expect(link.hasAttribute("aria-current")).toBe(false);
  expect(within(list).getByRole("link", { name: "Recipe" }).getAttribute("aria-current")).toBe("page");
});

test("choosing a chat or New chat fires events, and chatselect can be cancelled", async () => {
  const user = userEvent.setup();
  const { list } = await mount("<ai-chat-list></ai-chat-list>", (list) => (list.href = (chat) => `#chat/${chat.id}`));
  const events: string[] = [];
  list.addEventListener("chatselect", (event) => {
    events.push(`select:${event.detail.id}`);
    if (event.detail.id === "old") event.preventDefault();
  });
  list.addEventListener("chatnew", () => events.push("new"));

  await user.click(within(list).getByRole("link", { name: "Haiku" }));
  expect(location.hash).toBe("#chat/yesterday");
  await user.click(within(list).getByRole("link", { name: "Trip ideas" }));
  expect(location.hash).toBe("#chat/yesterday");
  await user.click(within(list).getByRole("button", { name: "New chat" }));
  expect(events).toEqual(["select:yesterday", "select:old", "new"]);
});

test("without href, chats are buttons marked current with aria-current", async () => {
  const { list } = await mount('<ai-chat-list selected="today"></ai-chat-list>');
  expect(within(list).getByRole("button", { name: "Web components" }).getAttribute("aria-current")).toBe("true");
});

test("each chat has an options menu with the chosen actions", async () => {
  const user = userEvent.setup();
  const { list } = await mount('<ai-chat-list actions="rename export delete"></ai-chat-list>');
  const exported = vi.fn();
  list.addEventListener("chatexport", (event) => exported(event.detail.id));

  await user.click(within(list).getByRole("button", { name: "Options for Haiku" }));
  expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Rename", "Export as Markdown", "Delete"]);
  await user.click(screen.getByRole("menuitem", { name: "Export as Markdown" }));
  expect(exported).toHaveBeenCalledWith("yesterday");

  const plain = await mount("<ai-chat-list></ai-chat-list>");
  await user.click(within(plain.list).getByRole("button", { name: "Options for Recipe" }));
  expect(within(plain.list).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Rename", "Delete"]);
});

test("Rename edits the name in place: Enter saves, Escape cancels", async () => {
  const user = userEvent.setup();
  const { list, titles } = await mount();
  const renamed = vi.fn();
  list.addEventListener("chatrename", (event) => renamed(event.detail));

  await user.click(within(list).getByRole("button", { name: "Options for Recipe" }));
  await user.click(within(list).getByRole("menuitem", { name: "Rename" }));
  const input = await vi.waitFor(() => within(list).getByRole<HTMLInputElement>("textbox", { name: "Chat name" }));
  await vi.waitFor(() => expect(document.activeElement).toBe(input));
  expect(input.value).toBe("Recipe");
  await user.clear(input);
  await user.type(input, "Pasta recipe{Enter}");

  expect(renamed).toHaveBeenCalledWith({ id: "week", title: "Pasta recipe" });
  expect(titles()).toContain("Pasta recipe");
  expect(document.activeElement).toBe(within(list).getByRole("button", { name: "Pasta recipe" }));

  await user.click(within(list).getByRole("button", { name: "Options for Haiku" }));
  await user.click(within(list).getByRole("menuitem", { name: "Rename" }));
  const second = await vi.waitFor(() => within(list).getByRole<HTMLInputElement>("textbox", { name: "Chat name" }));
  await vi.waitFor(() => expect(document.activeElement).toBe(second));
  await user.type(second, " draft{Escape}");
  expect(titles()).toContain("Haiku");
  expect(renamed).toHaveBeenCalledOnce();
});

test("Delete asks first, then removes the chat and moves focus to a neighbour", async () => {
  const user = userEvent.setup();
  const { list, titles } = await mount();
  const deleted = vi.fn();
  list.addEventListener("chatdelete", (event) => deleted(event.detail.id));

  await user.click(within(list).getByRole("button", { name: "Options for Haiku" }));
  await user.click(within(list).getByRole("menuitem", { name: "Delete" }));
  const dialog = await vi.waitFor(() => within(list).getByRole("alertdialog"));
  expect(within(dialog).getByText("Delete “Haiku”?")).toBeDefined();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await settle();
  expect(titles()).toContain("Haiku");
  expect(deleted).not.toHaveBeenCalled();

  await user.click(within(list).getByRole("button", { name: "Options for Haiku" }));
  await user.click(within(list).getByRole("menuitem", { name: "Delete" }));
  await user.click(within(await vi.waitFor(() => within(list).getByRole("alertdialog"))).getByRole("button", { name: "Delete" }));
  await vi.waitFor(() => expect(deleted).toHaveBeenCalledWith("yesterday"));
  expect(titles()).toEqual(["Web components", "Recipe", "Trip ideas"]);
  await vi.waitFor(() => expect(document.activeElement).toBe(within(list).getByRole("button", { name: "Recipe" })));
  expect(list.querySelector("[role='status']")!.textContent).toBe("Deleted “Haiku”");
});

test("every word can be replaced", async () => {
  const { list } = await mount("<ai-chat-list></ai-chat-list>", (list) => {
    list.strings = { label: "Discussions", newChat: "Nouvelle discussion", today: "Aujourd’hui", options: (title) => `Options pour ${title}` };
  });
  expect(within(list).getByRole("navigation", { name: "Discussions" })).toBeDefined();
  expect(within(list).getByRole("button", { name: "Nouvelle discussion" })).toBeDefined();
  expect(list.querySelector("[data-part='group-label']")!.textContent).toBe("Aujourd’hui");
  expect(within(list).getByRole("button", { name: "Options pour Haiku" })).toBeDefined();
});

test("agents can start a new chat and open one by name", async () => {
  const { list } = await mount();
  const events: string[] = [];
  list.addEventListener("chatnew", () => events.push("new"));
  list.addEventListener("chatselect", (event) => events.push(event.detail.id));
  const agent = createAgent();
  const snapshot = agent.snapshot();
  expect(snapshot.map((entry) => entry.label)).toEqual(expect.arrayContaining(["New chat", "Haiku", "Options for Haiku"]));
  // "Recipe" also appears in "Options for Recipe", so the bridge asks for the chat's ref, as an agent would use.
  const recipe = snapshot.find((entry) => entry.label === "Recipe")!;
  const result = await agent.act({
    steps: [
      { ref: "New chat", action: "press" },
      { ref: recipe.ref, action: "press" },
    ],
  });
  expect(result.ok, result.error?.message).toBe(true);
  expect(events).toEqual(["new", "week"]);
});
