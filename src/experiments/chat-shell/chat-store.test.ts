import { afterEach, expect, test } from "vitest";
import { ChatStore, chatToMarkdown, markdownFileName, type StoredChat, titleFrom } from "./chat-store.ts";

afterEach(() => localStorage.clear());

const chat: StoredChat = {
  id: "c1",
  title: "Web components",
  createdAt: 1,
  updatedAt: 2,
  messages: [
    { from: "user", text: "What's a custom element?", meta: "Auto · Sonnet 5.5 · Thinking: Medium" },
    { from: "assistant", text: "A **custom element** is a tag you define.\n\n```html\n<my-tag></my-tag>\n```", thinking: { seconds: 3, reasoning: "Thinking." } },
    { from: "user", text: "Stop there", meta: "Plan · Haiku 5.5 · Thinking: Off" },
    { from: "assistant", text: "", meta: "Stopped" },
  ],
};

test("titles come from the first line of the first prompt", () => {
  expect(titleFrom("  Explain   web components\nin detail")).toBe("Explain web components");
  expect(titleFrom("x".repeat(80))).toBe(`${"x".repeat(57)}…`);
  expect(titleFrom("")).toBe("");
});

test("file names are readable slugs", () => {
  expect(markdownFileName("Web components: a tour!")).toBe("web-components-a-tour.md");
  expect(markdownFileName("Café déjà vu")).toBe("cafe-deja-vu.md");
  expect(markdownFileName("???")).toBe("chat.md");
});

test("a chat exports as Markdown with who said what, the settings and the thinking time", () => {
  expect(chatToMarkdown(chat, { exportedAt: new Date(2026, 10, 26), locale: "en-GB" })).toBe(
    [
      "# Web components",
      "",
      "*Exported from AI chat on 26 November 2026.*",
      "",
      "---",
      "",
      "**You** · Auto · Sonnet 5.5 · Thinking: Medium",
      "",
      "What's a custom element?",
      "",
      "---",
      "",
      "**Assistant** · Thought for 3s",
      "",
      "A **custom element** is a tag you define.",
      "",
      "```html",
      "<my-tag></my-tag>",
      "```",
      "",
      "---",
      "",
      "**You** · Plan · Haiku 5.5 · Thinking: Off",
      "",
      "Stop there",
      "",
      "---",
      "",
      "**Assistant** · Stopped",
      "",
      "*(no text)*",
      "",
    ].join("\n"),
  );
});

test("chats are saved in this browser, newest first, and survive a reload", () => {
  const store = new ChatStore();
  store.put(chat);
  store.put({ ...chat, id: "c2", title: "Second", updatedAt: 5 });
  store.rename("c1", "Renamed");

  const reloaded = new ChatStore();
  expect(reloaded.list().map((saved) => saved.title)).toEqual(["Renamed", "Second"]);
  expect(reloaded.get("c1")!.messages).toHaveLength(4);
  reloaded.remove("c2");
  expect(new ChatStore().list().map((saved) => saved.id)).toEqual(["c1"]);
});

test("damaged saved data is ignored rather than breaking the page", () => {
  localStorage.setItem("chat-shell:chats", "{not json");
  expect(new ChatStore().list()).toEqual([]);
  localStorage.setItem("chat-shell:chats", JSON.stringify([chat, { id: 3 }, { ...chat, id: "bad", messages: [{ from: "robot", text: 1 }] }]));
  expect(new ChatStore().list().map((saved) => saved.id)).toEqual(["c1"]);
});

test("when storage is full, the oldest chats are dropped to make room", () => {
  const store = new ChatStore();
  store.put({ ...chat, id: "old", updatedAt: 1 });
  const setItem = Storage.prototype.setItem;
  let calls = 0;
  Storage.prototype.setItem = function (key: string, value: string) {
    calls++;
    if (JSON.parse(value).length > 1) throw new DOMException("Full", "QuotaExceededError");
    setItem.call(this, key, value);
  };
  try {
    store.put({ ...chat, id: "new", updatedAt: 9 });
  } finally {
    Storage.prototype.setItem = setItem;
  }
  expect(calls).toBe(2);
  expect(new ChatStore().list().map((saved) => saved.id)).toEqual(["new"]);
});

test("the export includes tool calls, ratings, errors and the other versions of a reply", () => {
  const markdown = chatToMarkdown(
    {
      ...chat,
      messages: [
        { from: "user", text: "Explain @src/main.ts", meta: "Auto" },
        {
          from: "assistant",
          text: "Second try",
          tools: [
            { name: "read_file", summary: "Read src/main.ts", input: { path: "src/main.ts" }, output: "…" },
            { name: "run_tests", summary: "", error: "2 tests failed" },
          ],
          feedback: "good",
          versions: ["First try", "Second try"],
          version: 2,
          error: "The connection dropped.",
        },
      ],
    },
    { exportedAt: new Date(2026, 10, 26), locale: "en-GB" },
  );
  expect(markdown).toContain(
    [
      "**Assistant** · Version 2 of 2 · Rated good",
      "",
      "- Read src/main.ts",
      "- `run_tests` failed: 2 tests failed",
      "",
      "Second try",
      "",
      "> **Error:** The connection dropped.",
      "",
      "*Version 1 of 2:*",
      "",
      "First try",
    ].join("\n"),
  );
});
