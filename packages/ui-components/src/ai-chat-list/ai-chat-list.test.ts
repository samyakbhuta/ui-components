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
    titles: () => [...list.querySelectorAll("[data-part='chat'] [data-part='title']")].map((title) => title.textContent),
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
  const link = within(list).getByRole("link", { name: "Open Web components" });
  expect(link.getAttribute("href")).toBe("#chat/today");
  expect(link.getAttribute("aria-current")).toBe("page");

  list.selected = "week";
  expect(link.hasAttribute("aria-current")).toBe(false);
  expect(within(list).getByRole("link", { name: "Open Recipe" }).getAttribute("aria-current")).toBe("page");
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

  await user.click(within(list).getByRole("link", { name: "Open Haiku" }));
  expect(location.hash).toBe("#chat/yesterday");
  await user.click(within(list).getByRole("link", { name: "Open Trip ideas" }));
  expect(location.hash).toBe("#chat/yesterday");
  await user.click(within(list).getByRole("button", { name: "New chat" }));
  expect(events).toEqual(["select:yesterday", "select:old", "new"]);
});

test("without href, chats are buttons marked current with aria-current", async () => {
  const { list } = await mount('<ai-chat-list selected="today"></ai-chat-list>');
  expect(within(list).getByRole("button", { name: "Open Web components" }).getAttribute("aria-current")).toBe("true");
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
  expect(document.activeElement).toBe(within(list).getByRole("button", { name: "Open Pasta recipe" }));

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
  await user.click(within(await vi.waitFor(() => within(list).getByRole("alertdialog"))).getByRole("button", { name: "Delete forever" }));
  await vi.waitFor(() => expect(deleted).toHaveBeenCalledWith("yesterday"));
  expect(titles()).toEqual(["Web components", "Recipe", "Trip ideas"]);
  await vi.waitFor(() => expect(document.activeElement).toBe(within(list).getByRole("button", { name: "Open Recipe" })));
  expect(list.querySelector("[role='status']")!.textContent).toBe("Deleted “Haiku”");
});

test("an agent can't delete a chat on its own: the person is asked first", async () => {
  const { titles } = await mount();
  const asked: string[] = [];
  let approve = false;
  const agent = createAgent({
    allow: (step) => {
      if (step.confirm) asked.push(step.confirm);
      return !step.confirm || approve;
    },
  });
  const remove = () =>
    agent.act({
      steps: [
        { ref: "Options for Haiku", action: "press", args: ["Delete"] },
        { ref: "Delete “Haiku”?", action: "press", args: ["Delete forever"] },
      ],
    });

  expect((await remove()).ok).toBe(false);
  await settle();
  expect(titles()).toContain("Haiku");
  expect(asked).toEqual(["Deletes “Haiku” and its messages from this browser"]);

  approve = true;
  const result = await remove();
  expect(result.ok, result.error?.message).toBe(true);
  await vi.waitFor(() => expect(titles()).not.toContain("Haiku"));
});

test("an agent can rename a chat: the name it sets is saved", async () => {
  const { list, titles } = await mount();
  const renamed = vi.fn();
  list.addEventListener("chatrename", (event) => renamed(event.detail));
  const agent = createAgent();
  const opened = await agent.act({ steps: [{ ref: "Options for Haiku", action: "press", args: ["Rename"] }] });
  expect(opened.ok, opened.error?.message).toBe(true);
  await vi.waitFor(() => expect(within(list).getByRole("textbox", { name: "Chat name" })).toBeDefined());
  const result = await agent.act({ steps: [{ ref: "Chat name", action: "setValue", args: ["Poems"] }] });
  expect(result.ok, result.error?.message).toBe(true);
  await vi.waitFor(() => expect(renamed).toHaveBeenCalledWith({ id: "yesterday", title: "Poems" }));
  expect(titles()).toContain("Poems");
  expect(within(list).queryByRole("textbox", { name: "Chat name" })).toBeNull();
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
  expect(snapshot.map((entry) => entry.label)).toEqual(expect.arrayContaining(["New chat", "Open Haiku", "Options for Haiku"]));
  // Each chat's name has a verb of its own, so it can't be mistaken for its Options button.
  const result = await agent.act({
    steps: [
      { ref: "New chat", action: "press" },
      { ref: "Open Recipe", action: "press" },
    ],
  });
  expect(result.ok, result.error?.message).toBe(true);
  expect(events).toEqual(["new", "week"]);
});

test("a chat can show a status, like one waiting on an answer, read after its title", async () => {
  const { list } = await mount();
  list.chats = [
    { id: "today", title: "Trip ideas", updatedAt: midday, status: "Needs your answer" },
    { id: "week", title: "Recipe", updatedAt: midday - 3 * day },
  ];
  await settle();
  const waiting = within(list).getByRole("button", { name: "Open Trip ideas", description: "Needs your answer" });
  expect(waiting.querySelector("[data-part='status']")!.textContent).toBe("Needs your answer");
  expect(within(list).getByRole("button", { name: "Open Recipe" }).hasAttribute("aria-describedby")).toBe(false);
  expect(list.querySelectorAll("[data-part='item'][data-status]")).toHaveLength(1);
});
