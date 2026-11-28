import "@ui-sdk/web/alert-dialog";
import "@ui-sdk/web/button";
import "@ui-sdk/web/input";
import "@ui-sdk/web/menu";
import { createConfirm } from "@ui-sdk/web/alert-dialog";
import { adoptStyles, BaseElement, define } from "../styles.ts";
import styles from "./ai-chat-list.css?inline";

/** One chat in the list. */
export type ChatSummary = {
  id: string;
  title: string;
  /** When it last changed, in milliseconds. Chats with it are sorted newest first and grouped by day. */
  updatedAt?: number;
  /** A short note shown beside the title, like "Needs your answer". Screen readers hear it after the title. */
  status?: string;
};

export type ChatListAction = "rename" | "export" | "delete";

/** Every word `<ai-chat-list>` shows or announces. Override any of them through `strings`. */
export type ChatListStrings = {
  label: string;
  newChat: string;
  empty: string;
  untitled: string;
  today: string;
  yesterday: string;
  previous7Days: string;
  previous30Days: string;
  older: string;
  /** A chat's accessible name: its title with a verb of its own, so it differs from "Options for …". */
  openChat: (title: string) => string;
  options: (title: string) => string;
  rename: string;
  export: string;
  delete: string;
  renameLabel: string;
  deleteTitle: (title: string) => string;
  /** The dialog's name before it's opened for a chat. */
  deleteChat: string;
  deleteDescription: string;
  cancel: string;
  confirmDelete: string;
  /** What an agent confirming Delete would do, asked of the person first (`data-agent-confirm`). */
  deleteConfirm: (title: string) => string;
  deleted: (title: string) => string;
};

export const defaultChatListStrings: ChatListStrings = {
  label: "Chats",
  newChat: "New chat",
  empty: "No chats yet",
  untitled: "New chat",
  today: "Today",
  yesterday: "Yesterday",
  previous7Days: "Previous 7 days",
  previous30Days: "Previous 30 days",
  older: "Older",
  openChat: (title) => `Open ${title}`,
  options: (title) => `Options for ${title}`,
  rename: "Rename",
  export: "Export as Markdown",
  delete: "Delete",
  renameLabel: "Chat name",
  deleteTitle: (title) => `Delete “${title}”?`,
  deleteChat: "Delete chat?",
  deleteDescription: "The chat and its messages will be deleted from this browser. This can't be undone.",
  cancel: "Cancel",
  confirmDelete: "Delete forever",
  deleteConfirm: (title) => (title ? `Deletes “${title}” and its messages from this browser` : "Deletes the chat and its messages from this browser"),
  deleted: (title) => `Deleted “${title}”`,
};

/** The events this element fires, by name. */
export type ChatListEvents = {
  chatselect: CustomEvent<{ id: string }>;
  chatnew: CustomEvent<null>;
  chatrename: CustomEvent<{ id: string; title: string }>;
  chatexport: CustomEvent<{ id: string }>;
  chatdelete: CustomEvent<{ id: string }>;
};

const icon = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const icons = {
  newChat: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  options: icon('<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>'),
};

const day = 24 * 60 * 60 * 1000;
const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

let instances = 0;

/**
 * `<ai-chat-list>`: the list of saved chats, for a sidebar. New chat at the top, chats grouped by
 * day, and Rename, Export and Delete on each. See README.md beside this file.
 *
 * @customElement ai-chat-list
 * @fires chatselect - A chat was chosen. Cancelable.
 * @fires chatnew - New chat was pressed.
 * @fires chatrename - A new name was saved. Cancelable.
 * @fires chatexport - Export was chosen.
 * @fires chatdelete - Delete was confirmed. Cancelable.
 */
export class AiChatListElement extends BaseElement {
  static observedAttributes = ["selected", "actions"];

  #id = `ai-chat-list-${++instances}`;
  #chats: ChatSummary[] = [];
  #strings: ChatListStrings = defaultChatListStrings;
  #href?: (chat: ChatSummary) => string;
  #rendered = false;
  #confirm = createConfirm<{ title: string }>();
  #list = document.createElement("div");
  #announcement = document.createElement("span");
  #renaming?: string;

  /** The chats to list. Chats with `updatedAt` are sorted newest first. */
  get chats(): ChatSummary[] {
    return this.#chats.map((chat) => ({ ...chat }));
  }
  set chats(value: ChatSummary[]) {
    this.#chats = (value ?? []).map((chat) => ({ ...chat }));
    this.#renderList();
  }

  /** The id of the chat that's open. Its item is marked as current. */
  get selected(): string | null {
    return this.getAttribute("selected");
  }
  set selected(value: string | null) {
    if (value === null) this.removeAttribute("selected");
    else this.setAttribute("selected", value);
  }

  /** Which actions each chat offers, from "rename", "export" and "delete". */
  get actions(): ChatListAction[] {
    const value = this.getAttribute("actions") ?? "rename delete";
    return value.split(/\s+/).filter((action): action is ChatListAction => ["rename", "export", "delete"].includes(action));
  }
  set actions(value: ChatListAction[] | string) {
    this.setAttribute("actions", Array.isArray(value) ? value.join(" ") : String(value));
  }

  /** Makes each chat a link to this address, so chats can be opened in a new tab or with Back. */
  get href(): ((chat: ChatSummary) => string) | undefined {
    return this.#href;
  }
  set href(value: ((chat: ChatSummary) => string) | undefined) {
    this.#href = value;
    this.#renderList();
  }

  get strings(): ChatListStrings {
    return this.#strings;
  }
  set strings(value: Partial<ChatListStrings>) {
    this.#strings = { ...defaultChatListStrings, ...value };
    if (this.#rendered) this.#render();
  }

  /** Moves focus to the open chat, or to New chat. */
  override focus(options?: FocusOptions) {
    const current = this.querySelector<HTMLElement>("[data-part='chat'][aria-current]");
    (current ?? this.querySelector<HTMLElement>("[data-part='new']"))?.focus(options);
  }

  connectedCallback() {
    if (!this.#rendered) this.#render();
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null) {
    if (previous === next || !this.#rendered) return;
    if (name === "selected") this.#markSelected();
    else this.#renderList();
  }

  #render() {
    const s = this.#strings;
    this.replaceChildren();
    const nav = document.createElement("nav");
    nav.dataset.part = "nav";
    nav.setAttribute("aria-label", s.label);
    const newChat = document.createElement("ui-button");
    newChat.innerHTML = `<button type="button" data-part="new">${icons.newChat}<span></span></button>`;
    newChat.querySelector("span")!.textContent = s.newChat;
    newChat.addEventListener("action", () => this.#emit("chatnew", null));
    this.#list.dataset.part = "groups";
    nav.append(newChat, this.#list);

    this.#announcement.dataset.part = "announcement";
    this.#announcement.setAttribute("role", "status");

    const dialog = document.createElement("ui-alert-dialog");
    dialog.dataset.part = "confirm";
    dialog.innerHTML = `
      <ui-alert-dialog-backdrop data-part="backdrop" hidden></ui-alert-dialog-backdrop>
      <ui-alert-dialog-content data-part="dialog" hidden>
        <ui-alert-dialog-title data-part="dialog-title"></ui-alert-dialog-title>
        <ui-alert-dialog-description data-part="dialog-description"></ui-alert-dialog-description>
        <div data-part="dialog-actions">
          <ui-alert-dialog-close><button type="button" data-part="cancel"></button></ui-alert-dialog-close>
          <ui-alert-dialog-close value="confirm" data-part="confirm-close"><button type="button" data-part="confirm-delete"></button></ui-alert-dialog-close>
        </div>
      </ui-alert-dialog-content>`;
    dialog.querySelector("[data-part='dialog-title']")!.textContent = s.deleteChat;
    dialog.querySelector("[data-part='dialog-description']")!.textContent = s.deleteDescription;
    dialog.querySelector("[data-part='cancel']")!.textContent = s.cancel;
    dialog.querySelector("[data-part='confirm-delete']")!.textContent = s.confirmDelete;
    // An agent can't delete on its own: the bridge asks the person first.
    dialog.querySelector<HTMLElement>("[data-part='confirm-close']")!.dataset.agentConfirm = s.deleteConfirm("");
    dialog.controller = this.#confirm.controller;
    dialog.addEventListener("payloadchange", (event) => {
      const title = (event as CustomEvent<{ value?: { title: string } }>).detail.value?.title ?? "";
      dialog.querySelector("[data-part='dialog-title']")!.textContent = this.#strings.deleteTitle(title);
    });

    this.append(nav, dialog, this.#announcement);
    this.#rendered = true;
    this.#renderList();
  }

  /** Puts chats into Today, Yesterday, Previous 7 days, Previous 30 days and Older. */
  #groups(): [string, ChatSummary[]][] {
    const s = this.#strings;
    const dated = this.#chats.every((chat) => typeof chat.updatedAt === "number");
    if (!dated) return [["", this.#chats]];
    const today = startOfDay(Date.now());
    const sorted = [...this.#chats].sort((a, b) => b.updatedAt! - a.updatedAt!);
    const groups = new Map<string, ChatSummary[]>();
    for (const chat of sorted) {
      const days = Math.round((today - startOfDay(chat.updatedAt!)) / day);
      const label = days <= 0 ? s.today : days === 1 ? s.yesterday : days <= 7 ? s.previous7Days : days <= 30 ? s.previous30Days : s.older;
      groups.set(label, [...(groups.get(label) ?? []), chat]);
    }
    return [...groups];
  }

  #renderList() {
    if (!this.#rendered) return;
    const s = this.#strings;
    const focusedId = (document.activeElement?.closest("[data-part='item']") as HTMLElement | null)?.dataset.id;
    const focusedPart = (document.activeElement as HTMLElement | null)?.dataset.part;
    this.#list.replaceChildren();

    if (this.#chats.length === 0) {
      const empty = document.createElement("p");
      empty.dataset.part = "empty";
      empty.textContent = s.empty;
      this.#list.append(empty);
      return;
    }

    this.#groups().forEach(([label, chats], index) => {
      const group = document.createElement("div");
      group.dataset.part = "group";
      const list = document.createElement("ul");
      list.dataset.part = "list";
      if (label) {
        const heading = document.createElement("p");
        heading.dataset.part = "group-label";
        heading.id = `${this.#id}-group-${index}`;
        heading.textContent = label;
        list.setAttribute("aria-labelledby", heading.id);
        group.append(heading);
      } else {
        list.setAttribute("aria-label", s.label);
      }
      for (const chat of chats) list.append(this.#item(chat));
      group.append(list);
      this.#list.append(group);
    });

    this.#markSelected();
    // Keep focus on the same chat after the list is rebuilt.
    if (focusedId) {
      const item = this.#itemFor(focusedId);
      item?.querySelector<HTMLElement>(focusedPart === "options" ? "[data-part='options']" : "[data-part='chat']")?.focus();
    }
  }

  #item(chat: ChatSummary) {
    const s = this.#strings;
    const title = chat.title.trim() || s.untitled;
    const item = document.createElement("li");
    item.dataset.part = "item";
    item.dataset.id = chat.id;

    const wrapper = document.createElement("ui-button");
    const href = this.#href?.(chat);
    const target = document.createElement(href ? "a" : "button");
    target.dataset.part = "chat";
    if (target instanceof HTMLAnchorElement) target.href = href!;
    else target.type = "button";
    const name = document.createElement("span");
    name.dataset.part = "title";
    name.textContent = title;
    target.append(name);
    target.title = title;
    target.setAttribute("aria-label", s.openChat(title));
    const status = chat.status?.trim();
    if (status) {
      // Shown in the row, but read as the chat's description so its name stays its title.
      const badge = document.createElement("span");
      badge.dataset.part = "status";
      badge.id = `${this.#id}-status-${chat.id}`;
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = status;
      target.append(badge);
      target.setAttribute("aria-describedby", badge.id);
      item.toggleAttribute("data-status", true);
    }
    target.addEventListener("click", (event: Event) => {
      if (!(event instanceof MouseEvent)) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!this.#emit("chatselect", { id: chat.id }, true)) event.preventDefault();
    });
    wrapper.append(target);
    item.append(wrapper);

    const actions = this.actions;
    if (actions.length) {
      const menu = document.createElement("ui-menu");
      menu.dataset.part = "menu";
      menu.innerHTML = `
        <ui-menu-trigger>
          <button type="button" data-part="options">${icons.options}</button>
        </ui-menu-trigger>
        <ui-menu-content data-part="popup">
          ${actions.map((action) => `<ui-menu-item value="${action}" data-action="${action}"></ui-menu-item>`).join("")}
        </ui-menu-content>`;
      const options = menu.querySelector("[data-part='options']")!;
      options.setAttribute("aria-label", s.options(title));
      options.setAttribute("title", s.options(title));
      for (const action of actions) menu.querySelector(`[data-action="${action}"]`)!.textContent = s[action];
      menu.addEventListener("action", (event) => {
        const action = (event as CustomEvent<{ value: ChatListAction }>).detail.value;
        if (action === "rename") this.#startRename(chat.id, menu);
        else if (action === "export") this.#emit("chatexport", { id: chat.id });
        else if (action === "delete") void this.#delete(chat.id);
      });
      item.append(menu);
    }
    return item;
  }

  #itemFor(id: string) {
    return [...this.#list.querySelectorAll<HTMLElement>("[data-part='item']")].find((item) => item.dataset.id === id);
  }

  #markSelected() {
    const selected = this.selected;
    for (const item of this.#list.querySelectorAll<HTMLElement>("[data-part='item']")) {
      const current = item.dataset.id === selected;
      item.toggleAttribute("data-current", current);
      const target = item.querySelector("[data-part='chat']")!;
      if (current) target.setAttribute("aria-current", target instanceof HTMLAnchorElement ? "page" : "true");
      else target.removeAttribute("aria-current");
    }
  }

  /** Swaps the chat's name for a text field. Enter or leaving it saves; Escape cancels. */
  #startRename(id: string, menu: HTMLElement) {
    const begin = () => {
      const item = this.#itemFor(id);
      const chat = this.#chats.find((other) => other.id === id);
      if (!item || !chat || this.#renaming) return;
      this.#renaming = id;
      const wrapper = item.querySelector("ui-button")!;
      const input = document.createElement("input");
      input.type = "text";
      input.dataset.part = "rename";
      input.value = chat.title;
      input.setAttribute("aria-label", this.#strings.renameLabel);
      // A ui-sdk Input, so agents can rename too.
      const field = document.createElement("ui-input");
      field.append(input);
      wrapper.hidden = true;
      wrapper.after(field);
      input.focus();
      input.select();

      let finished = false;
      const finish = (save: boolean) => {
        if (finished) return;
        finished = true;
        this.#renaming = undefined;
        const title = input.value.trim();
        field.remove();
        wrapper.hidden = false;
        if (save && title && title !== chat.title && this.#emit("chatrename", { id, title }, true)) {
          chat.title = title;
          this.#renderList();
        }
        this.#itemFor(id)?.querySelector<HTMLElement>("[data-part='chat']")?.focus();
      };
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        }
      });
      input.addEventListener("blur", () => finish(true));
      // An agent can't press Enter, so a name it sets is saved at once.
      field.addEventListener("valuechange", (event) => {
        if ((event as CustomEvent<{ source?: string }>).detail.source === "agent") setTimeout(() => finish(true));
      });
    };
    // The menu hands focus back to its button as it closes, so start once it has closed.
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      begin();
    };
    menu.addEventListener(
      "openchangecomplete",
      (event) => {
        if (!(event as CustomEvent<{ value: boolean }>).detail.value) start();
      },
      { once: true },
    );
    setTimeout(start, 400);
  }

  async #delete(id: string) {
    const chat = this.#chats.find((other) => other.id === id);
    if (!chat) return;
    const title = chat.title.trim() || this.#strings.untitled;
    const confirm = this.querySelector<HTMLElement>("[data-part='confirm-close']");
    if (confirm) confirm.dataset.agentConfirm = this.#strings.deleteConfirm(title);
    if (!(await this.#confirm({ title }))) return;
    if (!this.#emit("chatdelete", { id }, true)) return;
    // Focus moves to a neighbouring chat, or to New chat when none is left.
    const items = [...this.#list.querySelectorAll<HTMLElement>("[data-part='item']")];
    const index = items.findIndex((item) => item.dataset.id === id);
    const neighbour = (items[index + 1] ?? items[index - 1])?.dataset.id;
    this.#chats = this.#chats.filter((other) => other.id !== id);
    this.#renderList();
    const next = neighbour ? this.#itemFor(neighbour)?.querySelector<HTMLElement>("[data-part='chat']") : undefined;
    (next ?? this.querySelector<HTMLElement>("[data-part='new']"))?.focus();
    this.#announcement.textContent = this.#strings.deleted(title);
    setTimeout(() => (this.#announcement.textContent = ""), 4000);
  }

  #emit(type: keyof ChatListEvents, detail: unknown, cancelable = false) {
    return this.dispatchEvent(new CustomEvent(type, { detail, cancelable, bubbles: true, composed: true }));
  }
}

adoptStyles(styles);
define("ai-chat-list", AiChatListElement);

declare global {
  interface HTMLElementTagNameMap {
    "ai-chat-list": AiChatListElement;
  }
  interface HTMLElementEventMap extends ChatListEvents {}
}
