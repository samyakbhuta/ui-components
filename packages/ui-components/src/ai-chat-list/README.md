# `<ai-chat-list>`

The list of saved chats, for a sidebar or a drawer. **New chat** is at the top, and chats are grouped by day: Today, Yesterday, Previous 7 days, Previous 30 days and Older. Each chat has an options menu with **Rename**, **Export** and **Delete**.

The list shows the chats you give it and tells you what people do. Saving chats is up to your page; the chat shell experiment keeps them in `localStorage` (`src/experiments/chat-shell/chat-store.ts`).

Live examples: run `npm run dev` and open [`/experiments/ai-composer.html#chat-list`](../../../../experiments/ai-composer.html), or the chat shell, which uses it as its sidebar.

## Quick start

```ts
import "@samyakbhuta/ui-components/ai-chat-list"; // registers <ai-chat-list> and loads its CSS
```

```html
<ai-chat-list actions="rename export delete" selected="c2"></ai-chat-list>
```

```ts
const list = document.querySelector("ai-chat-list")!;
list.chats = [
  { id: "c1", title: "Trip ideas", updatedAt: Date.parse("2026-11-20") },
  { id: "c2", title: "Web components", updatedAt: Date.now() },
];
list.href = (chat) => `#chat/${chat.id}`; // chats become links

list.addEventListener("chatnew", () => startNewChat());
list.addEventListener("chatrename", (event) => saveTitle(event.detail.id, event.detail.title));
list.addEventListener("chatdelete", (event) => removeChat(event.detail.id));
list.addEventListener("chatexport", (event) => exportChat(event.detail.id));
```

## Attributes and properties

| Member | What it does |
| --- | --- |
| `chats` | The chats to list: `{ id, title, updatedAt?, status? }`. With `updatedAt` on every chat, they're sorted newest first and grouped by day; otherwise they're listed as given. `status` is a short note shown under the title, after a dot, like `Needs your answer` for a chat waiting on the person. Screen readers hear it after the chat's name. |
| `selected` | The id of the open chat. Its item is highlighted and marked `aria-current`. |
| `actions` | Which actions the options menu offers, from `rename`, `export` and `delete`, separated by spaces. Defaults to `rename delete`; `actions=""` leaves the menu out. |
| `href` | A function that gives each chat an address. Chats become links, so they open in a new tab and work with Back. Without it, chats are buttons. |
| `strings` | Words to replace; see below. |
| `focus()` | Moves focus to the open chat, or to New chat. |

## Events

All events bubble from `<ai-chat-list>`.

| Event | `detail` | When |
| --- | --- | --- |
| `chatselect` | `{ id }` | A chat was chosen. Cancelable: `preventDefault()` stops a link from navigating. |
| `chatnew` | `null` | New chat was pressed. |
| `chatrename` | `{ id, title }` | A new name was saved. Cancelable: `preventDefault()` keeps the old name. |
| `chatexport` | `{ id }` | Export was chosen from the menu. |
| `chatdelete` | `{ id }` | Delete was confirmed. Cancelable: `preventDefault()` keeps the chat in the list. |

## How the actions work

- **Rename** swaps the title for a text field. Enter or leaving the field saves; Escape cancels. Focus goes back to the chat afterwards.
- **Delete** asks first, in a ui-sdk alert dialog: "Delete “Trip ideas”?" with Cancel and Delete. Escape or Cancel keeps the chat. After a delete, focus moves to the next chat (or the one before, or New chat), and screen readers hear "Deleted “Trip ideas”".
- **Export** fires `chatexport`. Your page makes the file. The chat shell's `chatToMarkdown()` and `download()` show one way.

## Translation

```ts
list.strings = {
  label: "Discussions",
  newChat: "Nouvelle discussion",
  today: "Aujourd’hui",
  options: (title) => `Options pour ${title}`,
  deleteTitle: (title) => `Supprimer « ${title} » ?`,
};
```

| Key | Default |
| --- | --- |
| `label` | `Chats`: the navigation's name |
| `newChat`, `empty`, `untitled` | `New chat`, `No chats yet`, `New chat` (for a chat without a title) |
| `today`, `yesterday`, `previous7Days`, `previous30Days`, `older` | the group names |
| `options(title)` | `Options for Trip ideas`: the menu button's name |
| `rename`, `export`, `delete` | `Rename`, `Export as Markdown`, `Delete` |
| `renameLabel` | `Chat name`: the rename field's name |
| `deleteChat`, `deleteTitle(title)`, `deleteDescription` | the dialog's question and explanation |
| `cancel`, `confirmDelete` | `Cancel`, `Delete` |
| `deleted(title)` | `Deleted “Trip ideas”`: what screen readers hear |

## Styling

The CSS sits in the `ai-chat-list` cascade layer. Custom properties: `--ai-chat-list-muted`, `--ai-chat-list-hover`, `--ai-chat-list-current` and `--ai-chat-list-status`. Parts: `[data-part="nav"]`, `new`, `groups`, `group`, `group-label`, `list`, `item` (with `data-current` on the open chat, and `data-status` on one with a `status`), `chat`, `title`, `status`, `options`, `menu`, `popup`, `rename`, `empty`, and the dialog's `backdrop`, `dialog`, `dialog-title`, `dialog-description`, `dialog-actions`, `cancel` and `confirm-delete`.

Set its custom properties on `ai-chat-list` itself, or once on an element around it, like `ai-chat` or `:root`, and every `<ai-chat-list>` inside takes them.

Long titles shorten with an ellipsis; the full title is in the tooltip. With a mouse, the options button shows on the chat you point at, the open chat and the focused one; on touch screens it always shows.

## Accessibility

- It's a navigation landmark named "Chats". Each day's chats are a list named by its group label.
- The open chat is marked `aria-current="page"` (or `"true"` for buttons).
- Each options button is named for its chat ("Options for Trip ideas"), and the menu is a ui-sdk Menu with arrow keys and typeahead.
- The delete question is a modal alert dialog that traps focus, so it can't be dismissed by accident.
- AI agents can press New chat, open a chat, and use each chat's menu, because they're ui-sdk Buttons and Menus. When a chat's title also appears in "Options for …", the agent bridge asks for the chat's ref, so agents pick the right one.

## Files

- `ai-chat-list.ts`: the element.
- `ai-chat-list.css`: its styles.
- `ai-chat-list.test.ts`: tests for grouping, links, selection, each action, translation and agent use.
