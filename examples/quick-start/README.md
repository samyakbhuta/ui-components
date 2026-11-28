# AI chat quick start

A working chat page built with [`@samyakbhuta/ui-components`](https://www.npmjs.com/package/@samyakbhuta/ui-components), in one HTML file. `<ai-chat>` runs the whole conversation: your messages, the replies streaming in, Stop, Retry and errors. A stand-in model streams your words back; replace `model` in `index.html` with a call to your own. It can also yield thinking, tool calls, sources, questions and approvals: see [The model](https://github.com/samyakbhuta/ui-components/blob/main/packages/ui-components/src/ai-chat/README.md#the-model).

Start a project from it:

```bash
npx degit samyakbhuta/ui-components/examples/quick-start my-chat
```

```bash
cd my-chat && npm install && npm run dev
```

Or try it in your browser, with nothing to install: **Open in StackBlitz** on https://uisdk-components.netlify.app.

To make it your own, one step at a time, follow [the recipes](https://uisdk-components.netlify.app/guides/making-ai-chat-your-own.html): files and a model picker, a welcome, your own words and colours, richer replies, questions and approvals, saved chats and a sidebar.

To arrange the parts your own way, or run the conversation yourself, start from [`examples/from-parts`](../from-parts) instead.

Every component, with live examples: https://uisdk-components.netlify.app
