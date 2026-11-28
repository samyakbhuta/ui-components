# Making `<ai-chat>` your own

The [quick start](../examples/quick-start) gives you a working chat in one page: an `<ai-chat>` tag and a stand-in model that streams your words back. This guide shows how to change it, one idea at a time:

1. [Files and a model picker in the message box](#1-files-and-a-model-picker-in-the-message-box)
2. [A welcome for an empty chat](#2-a-welcome-for-an-empty-chat)
3. [Your own words](#3-your-own-words)
4. [Your own colours](#4-your-own-colours)
5. [Richer replies: thinking, tools, sources and follow-ups](#5-richer-replies-thinking-tools-sources-and-follow-ups)
6. [Asking the person, and waiting for the answer](#6-asking-the-person-and-waiting-for-the-answer)
7. [Remembering the conversation](#7-remembering-the-conversation)
8. [A sidebar of saved chats](#8-a-sidebar-of-saved-chats)

You don't need to know Web Components to follow it. If you can edit an HTML file, you can do every recipe.

## Before you start

Start a project from the quick start, and run it:

```bash
npx degit samyakbhuta/ui-components/examples/quick-start my-chat
```

```bash
cd my-chat && npm install && npm run dev
```

Open the address it prints, usually http://localhost:5173, and send a message to check it works.

**How to use a recipe:** each one is a whole `index.html`. Replace your project's `index.html` with it, and the page reloads by itself. The recipes don't build on each other: each starts from the quick start and adds one thing, so you can do them in any order. Once you've seen how one works, mix its lines into your own page.

**See it first:** every recipe also runs on the site. Follow its **See it running** link to try it before you copy it.

The models in these recipes are stand-ins, so you can try everything without an account anywhere. To connect a real model, replace `chat.model` with a function that calls yours: [The model](../packages/ui-components/src/ai-chat/README.md#the-model) says what it gets and what it can send back.

## 1. Files and a model picker in the message box

People can attach files, speak instead of type, and choose a model. The stand-in model says what it was sent, so you can see the files and the model reach it.

**See it running:** https://uisdk-components.netlify.app/recipes/ai-chat/message-box.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI chat with files and models</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: system-ui, sans-serif;
      }
      body {
        max-width: 48rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
    </style>
  </head>
  <body>
    <ai-chat style="height: 80vh">
      <ai-composer attachments voice default-model="fast"></ai-composer>
    </ai-chat>

    <script type="module">
      import "@samyakbhuta/ui-components";

      const chat = document.querySelector("ai-chat");

      // The models people can choose from, in a menu in the message box.
      chat.composer.models = [
        { value: "fast", label: "Fast", description: "Quick answers" },
        { value: "careful", label: "Careful", description: "Slower, more thorough answers" },
      ];

      // A stand-in for your model: it says what it was sent.
      chat.model = async function* ({ prompt }) {
        const files = prompt.files.map((file) => file.name).join(", ") || "none";
        const reply = `You said: ${prompt.text}\n\nModel: ${prompt.model}\n\nFiles: ${files}`;
        for (const word of reply.split(" ")) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          yield `${word} `;
        }
      };
    </script>
  </body>
</html>
```

**What's new:**
- An `<ai-composer>` written inside `<ai-chat>` is used as the chat's message box. Its attributes turn features on: `attachments` adds an Attach button (you can also drop or paste files), and `voice` adds a microphone button.
- `chat.composer` is that message box. Setting `chat.composer.models` adds a menu to choose a model, and the `default-model` attribute says which one is chosen to begin with.
- The model gets what was sent as `prompt`: `prompt.text`, the attached files as `prompt.files`, and the chosen model's `value` as `prompt.model`.

**Try it:** attach a file with **+**, choose **Careful** from the Model menu, and send a message.

**Good to know:**
- Voice input uses the browser's speech recognition. In a browser without it, like Firefox, the microphone shows greyed out with a tooltip that says why.
- `prompt.files` are [`File`](https://developer.mozilla.org/en-US/docs/Web/API/File) objects. To send them to your server, put them in a [`FormData`](https://developer.mozilla.org/en-US/docs/Web/API/FormData).

**Going further:** the message box can also offer modes, thinking levels, `/` commands and `@` references. See [Turning features on](../packages/ui-components/src/ai-composer/README.md#turning-features-on).

## 2. A welcome for an empty chat

Before the first message, show a heading and a few prompts people can send with one press.

**See it running:** https://uisdk-components.netlify.app/recipes/ai-chat/welcome.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI chat with a welcome</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: system-ui, sans-serif;
      }
      body {
        max-width: 48rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
    </style>
  </head>
  <body>
    <ai-chat style="height: 80vh">
      <h2 slot="empty">What can I help with?</h2>
    </ai-chat>

    <script type="module">
      import "@samyakbhuta/ui-components";

      const chat = document.querySelector("ai-chat");

      // Prompts people can send with one press, while the chat is empty.
      chat.suggestions = [
        "Explain web components simply",
        "Write a short poem about the sea",
        { label: "Plan my week", value: "Help me plan my week. Ask me what I have on." },
      ];

      // A stand-in for your model: it streams your words back.
      chat.model = async function* ({ prompt }) {
        for (const word of `You said: ${prompt.text}`.split(" ")) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          yield `${word} `;
        }
      };
    </script>
  </body>
</html>
```

**What's new:**
- An element inside `<ai-chat>` with `slot="empty"` shows while the chat is empty. Here it's a heading, but it can be any HTML, like a logo or a paragraph.
- `chat.suggestions` lists the starter prompts. A string is sent as it is. An object with `label` and `value` shows its `label` on the button and sends its `value`.

**Try it:** press **Plan my week**. The welcome goes away once the chat has a message.

**Going further:** [Setting it up in markup](../packages/ui-components/src/ai-chat/README.md#setting-it-up-in-markup).

## 3. Your own words

Change what the chat says, to match your app's voice. Here it's a bakery's helper.

**See it running:** https://uisdk-components.netlify.app/recipes/ai-chat/your-words.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI chat in your own words</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: system-ui, sans-serif;
      }
      body {
        max-width: 48rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
    </style>
  </head>
  <body>
    <ai-chat style="height: 80vh"></ai-chat>

    <script type="module">
      import "@samyakbhuta/ui-components";

      const chat = document.querySelector("ai-chat");

      // The chat's own words.
      chat.strings = {
        stopped: "You stopped this answer.",
        error: "Sorry, that didn't work. Press Retry to try again.",
      };

      // The message box's words.
      chat.composer.strings = {
        prompt: "Your question",
        placeholder: "Ask about our cakes…",
        send: "Ask",
        stop: "Stop answering",
        enterHint: "Enter to ask · Shift+Enter for a new line",
      };

      // The conversation's words, for screen readers.
      chat.transcript.strings = {
        label: "Your questions and our answers",
        jump: "Back to the newest answer",
      };

      // A stand-in for your model: it streams your words back.
      chat.model = async function* ({ prompt }) {
        for (const word of `You said: ${prompt.text}`.split(" ")) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          yield `${word} `;
        }
      };
    </script>
  </body>
</html>
```

**What's new:**
- Each part has a `strings` property with its words. You only list the words you want to change; the rest keep their defaults.
- `chat.strings` holds the chat's own words, like the note under a stopped reply.
- `chat.composer.strings` holds the message box's words. `prompt` is the box's name for screen readers, and `send` and `stop` name the Send and Stop buttons.
- `chat.transcript.strings` holds the conversation's words, like the **Jump to latest** button that shows when you scroll up.

**Try it:** check the placeholder and the hint under the box. Then send a message and press Stop while the answer streams in, to see your note under it.

**Good to know:** the buttons under each reply, like Copy and Retry, keep their English names for now: `<ai-chat>` doesn't pass words on to them yet.

**Going further:** every word you can change is listed in the [chat's Translation table](../packages/ui-components/src/ai-chat/README.md#translation) and the [message box's](../packages/ui-components/src/ai-composer/README.md#translation).

## 4. Your own colours

Give the chat your brand's colour, softer corners and more room, in light and dark mode.

**See it running:** https://uisdk-components.netlify.app/recipes/ai-chat/your-colours.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI chat in your colours</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: system-ui, sans-serif;
      }
      body {
        max-width: 48rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }

      /* Your brand: purple, with softer corners and more room. */
      ai-composer {
        --ai-composer-accent: light-dark(#6d28d9, #c4b5fd);
        --ai-composer-accent-text: light-dark(white, #1e1b4b);
        --ai-composer-radius: 0.75rem;
      }
      ai-message {
        --ai-message-bubble: light-dark(#ede9fe, #2e1065);
      }
      ai-chat {
        --ai-chat-gap: 1.5rem;
      }
    </style>
  </head>
  <body>
    <ai-chat style="height: 80vh"></ai-chat>

    <script type="module">
      import "@samyakbhuta/ui-components";

      const chat = document.querySelector("ai-chat");

      // A stand-in for your model: it streams your words back.
      chat.model = async function* ({ prompt }) {
        for (const word of `You said: ${prompt.text}`.split(" ")) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          yield `${word} `;
        }
      };
    </script>
  </body>
</html>
```

**What's new:**
- The CSS at the end of `<style>` sets **custom properties**: named values, starting with `--`, that each component reads its colours and sizes from.
- `--ai-composer-accent` is the Send button's colour, and `--ai-composer-accent-text` the arrow on it. `--ai-composer-radius` rounds the box's corners. `--ai-message-bubble` colours your own messages, and `--ai-chat-gap` is the space between the conversation and the box.
- [`light-dark()`](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/light-dark) gives one colour for light mode and one for dark mode. It works because the page sets `color-scheme: light dark` at the top.

**Try it:** send a message, then switch your computer between light and dark mode.

**Good to know:**
- Set each component's properties on that component: `--ai-composer-…` on `ai-composer`, `--ai-message-…` on `ai-message`. Each component sets its own defaults on itself, so putting them on `ai-chat` or `:root` has no effect.
- Pick colours with enough contrast: the arrow on the Send button needs at least 4.5:1 against its background, in both modes. The colours here pass.
- Your CSS always wins over the components' own, so you don't need `!important`.

**Going further:** every property each component reads is in its README's Styling section, like the [message box's](../packages/ui-components/src/ai-composer/README.md#styling).

## 5. Richer replies: thinking, tools, sources and follow-ups

A reply can be more than text. A model can show it's thinking, show the tools it uses, cite its sources, and suggest what to ask next.

**See it running:** https://uisdk-components.netlify.app/recipes/ai-chat/richer-replies.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI chat with richer replies</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: system-ui, sans-serif;
      }
      body {
        max-width: 48rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
    </style>
  </head>
  <body>
    <ai-chat style="height: 80vh"></ai-chat>

    <script type="module">
      import "@samyakbhuta/ui-components";

      const chat = document.querySelector("ai-chat");

      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      // A stand-in for your model. Besides text, it can send other kinds of chunks.
      chat.model = async function* ({ prompt }) {
        // Thinking: shown above the reply until the first words arrive.
        yield { type: "thinking", text: "Let me look that up." };
        await wait(800);

        // A tool call: shown running, then done when its result arrives.
        yield { type: "tool", id: "search-1", name: "web_search", label: "Searching the web", input: { query: prompt.text } };
        await wait(1000);
        yield { type: "tool-result", id: "search-1", summary: "Found 2 pages" };

        // Text, with [1] and [2] pointing at the sources below.
        const reply = "Custom elements are HTML tags you define yourself [1]. Every current browser supports them [2].";
        for (const word of reply.split(" ")) {
          await wait(60);
          yield `${word} `;
        }

        // Sources: the [1] and [2] above become links to these.
        yield {
          type: "sources",
          sources: [
            { title: "Using custom elements", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements" },
            { title: "Custom elements on Can I use", url: "https://caniuse.com/custom-elementsv1" },
          ],
        };

        // Follow-up questions, which send when pressed.
        yield { type: "suggestions", suggestions: ["How do I make one?", "Do they work with React?"] };
      };
    </script>
  </body>
</html>
```

**What's new:** the model yields **chunks**. A string is text to add, and an object with a `type` is something else:
- `{ type: "thinking", text }` shows "Thinking…" above the reply, until the first words or a tool call arrive. Then it says how long it thought, and opens to show the `text`.
- `{ type: "tool", id, name, label, input }` shows a tool call, running. `{ type: "tool-result", id, summary }` with the same `id` marks it done. It opens to show the `input`.
- Markers like `[1]` in the text become links to the matching source in `{ type: "sources", sources }`.
- `{ type: "suggestions", suggestions }` adds follow-up questions under the reply, which send when pressed.

**Try it:** send any message. When the reply is done, open the thinking line ("Thought for…") and **Found 2 pages**, and point at the `1` in the reply.

**Good to know:** a real model's API sends events of its own, like "thinking started" or "tool used". Your `chat.model` turns them into these chunks.

**Going further:** [the list of chunks](../packages/ui-components/src/ai-chat/README.md#the-model).

## 6. Asking the person, and waiting for the answer

A model can stop and ask a question, or ask permission before it does something. It waits for the person, then carries on with their answer.

**See it running:** https://uisdk-components.netlify.app/recipes/ai-chat/ask-and-wait.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI chat that asks</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: system-ui, sans-serif;
      }
      body {
        max-width: 48rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
    </style>
  </head>
  <body>
    <ai-chat style="height: 80vh"></ai-chat>

    <script type="module">
      import "@samyakbhuta/ui-components";

      const chat = document.querySelector("ai-chat");

      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      async function* say(text) {
        for (const word of text.split(" ")) {
          await wait(60);
          yield `${word} `;
        }
      }

      // A stand-in for your model. When it yields a question or an approval, the chat
      // waits for the person, and their answer comes back as the value of that yield.
      chat.model = async function* () {
        const answer = yield {
          type: "question",
          question: "Which city should I plan a weekend in?",
          options: ["Lisbon", "Rome", "Paris"],
          other: true,
        };
        const city = answer.labels[0];
        yield* say(`${city} it is. I've found a hotel there.`);

        const decision = yield {
          type: "approval",
          name: "book_hotel",
          label: "Book a hotel",
          description: "This pays for two nights.",
          input: { city, nights: 2 },
          reason: true,
        };
        if (decision.decision === "deny") {
          yield* say(`OK, I won't book it. ${decision.reason ?? ""}`);
        } else {
          yield* say(`Booked: two nights in ${city}.`);
        }
      };
    </script>
  </body>
</html>
```

**What's new:**
- `yield { type: "question", … }` shows a question with choices. `other: true` adds an **Other** choice with a text box.
- `yield { type: "approval", … }` asks permission to use a tool, showing the `input` it would get. `reason: true` adds a box to say what to do instead.
- The chat **waits** at that `yield`. When the person answers, the answer comes back as the value of the `yield`, so `const answer = yield {…}` puts it in `answer`:
  - for a question, `answer.labels` has the chosen choices' names, and `answer.value` their values;
  - for an approval, `decision.decision` is `"allow"`, `"always"` or `"deny"`, and `decision.reason` is what was typed, or `null`.
- `yield*` hands over to another generator, here `say()`, which streams a sentence a word at a time.

**Try it:** send any message, choose a city and press **Send**, then **Allow once**. Send again and try **Deny** with a reason. You can also type your answer in the message box instead of pressing the buttons.

**Good to know:** add `always: true` to an approval to offer **Always allow**. The chat then stops asking about that tool, and `chat.alwaysAllowed` lists the tools it won't ask about.

**Going further:** [Questions and approvals](../packages/ui-components/src/ai-chat/README.md#questions-and-approvals).

## 7. Remembering the conversation

Keep the conversation when the page reloads, with a button to start over.

**See it running:** https://uisdk-components.netlify.app/recipes/ai-chat/remember.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI chat that remembers</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: system-ui, sans-serif;
      }
      body {
        max-width: 48rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
    </style>
  </head>
  <body>
    <ai-chat style="height: 75vh"></ai-chat>
    <p><button type="button" id="start-over">Start over</button></p>

    <script type="module">
      import "@samyakbhuta/ui-components";

      const chat = document.querySelector("ai-chat");

      // Show the conversation saved last time, if there is one.
      const saved = localStorage.getItem("my-chat");
      if (saved) chat.messages = JSON.parse(saved);

      // Save it whenever it changes: a reply finished, a question was answered, and so on.
      chat.addEventListener("chatchange", (event) => {
        localStorage.setItem("my-chat", JSON.stringify(event.detail.messages));
      });

      // clear() empties the chat, and chatchange saves the empty chat.
      document.querySelector("#start-over").addEventListener("click", () => chat.clear());

      // A stand-in for your model: it streams your words back.
      chat.model = async function* ({ prompt }) {
        for (const word of `You said: ${prompt.text}`.split(" ")) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          yield `${word} `;
        }
      };
    </script>
  </body>
</html>
```

**What's new:**
- `chat.messages` is the whole conversation as plain data, which can be turned into text with `JSON.stringify` and back with `JSON.parse`. Setting it shows a saved conversation.
- The chat fires `chatchange` each time the conversation is worth saving: when a reply finishes or stops, or a question is answered. `event.detail.messages` is the conversation at that moment.
- [`localStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) keeps text in the browser, under a name, here `"my-chat"`. It stays after the page closes.
- `chat.clear()` empties the conversation.

**Try it:** send a message, reload the page, and it's still there. Press **Start over** and reload again.

**Good to know:**
- `localStorage` is only in this browser, on this device. To keep chats across devices, send `event.detail.messages` to your server instead.
- Attached files aren't kept: `JSON.stringify` can't save them.

**Going further:** [Saving and restoring](../packages/ui-components/src/ai-chat/README.md#saving-and-restoring).

## 8. A sidebar of saved chats

Keep several chats, with a list to switch between them, start a new one, rename one or delete it. This one is longer, because your page decides where chats are kept.

**See it running:** https://uisdk-components.netlify.app/recipes/ai-chat/sidebar.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI chat with a sidebar</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: system-ui, sans-serif;
      }
      body {
        max-width: 48rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }

      body {
        max-width: 64rem;
      }
      /* The list on the left, the chat on the right. */
      .app {
        display: grid;
        grid-template-columns: 15rem minmax(0, 1fr);
        gap: 1.5rem;
        height: 85vh;
      }
      .app ai-chat-list {
        overflow: auto;
      }
      .app ai-chat {
        min-height: 0;
      }
      /* On a phone, the list goes above the chat. */
      @media (max-width: 40rem) {
        .app {
          grid-template-columns: minmax(0, 1fr);
          grid-template-rows: auto minmax(0, 1fr);
        }
        .app ai-chat-list {
          max-height: 30vh;
        }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <ai-chat-list actions="rename delete"></ai-chat-list>
      <ai-chat></ai-chat>
    </div>

    <script type="module">
      import "@samyakbhuta/ui-components";

      const list = document.querySelector("ai-chat-list");
      const chat = document.querySelector("ai-chat");

      // Every saved chat: { id, title, updatedAt, messages }.
      let chats = JSON.parse(localStorage.getItem("my-chats") ?? "[]");
      // The id of the open chat, or null for a new one that isn't saved yet.
      let openId = null;

      // Saves the chats, and shows them in the list.
      function save() {
        localStorage.setItem("my-chats", JSON.stringify(chats));
        list.chats = chats;
        list.selected = openId;
      }

      // Opens a saved chat, or a new one with null.
      function open(id) {
        openId = id;
        chat.messages = chats.find((saved) => saved.id === id)?.messages ?? [];
        save();
      }

      // When the open chat changes, save it. A new chat is saved once it has a message.
      chat.addEventListener("chatchange", (event) => {
        const { messages } = event.detail;
        if (messages.length === 0) return;
        let saved = chats.find((saved) => saved.id === openId);
        if (!saved) {
          saved = { id: String(Date.now()), title: messages[0].text.slice(0, 40) };
          chats.push(saved);
          openId = saved.id;
        }
        saved.messages = messages;
        saved.updatedAt = Date.now();
        save();
      });

      list.addEventListener("chatnew", () => open(null));
      list.addEventListener("chatselect", (event) => open(event.detail.id));
      list.addEventListener("chatrename", (event) => {
        chats.find((saved) => saved.id === event.detail.id).title = event.detail.title;
        save();
      });
      list.addEventListener("chatdelete", (event) => {
        chats = chats.filter((saved) => saved.id !== event.detail.id);
        if (event.detail.id === openId) open(null);
        else save();
      });

      save();

      // A stand-in for your model: it streams your words back.
      chat.model = async function* ({ prompt }) {
        for (const word of `You said: ${prompt.text}`.split(" ")) {
          await new Promise((resolve) => setTimeout(resolve, 80));
          yield `${word} `;
        }
      };
    </script>
  </body>
</html>
```

**What's new:**
- `<ai-chat-list>` shows the list: **New chat** at the top, then the chats grouped by day. It doesn't save anything: it shows `list.chats`, highlights the one whose `id` is `list.selected`, and fires an event when someone presses something.
- `chats` holds every saved chat, with its `messages`, and `openId` is the open one. `save()` writes them to `localStorage` and updates the list, and `open(id)` shows a chat by setting `chat.messages`.
- A new chat isn't saved until it has a message. Then `chatchange` gives it an `id` and a title, from the start of the first message.
- The list's events: `chatnew` (New chat), `chatselect` (a chat was pressed), `chatrename` and `chatdelete` (from the **…** menu on each chat).
- The CSS puts the list on the left and the chat on the right, and on a phone, the list above the chat.

**Try it:** send a message, press **New chat** and send another, then switch between the two. Open the **…** menu on one to rename or delete it. Reload, and they're all still there.

**Good to know:** to also offer **Export as Markdown** in the menu, add `export` to `actions` and handle `chatexport`. The [chat demo](https://uisdk-components.netlify.app/experiments/chat-shell.html) does, and keeps other details too, like which chats are waiting for an answer.

**Going further:** [`<ai-chat-list>`](../packages/ui-components/src/ai-chat-list/README.md).

## When `<ai-chat>` isn't enough

`<ai-chat>` decides the layout: the conversation, with the message box under it. If you need your own markup between them, your own kind of card in a reply, or to run the conversation yourself, build the chat from its parts instead. The [from-the-parts starter](../examples/from-parts) is the same chat as the quick start, built that way:

```bash
npx degit samyakbhuta/ui-components/examples/from-parts my-chat
```

[Using the components in another app](using-the-components.md) covers frameworks, styling, translation and server rendering.
