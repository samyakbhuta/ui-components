# `<ai-notice>`

Something that stops the conversation and needs action: a usage limit, a rate limit, a sign-in that ran out, a lost connection, a failed payment. It has a heading, a message, an optional time when it stops applying, and your buttons and links, like **Upgrade plan** or **Switch to a smaller model**.

It's built as a ui-sdk primitive, `notice` (in `notice.ts`), rendered as custom elements with ui-sdk's `createParts`. So it reports what happens like ui-sdk's own components do, with a reason and a source.

```ts
import "@samyakbhuta/ui-components/ai-notice"; // registers <ai-notice>, and loads its CSS
```

```html
<ai-notice heading="You've reached your usage limit" resets-at="2026-11-28T15:00:00Z">
  You've used this plan's messages for now. Upgrade, or carry on in other ways.
</ai-notice>
```

```ts
const notice = document.querySelector("ai-notice")!;
notice.actions = [
  { value: "upgrade", label: "Upgrade plan", href: "/pricing", primary: true },
  { value: "smaller-model", label: "Switch to a smaller model" },
  { value: "extra", label: "Use extra credits", confirm: "Spends your extra credits" },
  { value: "notify", label: "Notify me" },
];
notice.addEventListener("noticeaction", (event) => {
  if (event.detail.value === "smaller-model") useModel("haiku");
});
```

## How it looks and behaves

- **Its tone** sets the colour and icon: `warning` (the default), `error` or `info`.
- **A reset time counts down:** "Resets at 3:00 PM · in 2 hours", with the day when it isn't today, in the page's language. It updates every minute. When the time comes, the notice says "You can carry on now.", hides its buttons, gets the `expired` attribute and fires `noticeexpire`.
- **Actions** are buttons, or links when they have an `href`. The first one marked `primary` is solid. Each fires `noticeaction`; cancelling it keeps a link from opening, so you can handle it in the app. An action with `confirm`, like one that spends money, asks the person before an AI agent may press it.
- **`dismissible`** adds a close button. It closes the notice (`open` turns false, and it hides) and fires `openchange`, unless a listener cancels it.

In [`<ai-chat>`](../ai-chat/README.md), a model yields `{ type: "notice", heading, … }`, and the message box locks until the notice resets, is dismissed, or the app calls `chat.unlock()`. See [In a chat](#in-a-chat).

## Attributes

| Attribute | Default | What it does |
| --- | --- | --- |
| `heading` | none | What it's about, like "You've reached your usage limit". |
| `tone` | `warning` | `warning`, `error` or `info`: the colour, the icon, and the word screen readers hear first. |
| `resets-at` | none | When it stops applying, as an ISO time. Shown as a time that counts down. |
| `dismissible` | off | Adds a close button. |
| `open` | on | Whether it shows. Dismiss closes it. |
| `default-open` | on | Whether it starts shown, read once when it's created. |
| `expired` | set by the element | Present once `resets-at` has passed. Style it or check it; don't set it. |

## Properties

| Property | Type | What it holds |
| --- | --- | --- |
| `heading`, `tone`, `dismissible` | | The same as the attributes. |
| `open` | `boolean` | Whether it shows. Setting it doesn't fire `openchange`. |
| `text` | `string` | The message under the heading, as text. Text written inside the element is its starting value. |
| `actions` | `{ value, label, href?, newTab?, primary?, disabled?, confirm? }[]` | The buttons and links, in order. Set it again to change them, like disabling "Notify me" once pressed. `confirm` is the sentence the person is asked before an agent presses that button. |
| `resetsAt` | `Date \| string \| null` | The same as `resets-at`, as a `Date` or an ISO string; it holds what you set. Setting a new time starts over, even after it expired. `resetDate(value)`, exported beside the element, turns it into a `Date`. |
| `strings` | `Partial<NoticeStrings>` | Words to replace; see below. |

## Methods

Its methods are on `api`, like ui-sdk's elements:

| Method | What it does |
| --- | --- |
| `api.act(value)` | Presses the action with that value, as a click does, and fires `noticeaction`. Returns `false` for a disabled or unknown action, or when a listener cancelled it. |
| `api.dismiss()` | Closes it, as the close button does. Returns `false` when a listener cancelled `openchange`. |
| `api.setOpen(open)` | Shows or closes it, firing `openchange`. |

## Events

| Event | `detail` | When |
| --- | --- | --- |
| `noticeaction` | `{ value, reason, source }` | A button or link was pressed (`reason` is `"press"`), or `api.act()` was called (`"imperative"`). `value` is the action's `value`, and `source` says how: `"mouse"`, `"keyboard"`, `"agent"` and so on. Cancelable: on a link, `preventDefault()` keeps it from opening. |
| `noticeexpire` | `{ value: null, reason: "timeout" }` | The reset time passed, while it was shown or before it was. |
| `openchange` | `{ value, reason, source }` | It's closing (`value` is `false`): `reason` is `"close-press"` for the close button, or `"imperative"` for `api.dismiss()` and `api.setOpen()`. `preventDefault()` keeps it showing. |

Like ui-sdk's change events, these don't bubble: listen on the element, or on an element around it with `{ capture: true }`. `<ai-chat>` passes `noticeaction` on from its notices, so there you listen on the chat.

## In a chat

A model yields a notice, usually from where it handles a failed request, then returns:

```ts
chat.model = async function* ({ messages, signal }) {
  const response = await fetch("/api/chat", { method: "POST", body: JSON.stringify({ messages }), signal });
  if (response.status === 429) {
    const { resetsAt } = await response.json();
    yield {
      type: "notice",
      heading: "You've reached your usage limit",
      text: "Upgrade, or carry on in other ways.",
      resetsAt, // an ISO time; the box unlocks then
      actions: [
        { value: "upgrade", label: "Upgrade plan", href: "/pricing", primary: true },
        { value: "smaller-model", label: "Switch to a smaller model" },
      ],
    };
    return;
  }
  yield* streamText(response);
};

chat.addEventListener("noticeaction", (event) => {
  if (event.detail.value === "smaller-model") {
    chat.composer.model = "haiku-5.5";
    chat.unlock(); // the box was locked; carry on
  }
});
```

- The card shows in the reply, and the message box locks. Under it, the composer says "Sending is paused until 3:00 PM" (`chat.strings.locked`).
- The box unlocks at the reset time, when the notice is dismissed, or when you call `chat.unlock()`. A button press alone doesn't unlock it: your app decides, since only it knows whether the way round worked.
- `lock: false` shows the card without locking. An `info` notice doesn't lock unless you pass `lock: true`.
- `messages` saves the notice. A saved chat locks again only while the notice still applies: not after its reset time, and not once it was unlocked.

## Translation

| String | Default |
| --- | --- |
| `resets(at, now, lang)` | `Resets at 3:00 PM · in 2 hours`, or `Resets on Sat 29 Nov at 9:00 AM · in 18 hours` on another day |
| `expired` | `You can carry on now.`: shown, and read out, once the reset time passes |
| `dismiss` | `Dismiss`: the close button's name |
| `newTab` | `(opens in a new tab)`: added to the name of a link with `newTab` |
| `tone(tone)` | `Warning`, `Error` or `Note`: said before the heading, since the colour and icon only show it on screen |

In `<ai-chat>`, set them as `chat.strings = { notice: { … } }`.

## Safety

The heading, the message and the action labels are set as text, never parsed as HTML. Links keep only `http:`, `https:`, `mailto:` and relative addresses; anything else, like `javascript:`, becomes a button that only fires `noticeaction`. Links opening in a new tab get `rel="noopener noreferrer"`.

## Accessibility

- The notice is a group named by its tone and heading, like "Warning: You've reached your usage limit", and described by its message and reset line.
- Shown on its own, it's read out once when it appears, through ui-sdk's shared live region. Inside an [`<ai-transcript>`](../ai-transcript/README.md) the transcript reads it with the reply instead, so it isn't heard twice.
- The tone shows by colour, an icon and, for screen readers, a word. The border and icon are at least 3:1 against the page, and the text at least 4.5:1, in light and dark. In Windows high contrast mode, system colours take over.
- When it expires, "You can carry on now." is read out.
- Buttons are ui-sdk Buttons, so agents can press them through ui-sdk's agent bridge. An action with `confirm` carries `data-agent-confirm`, so the bridge asks the person first. The bridge sees the notice itself as one `notice` component, named like the group, with whether it's `open`.

## Styling

The CSS sits in the `ai-notice` cascade layer.

Set its custom properties on `ai-notice` itself, or once on an element around it, like `ai-chat` or `:root`, and every `<ai-notice>` inside takes them.

**Custom properties:**
- `--ai-notice-warning`, `--ai-notice-error`, `--ai-notice-info`: each tone's colour
- `--ai-notice-muted`: the reset line, and an expired notice
- `--ai-notice-accent`: the primary action and focus rings
- `--ai-notice-accent-text`
- `--ai-notice-radius`

**Parts:** `[data-part="icon"]`, `body`, `heading`, `text`, `resets`, `actions`, `action` (with `data-value`, and `data-primary` on the main one) and `dismiss`. The primitive's parts also carry ui-sdk's `data-slot`: `notice` on the element, and `notice-text`, `notice-resets` and `notice-actions`. `ai-notice[tone="error"]` and `ai-notice[expired]` style by state.

## Tests

`ai-notice.test.ts` covers:
- the group, its name with the tone, and the message as text;
- written text, and the announcement;
- actions as buttons and links, the primary one, cancelling a link, and disabling one;
- safe link addresses;
- the countdown, expiry, and a new reset time;
- dismissing;
- translation and agent use, including an action that asks the person first;
- what each event reports, and the primitive on its own: server rendering, and its parts coming and going.

The browser tests in `e2e/notice.spec.ts` cover:
- the usage limit in the chat shell, with each of its four buttons, the locked box, and a reload while locked;
- the docs page demos and keyboard use;
- contrast for each tone in light and dark;
- phone width.
