import "@ui-sdk/web/button";
import type { ChangeSource } from "@ui-sdk/core";
import { createParts, type UiActionDetail } from "@ui-sdk/web";
import { needsPerson } from "../agent.ts";
import { adoptStyles } from "../styles.ts";
import { notice, type NoticeAction, type NoticeStrings, type NoticeTone } from "./notice.ts";
import styles from "./ai-notice.css?inline";

export { defaultNoticeStrings, notice, resetDate } from "./notice.ts";
export type { NoticeAction, NoticeOptions, NoticeStrings, NoticeTone } from "./notice.ts";

/** What `noticeaction` carries in `event.detail`: the action's `value`, and how it was pressed. */
export type NoticeActionDetail = { value: string; reason: "press" | "imperative"; source: ChangeSource; event?: Event };

/** What `noticeexpire` carries in `event.detail`. */
export type NoticeExpireDetail = { value: null; reason: "timeout"; source: ChangeSource };

/** What `openchange` carries in `event.detail`. */
export type NoticeOpenChangeDetail = { value: boolean; reason: "close-press" | "imperative"; source: ChangeSource; event?: Event };

/** The events this element fires, by name. */
export type NoticeEvents = {
  noticeaction: CustomEvent<NoticeActionDetail>;
  noticeexpire: CustomEvent<NoticeExpireDetail>;
  openchange: CustomEvent<NoticeOpenChangeDetail>;
};

/** Every event `<ai-notice>` takes listeners for: its own and the usual HTML ones. */
export interface NoticeElementEventMap extends HTMLElementEventMap, NoticeEvents {}

/**
 * `<ai-notice>`: something that stops the conversation and needs action, like a usage limit,
 * a lapsed sign-in or a lost connection. It has a heading, a message, an optional reset time
 * that counts down, and your buttons and links. It's ui-sdk's `notice` primitive (`notice.ts`)
 * rendered as custom elements. See README.md beside this file.
 */
export interface AiNoticeElement extends HTMLElement {
  heading: string;
  tone: NoticeTone;
  /** The message under the heading. Shown as text, never parsed as HTML. Text written inside is the message too. */
  text: string;
  actions: NoticeAction[];
  /** When it stops applying: what was set, a `Date` or an ISO time. */
  resetsAt: Date | string | null;
  dismissible: boolean;
  strings: Partial<NoticeStrings> | undefined;
  /** Whether it shows. Dismiss closes it; setting it doesn't fire `openchange`. */
  open: boolean;
  api: {
    /** Presses the action with this value, as a click does. Returns false when nothing happened. */
    act(value: string): boolean;
    /** Closes it, as Dismiss does. Returns false when it was cancelled. */
    dismiss(): boolean;
    setOpen(open: boolean): boolean;
  };
  // Its events are typed here, not in the global map: ui-sdk-style names like `openchange`
  // are shared between elements, with different details.
  addEventListener<K extends keyof NoticeElementEventMap>(
    type: K,
    listener: (this: AiNoticeElement, event: NoticeElementEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  removeEventListener<K extends keyof NoticeElementEventMap>(
    type: K,
    listener: (this: AiNoticeElement, event: NoticeElementEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
}

const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const icons: Record<NoticeTone | "dismiss", string> = {
  warning: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  error: svg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  dismiss: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
};

/** Addresses a link may go to. */
const safeHref = /^(?:https?:|mailto:|#|\/|\.{0,2}\/|[^:]*$)/i;

type Instance = ReturnType<typeof notice>;

const tag = (name: string, part: string) => {
  const element = document.createElement(name);
  element.dataset.part = part;
  return element;
};

/** Builds the notice once, then keeps its words, actions and reset line in line with the state. */
function render(el: HTMLElement, instance: Instance) {
  if (!el.querySelector(":scope > [data-part='body']")) {
    // Text written inside is the message.
    const written = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    const body = tag("div", "body");
    body.append(tag("p", "heading"), tag("ai-notice-text", "text"), tag("ai-notice-resets", "resets"), tag("ai-notice-actions", "actions"));
    const dismiss = tag("ui-button", "dismiss");
    const close = document.createElement("button");
    close.type = "button";
    close.innerHTML = icons.dismiss;
    dismiss.append(close);
    dismiss.addEventListener("action", (event) => instance.api.dismiss({ source: (event as CustomEvent<UiActionDetail>).detail.source }));
    el.replaceChildren(tag("span", "icon"), body, dismiss);
    if (written && !instance.get().text) (el as AiNoticeElement).text = written;
  }

  const part = <T extends HTMLElement = HTMLElement>(name: string) => el.querySelector<T>(`:scope [data-part='${name}']`)!;
  let shownActions = "";

  const sync = () => {
    const { heading, tone, text, actions, resetsAt, dismissible, expired, now, strings: s } = instance.get();
    part("icon").innerHTML = icons[tone];
    part("heading").textContent = heading;
    part("text").textContent = text;

    const close = part("dismiss");
    close.hidden = !dismissible;
    close.querySelector("button")!.setAttribute("aria-label", s.dismiss);
    close.querySelector("button")!.title = s.dismiss;

    const lang = el.closest("[lang]")?.getAttribute("lang") || navigator.language;
    part("resets").textContent = resetsAt === null ? "" : expired ? s.expired : s.resets(new Date(resetsAt), new Date(now || Date.now()), lang);

    const key = JSON.stringify([actions, s.newTab]);
    if (key === shownActions) return;
    shownActions = key;
    let primary = false;
    part("actions").replaceChildren(
      ...actions.map((action) => {
        const main = Boolean(action.primary) && !primary;
        primary ||= main;
        const href = action.href && safeHref.test(action.href.trim()) ? action.href.trim() : "";
        if (href) {
          const link = tag("a", "action") as HTMLAnchorElement;
          link.dataset.value = action.value;
          link.toggleAttribute("data-primary", main);
          link.href = href;
          link.textContent = action.label;
          if (action.newTab) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.setAttribute("aria-label", `${action.label} ${s.newTab}`);
          }
          link.addEventListener("click", (event) => {
            if (!instance.api.act(action.value, { event })) event.preventDefault();
          });
          return link;
        }
        const wrapper = tag("ui-button", "action");
        wrapper.dataset.value = action.value;
        wrapper.toggleAttribute("data-primary", main);
        wrapper.toggleAttribute("disabled", Boolean(action.disabled));
        needsPerson(wrapper, action.confirm ?? "");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = action.label;
        wrapper.append(button);
        // The press's own source, since the change comes from the button's event, not a key or pointer of ours.
        wrapper.addEventListener("action", (event) => instance.api.act(action.value, { source: (event as CustomEvent<UiActionDetail>).detail.source }));
        return wrapper;
      }),
    );
  };
  sync();
  return instance.subscribe(sync);
}

const parts = createParts(notice, {
  root: {
    tag: "ai-notice",
    display: "block",
    events: { onAction: "noticeaction", onExpire: "noticeexpire" },
    state: {
      open: { get: (api) => api.getOpen(), set: (api, value) => api.setOpen(value !== false) },
    },
    api: ["act", "dismiss", "setOpen"],
    render: (el, instance) => render(el, instance),
  },
  text: { tag: "ai-notice-text", display: "block" },
  resets: { tag: "ai-notice-resets", display: "block" },
  actions: { tag: "ai-notice-actions", display: "block" },
});

/** The element's class, for `instanceof` checks. Undefined on a server, where nothing is defined. */
export const AiNoticeElement = parts.Root as unknown as { new (): AiNoticeElement; prototype: AiNoticeElement } | undefined;

adoptStyles(styles);

declare global {
  interface HTMLElementTagNameMap {
    "ai-notice": AiNoticeElement;
  }
}
