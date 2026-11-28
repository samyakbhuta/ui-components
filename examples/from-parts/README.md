# AI chat from the parts

The same chat as the [quick start](../quick-start), built from [`@samyakbhuta/ui-components`](https://www.npmjs.com/package/@samyakbhuta/ui-components)'s parts instead of `<ai-chat>`: an `<ai-transcript>`, an `<ai-composer>`, and an `<ai-message>` for each message. Your code runs the conversation, so you can lay the parts out your own way, put your own markup between them, and decide what each turn shows.

A stand-in model streams your words back; replace `model()` in `index.html` with a call to your own.

Start a project from it:

```bash
npx degit samyakbhuta/ui-components/examples/from-parts my-chat
```

```bash
cd my-chat && npm install && npm run dev
```

Each component's API, with live examples: https://uisdk-components.netlify.app
