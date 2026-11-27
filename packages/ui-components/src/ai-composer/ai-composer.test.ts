import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { afterEach, expect, test, vi } from "vitest";
import {
  type AiComposerElement,
  defaultModels,
  defaultModes,
  defaultThinkingLevels,
  type PromptSubmitDetail,
  type SpeechRecognizer,
} from "./ai-composer.ts";

const agent = createAgent();
const speech = window as { SpeechRecognition?: unknown };

afterEach(() => {
  delete speech.SpeechRecognition;
});

async function mount(html = "<ai-composer></ai-composer>", setup?: (composer: AiComposerElement) => void) {
  document.body.insertAdjacentHTML("beforeend", html);
  const composer = document.body.lastElementChild as AiComposerElement;
  setup?.(composer);
  await settle();
  const sent: PromptSubmitDetail[] = [];
  composer.addEventListener("promptsubmit", (event) => sent.push(event.detail));
  return {
    composer,
    sent,
    prompt: within(composer).getByRole<HTMLTextAreaElement>("textbox"),
    send: () => composer.querySelector<HTMLButtonElement>("[data-part='send-button']")!,
  };
}

const everything = (composer: AiComposerElement) => {
  composer.modes = defaultModes;
  composer.models = defaultModels;
  composer.thinkingLevels = defaultThinkingLevels;
};

const disabled = (element: Element) => element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true";

test("with no options it is only a prompt box and a Send button", async () => {
  const { composer, prompt, send } = await mount();

  expect(composer.getAttribute("role")).toBe("group");
  expect(composer.getAttribute("aria-label")).toBe("Prompt");
  expect(prompt.getAttribute("aria-label")).toBe("Prompt");
  expect(prompt.placeholder).toBe("Ask anything…");
  expect(within(composer).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Send"]);
  expect(disabled(send())).toBe(true);
  expect(within(composer).queryByRole("radiogroup")).toBeNull();
  expect(within(composer).queryByRole("combobox")).toBeNull();
  expect(composer.querySelector("ui-file-input")).toBeNull();
  expect(composer.querySelector("ui-trigger-menu")!.triggers).toEqual([]);
  expect(composer.querySelector("[data-part='hint']")!.textContent).toBe("Enter to send · Shift+Enter for a new line");
});

test("attachments and voice appear only with their attributes", async () => {
  speech.SpeechRecognition = class {};
  const { composer } = await mount("<ai-composer attachments voice></ai-composer>");

  expect(within(composer).getByRole("button", { name: "Attach files" })).toBeDefined();
  expect(within(composer).getByRole("button", { name: "Voice input" })).toBeDefined();
  expect(composer.querySelector("ui-file-input-dropzone")!.getAttribute("paste-target")).toBe(`#${composer.querySelector("textarea")!.id}`);

  composer.removeAttribute("attachments");
  composer.removeAttribute("voice");
  await settle();
  expect(within(composer).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Send"]);
});

test("voice is greyed out where speech isn't supported, or left out with voice=\"hide\"", async () => {
  const shown = await mount("<ai-composer voice></ai-composer>");
  const voice = within(shown.composer).getByRole("button", { name: "Voice input" });
  expect(disabled(voice)).toBe(true);
  expect(voice.title).toBe("Voice input isn't supported in this browser");

  const hidden = await mount('<ai-composer voice="hide"></ai-composer>');
  expect(within(hidden.composer).queryByRole("button", { name: "Voice input" })).toBeNull();
});

test("Mode, Model and Thinking appear when given choices and start on their default-* values", async () => {
  const { composer } = await mount('<ai-composer default-mode="plan" default-model="sonnet-5.5"></ai-composer>', everything);

  expect(within(composer).getAllByRole("radio").map((radio) => [radio.textContent, radio.getAttribute("aria-checked")])).toEqual([
    ["Auto", "false"],
    ["Plan", "true"],
    ["Accept-edits", "false"],
  ]);
  expect(within(composer).getByRole("combobox", { name: "Model" }).textContent).toContain("Sonnet 5.5");
  // Without default-thinking, the first choice is selected.
  expect(within(composer).getByRole("combobox", { name: "Thinking" }).textContent).toContain("Off");
  expect([composer.mode, composer.model, composer.thinking]).toEqual(["plan", "sonnet-5.5", "off"]);

  composer.thinkingLevels = [];
  await settle();
  expect(within(composer).queryByRole("combobox", { name: "Thinking" })).toBeNull();
  expect(composer.thinking).toBeUndefined();
});

test("options can be disabled and carry descriptions", async () => {
  const { composer } = await mount('<ai-composer default-model="opus"></ai-composer>', (composer) => {
    composer.modes = [
      { value: "auto", label: "Auto", description: "Decides for itself" },
      { value: "plan", label: "Plan", disabled: true },
    ];
    composer.models = [
      { value: "opus", label: "Opus", disabled: true },
      { value: "haiku", label: "Haiku", description: "Fastest" },
    ];
  });

  expect(within(composer).getByRole("radio", { name: "Plan" }).getAttribute("aria-disabled")).toBe("true");
  expect(within(composer).getByRole("radio", { name: "Auto" }).title).toBe("Decides for itself");
  // A disabled default falls back to the first choice that can be chosen.
  expect(composer.model).toBe("haiku");
  expect(composer.querySelector("[data-part='option-description']")!.textContent).toBe("Fastest");
  expect(within(composer).getByRole("combobox", { name: "Model" }).textContent).toContain("Haiku");
  expect(within(composer).getByRole("combobox", { name: "Model" }).textContent).not.toContain("Fastest");
});

test("Send fires promptsubmit with the settings and empties the box", async () => {
  const user = userEvent.setup();
  const { prompt, send, sent } = await mount("<ai-composer></ai-composer>", everything);

  await user.type(prompt, "  Explain web components ");
  expect(disabled(send())).toBe(false);
  await user.click(send());

  expect(sent).toEqual([
    { text: "Explain web components", mode: "auto", model: "opus-5.5", thinking: "off", files: [], command: undefined, references: [] },
  ]);
  expect(prompt.value).toBe("");
  expect(document.activeElement).toBe(prompt);
  expect(disabled(send())).toBe(true);
});

test("calling preventDefault on promptsubmit keeps the prompt in the box", async () => {
  const user = userEvent.setup();
  const { composer, prompt } = await mount();
  composer.addEventListener("promptsubmit", (event) => event.preventDefault());

  await user.type(prompt, "Keep me{Enter}");
  expect(prompt.value).toBe("Keep me");
});

test("Enter sends by default; with submit-on=\"mod-enter\" Enter adds a line and Ctrl+Enter sends", async () => {
  const user = userEvent.setup();
  const enter = await mount();
  await user.click(enter.prompt);
  await user.keyboard("{Enter}");
  expect(enter.sent).toHaveLength(0);
  await user.keyboard("one{Shift>}{Enter}{/Shift}two{Enter}");
  expect(enter.sent.map((detail) => detail.text)).toEqual(["one\ntwo"]);

  const mod = await mount('<ai-composer submit-on="mod-enter"></ai-composer>');
  await user.click(mod.prompt);
  await user.keyboard("one{Enter}two");
  expect(mod.sent).toHaveLength(0);
  await user.keyboard("{Control>}{Enter}{/Control}");
  expect(mod.sent.map((detail) => detail.text)).toEqual(["one\ntwo"]);
  expect(mod.composer.querySelector("[data-part='hint']")!.textContent).toBe("Ctrl+Enter to send · Enter for a new line");
});

test("while busy, Send becomes Stop, fires promptstop and nothing is sent", async () => {
  const user = userEvent.setup();
  const { composer, prompt, send, sent } = await mount("<ai-composer busy></ai-composer>");
  const stop = vi.fn();
  composer.addEventListener("promptstop", stop);

  expect(send().getAttribute("aria-label")).toBe("Stop");
  expect(disabled(send())).toBe(false);
  await user.type(prompt, "next question{Enter}");
  expect(sent).toHaveLength(0);
  expect(prompt.value).toBe("next question");
  await user.click(send());
  expect(stop).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(prompt);

  composer.busy = false;
  await settle();
  expect(send().getAttribute("aria-label")).toBe("Send");
  await user.click(send());
  expect(sent.map((detail) => detail.text)).toEqual(["next question"]);
});

test("disabled locks every control", async () => {
  speech.SpeechRecognition = class {};
  const { composer, prompt, send } = await mount("<ai-composer attachments voice disabled></ai-composer>", everything);
  composer.value = "text";
  await settle();

  expect(prompt.disabled).toBe(true);
  expect(disabled(send())).toBe(true);
  for (const name of ["Attach files", "Voice input"]) expect(disabled(within(composer).getByRole("button", { name }))).toBe(true);
  for (const name of ["Model", "Thinking"]) expect(disabled(within(composer).getByRole("combobox", { name }))).toBe(true);
  expect(within(composer).getAllByRole("radio").every(disabled)).toBe(true);
  expect(composer.submit()).toBe(false);
});

test("every word can be replaced, for labels and translation", async () => {
  speech.SpeechRecognition = class {};
  const { composer, prompt, send } = await mount(
    '<ai-composer label="Message" placeholder="Posez une question…" hint="Entrée pour envoyer" attachments voice></ai-composer>',
    (composer) => {
      everything(composer);
      composer.strings = { send: "Envoyer", attach: "Joindre des fichiers", voice: "Dictée", mode: "Mode", model: "Modèle", thinking: "Réflexion" };
    },
  );

  expect(prompt.getAttribute("aria-label")).toBe("Message");
  expect(composer.getAttribute("aria-label")).toBe("Message");
  expect(prompt.placeholder).toBe("Posez une question…");
  expect(send().getAttribute("aria-label")).toBe("Envoyer");
  for (const name of ["Joindre des fichiers", "Dictée"]) expect(within(composer).getByRole("button", { name })).toBeDefined();
  for (const name of ["Modèle", "Réflexion"]) expect(within(composer).getByRole("combobox", { name })).toBeDefined();
  expect(composer.querySelector("[data-part='hint']")!.textContent).toBe("Entrée pour envoyer");

  composer.setAttribute("label", "Réponse");
  await settle();
  expect([composer.getAttribute("aria-label"), composer.querySelector("textarea")!.getAttribute("aria-label")]).toEqual(["Réponse", "Réponse"]);
});

test("slotted children go to the start or end of the bar, or replace the hint", async () => {
  const { composer } = await mount(`
    <ai-composer attachments>
      <button slot="start" type="button">Web search</button>
      <button slot="end" type="button">Tools</button>
      <small slot="footer">AI can make mistakes.</small>
    </ai-composer>`);

  const start = composer.querySelector("[data-part='start']")!;
  const end = composer.querySelector("[data-part='end']")!;
  expect(start.lastElementChild!.textContent).toBe("Web search");
  expect([...end.children].map((child) => child.textContent!.trim() || child.getAttribute("data-part"))).toEqual(["Tools", "counter", "send"]);
  expect(composer.querySelector("[data-part='footer']")!.textContent).toContain("AI can make mistakes.");
  expect(composer.querySelector("[data-part='hint']")).toBeNull();

  // Children added later, and rebuilds, keep their place.
  composer.append(Object.assign(document.createElement("button"), { slot: "start", textContent: "Canvas" }));
  composer.removeAttribute("attachments");
  await settle();
  expect([...composer.querySelector("[data-part='start']")!.children].map((child) => child.textContent)).toEqual(["Web search", "Canvas"]);
});

test("changing options keeps the typed text, files and choices", async () => {
  const { composer, prompt } = await mount('<ai-composer attachments default-model="haiku-5.5"></ai-composer>', everything);
  composer.value = "half-written";
  composer.mode = "plan";
  composer.addFiles([new File(["a"], "notes.txt")]);
  await settle();

  composer.models = [...defaultModels, { value: "fable-5.2", label: "Fable 5.2" }];
  composer.setAttribute("accept", ".txt");
  await settle();

  expect(composer.querySelector("textarea")).not.toBe(prompt);
  expect(composer.value).toBe("half-written");
  expect([composer.mode, composer.model]).toEqual(["plan", "haiku-5.5"]);
  expect(composer.files.map((file) => file.name)).toEqual(["notes.txt"]);
});

test("change events report each setting, the text and the files", async () => {
  const user = userEvent.setup();
  const { composer, prompt } = await mount("<ai-composer attachments></ai-composer>", everything);
  const events: string[] = [];
  for (const type of ["valuechange", "modechange", "modelchange", "thinkingchange", "fileschange"]) {
    composer.addEventListener(type, (event) => {
      if (event.target === composer) events.push(`${type}:${JSON.stringify((event as CustomEvent).detail.value)}`);
    });
  }

  await user.type(prompt, "a");
  await user.click(within(composer).getByRole("radio", { name: "Plan" }));
  composer.model = "haiku-5.5";
  composer.thinking = "high";
  composer.addFiles([new File(["a"], "a.txt")]);
  await settle();

  expect(events).toEqual([
    'valuechange:"a"',
    'modechange:"plan"',
    'modelchange:"haiku-5.5"',
    'thinkingchange:"high"',
    "fileschange:[{}]",
  ]);
});

test("files that break accept, max-size or max-files are turned away with a message", async () => {
  const { composer } = await mount('<ai-composer attachments accept=".txt" max-size="10" max-files="1"></ai-composer>');
  const rejected = vi.fn();
  composer.addEventListener("filereject", rejected);

  composer.addFiles([new File(["x"], "photo.png")]);
  await settle();
  expect(composer.files).toHaveLength(0);
  expect(rejected.mock.calls[0][0].detail.value[0].reasons).toEqual(["file-type"]);
  expect(composer.querySelector("[data-part='status']")!.textContent).toBe("photo.png wasn't attached: that type of file isn't accepted.");

  composer.addFiles([new File(["12345678901"], "big.txt")]);
  await settle();
  expect(composer.querySelector("[data-part='status']")!.textContent).toBe("big.txt wasn't attached: it's larger than 10 bytes.");

  composer.addFiles([new File(["a"], "a.txt"), new File(["b"], "b.txt")]);
  await settle();
  expect(composer.files.map((file) => file.name)).toEqual(["a.txt"]);
  expect(composer.querySelector("[data-part='status']")!.textContent).toBe("b.txt wasn't attached: only one file can be attached.");
});

test("/ and @ turn on with commands and references, and the sent prompt names them", async () => {
  const user = userEvent.setup();
  const { composer, prompt, sent } = await mount("<ai-composer></ai-composer>", (composer) => {
    composer.commands = [{ value: "explain", label: "explain" }];
    composer.references = [{ type: "group", label: "Files", items: ["README.md", "package.json"] }];
  });
  const menu = composer.querySelector("ui-trigger-menu")!;
  expect(menu.triggers!.map((trigger) => [trigger.char, trigger.boundary])).toEqual([
    ["/", "start"],
    ["@", undefined],
  ]);

  // A reference chosen from a search is remembered by its value.
  menu.dispatchEvent(new CustomEvent("itemselect", { detail: { trigger: "@", item: { value: "doc-7", label: "Roadmap" } } }));
  await user.type(prompt, "/explain @package.json and @Roadmap{Enter}");
  // user-event keeps its own copy of text it typed, so set the next prompt through the element.
  composer.value = "/unknown";
  await user.keyboard("{Enter}");

  expect(sent.map(({ command, references }) => ({ command, references }))).toEqual([
    {
      command: "explain",
      references: [
        { value: "package.json", label: "package.json" },
        { value: "doc-7", label: "Roadmap" },
      ],
    },
    { command: undefined, references: [] },
  ]);
});

test("@ takes a search function, and commands with after: \"submit\" send at once", async () => {
  const search = vi.fn(async (query: string) => [`${query}.md`]);
  const { composer, sent } = await mount("<ai-composer></ai-composer>", (composer) => {
    composer.references = search;
    composer.commands = [{ value: "clear", label: "clear", after: "submit" }];
  });
  const menu = composer.querySelector("ui-trigger-menu")!;
  expect(menu.triggers![1].items).toBe(search);

  composer.value = "/clear";
  menu.editor!.submit!();
  expect(sent.map((detail) => detail.command)).toEqual(["clear"]);
});

test("voice input adds what's said, and a custom speech engine can be plugged in", async () => {
  const user = userEvent.setup();
  let handlers: Parameters<SpeechRecognizer["start"]>[0] | undefined;
  const stop = vi.fn(() => handlers!.onEnd());
  const { composer, prompt } = await mount('<ai-composer voice voice-lang="fr-FR"></ai-composer>', (composer) => {
    composer.speechRecognizer = { supported: true, start: (options) => ((handlers = options), { stop }) };
  });
  const events: string[] = [];
  composer.addEventListener("voicestart", () => events.push("start"));
  composer.addEventListener("voiceend", () => events.push("end"));
  const voice = within(composer).getByRole("button", { name: "Voice input" });

  await user.type(prompt, "Draft:");
  await user.click(voice);
  expect(handlers!.lang).toBe("fr-FR");
  expect(composer.querySelector("[data-part='status']")!.textContent).toBe("Listening…");
  handlers!.onText("bonjour");
  await user.click(voice);
  await settle();

  expect(prompt.value).toBe("Draft: bonjour");
  expect(stop).toHaveBeenCalledOnce();
  expect(voice.getAttribute("aria-pressed")).toBe("false");
  expect(composer.querySelector("[data-part='status']")!.textContent).toBe("");
  expect(events).toEqual(["start", "end"]);
});

test("the browser's speech recognition is used by default", async () => {
  const user = userEvent.setup();
  let session: { lang: string; onresult: (event: unknown) => void; onend: () => void } | undefined;
  speech.SpeechRecognition = class {
    start() {
      session = this as never;
    }
    stop() {}
  };
  document.body.innerHTML = '<div lang="de"><ai-composer voice></ai-composer></div>';
  await settle();
  const host = document.querySelector("ai-composer")!;
  await user.click(within(host).getByRole("button", { name: "Voice input" }));
  expect(session!.lang).toBe("de");
  session!.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: " hallo " }], { isFinal: true })] });
  session!.onend();
  await settle();
  expect(host.value).toBe("hallo");
});

test("value, focus, insert, addFiles and clear work before and after the inside renders", async () => {
  const composer = document.createElement("ai-composer");
  composer.setAttribute("attachments", "");
  composer.value = "Hello";
  composer.addFiles([new File(["a"], "a.txt")]);
  composer.focus();
  document.body.append(composer);
  await settle();

  const prompt = composer.querySelector("textarea")!;
  expect(prompt.value).toBe("Hello");
  expect(composer.files.map((file) => file.name)).toEqual(["a.txt"]);
  expect(document.activeElement).toBe(prompt);

  prompt.setSelectionRange(5, 5);
  composer.insert(" @README.md");
  expect(composer.value).toBe("Hello @README.md");
  composer.clear();
  await settle();
  expect([composer.value, composer.files.length]).toEqual(["", 0]);
});

test("icons can be replaced", async () => {
  const { send } = await mount("<ai-composer></ai-composer>", (composer) => {
    composer.icons = { send: '<svg data-icon="paper-plane"></svg>' };
  });
  expect(send().querySelector("[data-icon='paper-plane']")).not.toBeNull();
});

test("agents can use every control, and two composers stay apart by their labels", async () => {
  await mount('<ai-composer attachments label="Prompt"></ai-composer>', everything);
  await mount('<ai-composer label="Reply"></ai-composer>');
  const [first, second] = document.querySelectorAll("ai-composer");
  const sent: string[] = [];
  for (const composer of [first, second]) {
    composer.addEventListener("promptsubmit", (event) => sent.push(`${composer.getAttribute("label")}: ${event.detail.text}`));
  }

  const components = agent.snapshot().filter((entry) => !entry.offPage && entry.component !== "more");
  for (const entry of components) expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
  const labels = components.map((entry) => entry.label);
  for (const label of ["Mode", "Model", "Thinking", "Attach files", "Prompt", "Reply"]) expect(labels).toContain(label);

  const sends = components.filter((entry) => entry.label === "Send");
  expect(sends.map((entry) => entry.section)).toEqual(["Prompt", "Reply"]);

  const result = await agent.act({
    steps: [
      { ref: "Model", action: "setValue", args: ["Haiku 5.5"] },
      { ref: "Prompt", action: "setValue", args: ["Hi"] },
      { ref: sends[0].ref, action: "press" },
      { ref: "Reply", action: "setValue", args: ["Thanks"] },
      { ref: sends[1].ref, action: "press" },
    ],
  });
  expect(result.ok, result.error?.message).toBe(true);
  expect(first.model).toBe("haiku-5.5");
  expect(sent).toEqual(["Prompt: Hi", "Reply: Thanks"]);
  expect([first.value, second.value]).toEqual(["", ""]);
});

test("with history, ArrowUp and ArrowDown walk through sent prompts and back to the draft", async () => {
  const user = userEvent.setup();
  const { composer, prompt } = await mount("<ai-composer history></ai-composer>");
  composer.history = ["first", "second"];

  await user.click(prompt);
  await user.keyboard("{ArrowUp}");
  expect(prompt.value).toBe("second");
  expect(prompt.selectionStart).toBe(6);
  await user.keyboard("{ArrowUp}{ArrowUp}");
  expect(prompt.value).toBe("first");
  await user.keyboard("{ArrowDown}");
  expect(prompt.value).toBe("second");
  await user.keyboard("{ArrowDown}");
  expect(prompt.value).toBe("");

  // Sending adds to the history, without repeating the last entry.
  composer.value = "third";
  composer.submit();
  composer.value = "third";
  composer.submit();
  expect(composer.history).toEqual(["first", "second", "third"]);
});

test("without the history attribute, ArrowUp moves the caret as usual", async () => {
  const user = userEvent.setup();
  const { composer, prompt } = await mount();
  composer.history = ["earlier"];
  await user.click(prompt);
  await user.keyboard("{ArrowUp}");
  expect(prompt.value).toBe("");
});

test("with persist, the draft and the choices come back after a reload, and sending clears the draft", async () => {
  localStorage.clear();
  const saved = () => new Promise((resolve) => setTimeout(resolve, 300));
  const first = await mount('<ai-composer persist="chat" history></ai-composer>', everything);
  first.composer.value = "half-written";
  first.composer.model = "haiku-5.5";
  await settle();
  await saved();
  expect(JSON.parse(localStorage.getItem("ai-composer:chat")!)).toMatchObject({ value: "half-written", model: "haiku-5.5" });
  first.composer.remove();

  const second = await mount('<ai-composer persist="chat" history></ai-composer>', everything);
  expect(second.composer.value).toBe("half-written");
  expect(second.composer.model).toBe("haiku-5.5");
  second.composer.submit();
  await saved();
  expect(JSON.parse(localStorage.getItem("ai-composer:chat")!)).toMatchObject({ value: "", history: ["half-written"] });
  localStorage.clear();
});

test("a long paste becomes an attachment with paste-as-file", async () => {
  const user = userEvent.setup();
  const { composer, prompt } = await mount('<ai-composer attachments paste-as-file="20"></ai-composer>');

  await user.click(prompt);
  await user.paste("short");
  expect(prompt.value).toBe("short");
  await user.paste("a long pasted log that goes on and on");
  await settle();
  expect(prompt.value).toBe("short");
  expect(composer.files.map((file) => [file.name, file.type])).toEqual([["Pasted text.txt", "text/plain"]]);
  expect(await composer.files[0].text()).toBe("a long pasted log that goes on and on");
  expect(composer.querySelector("[data-part='status']")!.textContent).toBe("Long paste added as an attachment");
});

test("image attachments show a thumbnail that is freed when removed", async () => {
  const create = vi.fn(() => "blob:thumbnail");
  const revoke = vi.fn();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  try {
    const { composer } = await mount("<ai-composer attachments></ai-composer>");
    composer.addFiles([new File(["png"], "chart.png", { type: "image/png" }), new File(["a"], "notes.txt", { type: "text/plain" })]);
    await settle();
    const previews = [...composer.querySelectorAll<HTMLImageElement>("[data-part='attachment-preview']")];
    expect(previews.map((image) => [image.getAttribute("src"), image.hidden])).toEqual([
      ["blob:thumbnail", false],
      [null, true],
    ]);
    expect(previews[0].alt).toBe("");

    composer.clear();
    await settle();
    expect(revoke).toHaveBeenCalledWith("blob:thumbnail");
  } finally {
    Object.assign(URL, { createObjectURL: undefined, revokeObjectURL: undefined });
  }
});

test("a counter shows near max-length and says when the limit is reached", async () => {
  const user = userEvent.setup();
  const { composer, prompt } = await mount('<ai-composer max-length="10"></ai-composer>');
  const counter = composer.querySelector<HTMLElement>("[data-part='counter']")!;
  expect(prompt.maxLength).toBe(10);
  expect(prompt.getAttribute("aria-describedby")).toBe(counter.id);

  await user.type(prompt, "1234567");
  expect(counter.hidden).toBe(true);
  await user.type(prompt, "8");
  expect([counter.hidden, counter.textContent]).toEqual([false, "8 / 10"]);
  await user.type(prompt, "90");
  expect(counter.hasAttribute("data-limit")).toBe(true);
  expect(composer.querySelector("[data-part='status']")!.textContent).toBe("Character limit reached");
});
