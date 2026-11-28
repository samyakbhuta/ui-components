import { announce, definePrimitive, dispatch, prepareAnnouncements, type ChangeDetails, type ChangeSource, createChange } from "@ui-sdk/core";

/** How serious the notice is. It sets the colour and the icon. */
export type NoticeTone = "warning" | "error" | "info";

/** A button or link on the notice. With `href` it's a link; otherwise a button that fires `noticeaction`. */
export type NoticeAction = {
  value: string;
  label: string;
  /** Makes it a link to this address. Only `http:`, `https:`, `mailto:`, relative addresses and `#…` are kept. */
  href?: string;
  /** Opens the link in a new tab. */
  newTab?: boolean;
  /** The main action, shown solid. Only the first one counts. */
  primary?: boolean;
  disabled?: boolean;
  /**
   * What pressing it does, asked of the person before an AI agent may press it
   * (`data-agent-confirm`), like "Opens checkout to upgrade your plan". Without it, agents press freely.
   */
  confirm?: string;
};

/** Every word `<ai-notice>` shows or announces. Override any of them through `strings`. */
export type NoticeStrings = {
  /** The line saying when it resets. `lang` is the element's language, for formatting the time. */
  resets: (at: Date, now: Date, lang: string) => string;
  /** Shown, and announced, once the reset time has passed. */
  expired: string;
  /** The dismiss button's name, with `dismissible`. */
  dismiss: string;
  /** Added to a link's name when it opens in a new tab. */
  newTab: string;
  /** The tone, said before the heading: "Warning", "Error" or "Note". */
  tone: (tone: NoticeTone) => string;
};

/** "Resets at 3:00 PM · in 2 hours", or with the day when it isn't today. */
function resetsLine(at: Date, now: Date, lang: string) {
  const time = new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit" }).format(at);
  const sameDay = at.toDateString() === now.toDateString();
  const when = sameDay ? `at ${time}` : `on ${new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short" }).format(at)} at ${time}`;
  const minutes = Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 60_000));
  const relative = new Intl.RelativeTimeFormat(lang, { numeric: "always" });
  const inWords =
    minutes < 60
      ? relative.format(minutes, "minute")
      : minutes < 48 * 60
        ? relative.format(Math.round(minutes / 60), "hour")
        : relative.format(Math.round(minutes / 1440), "day");
  return `Resets ${when} · ${inWords}`;
}

export const defaultNoticeStrings: NoticeStrings = {
  resets: resetsLine,
  expired: "You can carry on now.",
  dismiss: "Dismiss",
  newTab: "(opens in a new tab)",
  tone: (tone) => (tone === "error" ? "Error" : tone === "info" ? "Note" : "Warning"),
};

const tones: NoticeTone[] = ["warning", "error", "info"];

/** A reset time as a date, from a `Date`, an ISO string or the `resets-at` attribute; null when there's none. */
export const resetDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

export type NoticeOptions = {
  /** What it's about, like "You've reached your usage limit". */
  heading?: string;
  /** `warning` (the default), `error` or `info`. */
  tone?: NoticeTone | string;
  /** The message under the heading. Shown as text, never parsed as HTML. */
  text?: string;
  /** The buttons and links, in order. */
  actions?: NoticeAction[];
  /** When it stops applying, like when a limit resets: a `Date` or an ISO time. Shown as a time that counts down. */
  resetsAt?: Date | string | null;
  /** Adds a button to close it. */
  dismissible?: boolean;
  strings?: Partial<NoticeStrings>;
  /** Whether it shows. Dismiss closes it. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean, details: ChangeDetails<"close-press" | "imperative">) => void;
  /** A button or link was pressed. `details.cancel()` stops a link from opening. */
  onAction?: (value: string, details: ChangeDetails<"press" | "imperative">) => void;
  /** The reset time passed. */
  onExpire?: (value: null, details: ChangeDetails<"timeout">) => void;
};

/** The words in use: the defaults with any from `strings` on top. */
export const noticeStrings = (options: Pick<NoticeOptions, "strings">): NoticeStrings => ({ ...defaultNoticeStrings, ...options.strings });

/** The options it shows, copied into state so a change to any of them renders again. */
const shown = (options: NoticeOptions) => ({
  heading: options.heading ?? "",
  tone: (tones.includes(options.tone as NoticeTone) ? options.tone : "warning") as NoticeTone,
  text: options.text ?? "",
  actions: options.actions ?? [],
  resetsAt: resetDate(options.resetsAt)?.getTime() ?? null,
  dismissible: options.dismissible ?? false,
  strings: noticeStrings(options),
});

export const notice = definePrimitive({
  name: "notice",
  options: {
    heading: "string",
    tone: "string",
    text: "value",
    actions: "value",
    resetsAt: (attribute: string | null) => resetDate(attribute),
    dismissible: "boolean",
    strings: "value",
    open: "boolean",
    defaultOpen: "boolean",
    onOpenChange: "callback",
    onAction: "callback",
    onExpire: "callback",
  },
  controlled: ["open"],
  state: (options: NoticeOptions) => ({
    open: options.open ?? options.defaultOpen ?? true,
    expired: false,
    // The clock starts once bound, in the browser, so a server and a browser agree on the state.
    now: 0,
    ...shown(options),
  }),
  sync: (options) => ({ ...shown(options), ...(options.open === undefined ? {} : { open: options.open }) }),
  api: (context) => {
    const change = createChange(context);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watching = false;
    context.onDestroy(() => clearTimeout(timer));

    // Keeps the reset line current, a minute at a time, and says once when the time has passed.
    const tick = () => {
      clearTimeout(timer);
      const now = Date.now();
      context.store.set({ now });
      const { resetsAt, expired, strings } = context.store.get();
      if (resetsAt === null || !watching) return;
      if (resetsAt <= now) {
        if (expired) return;
        context.store.set({ expired: true });
        announce(strings.expired);
        dispatch(context, "onExpire", null, { reason: "timeout" });
        return;
      }
      const untilMinute = 60_000 - (now % 60_000);
      timer = setTimeout(tick, Math.min(untilMinute, resetsAt - now) + 20);
    };

    // A new reset time starts over.
    let resetsAt = context.store.get().resetsAt;
    context.onOptions((options) => {
      const next = resetDate(options.resetsAt)?.getTime() ?? null;
      if (next === resetsAt) return;
      resetsAt = next;
      context.store.set({ expired: false, resetsAt: next });
      tick();
    });

    return {
      /** Starts the clock once the element is on the page, and says the notice out loud unless a transcript will. */
      watch(el: HTMLElement) {
        watching = true;
        prepareAnnouncements(el.ownerDocument);
        const { heading, text } = context.store.get();
        if (!el.closest("ai-transcript")) {
          const words = [heading, text].filter(Boolean).join(". ");
          requestAnimationFrame(() => words && announce(words));
        }
        tick();
        return () => {
          watching = false;
          clearTimeout(timer);
        };
      },
      /** Presses the action with this value, as a click does. Returns false when nothing happened. */
      act(value: string, options: { event?: Event; source?: ChangeSource } = {}) {
        const action = context.store.get().actions.find((item) => item.value === value);
        if (!action || action.disabled) return false;
        return !dispatch(context, "onAction", value, { reason: options.event || options.source ? "press" : "imperative", event: options.event, source: options.source });
      },
      /** Closes it, as Dismiss does. Returns false when it was cancelled. */
      dismiss(options: { source?: ChangeSource } = {}) {
        return change("open", false, { reason: options.source ? "close-press" : "imperative", source: options.source });
      },
      setOpen: (open: boolean) => change("open", open, { reason: "imperative" }),
      getOpen: () => context.store.get().open,
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state, part) => ({
        // The icon shows the tone; the name says it.
        "aria-label": state.heading ? `${state.strings.tone(state.tone)}: ${state.heading}` : state.strings.tone(state.tone),
        "aria-describedby": `${part.id}-text ${part.id}-resets`,
        expired: state.expired ? "" : undefined,
        hidden: state.open ? undefined : "",
      }),
      bind: (el, part) => part.api.watch(el),
    }),
    text: slot({
      present: (state) => state.text !== "",
      attrs: (_state, part) => ({ id: `${part.id}-text` }),
    }),
    resets: slot({
      present: (state) => state.resetsAt !== null,
      attrs: (_state, part) => ({ id: `${part.id}-resets` }),
    }),
    // Once it's over, the way round it isn't needed.
    actions: slot({
      present: (state) => state.actions.length > 0 && !state.expired,
    }),
  }),
  // Its buttons are ui-sdk Buttons an agent can press, each marked for a person when it says so.
  agent: { actions: [] },
});
