import { within } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { settle } from "@ui-sdk/core/testing";
import { createAgent } from "@ui-sdk/web/agent";
import { expect, test, vi } from "vitest";
import "./ai-message.ts";
import type { AiMessageElement } from "./ai-message.ts";
import { renderMarkdown } from "./markdown.ts";

const html = (source: string) => {
  const host = document.createElement("div");
  host.append(...renderMarkdown(source).map((block) => block.node));
  return host.innerHTML;
};

async function mount(markup: string, setup?: (message: AiMessageElement) => void) {
  document.body.insertAdjacentHTML("beforeend", markup);
  const message = document.body.lastElementChild as AiMessageElement;
  setup?.(message);
  await settle();
  return { message, body: () => message.querySelector("[data-part='body']")! };
}

test("Markdown renders paragraphs, emphasis, code, links and line breaks", () => {
  expect(html("Hello **bold** and *em* and _em_ and ~~gone~~ and `a < b`.\nNext line")).toBe(
    "<p>Hello <strong>bold</strong> and <em>em</em> and <em>em</em> and <del>gone</del> and <code>a &lt; b</code>.<br>Next line</p>",
  );
  expect(html("See [the docs](https://example.com/a_(b)) or https://example.com/x.")).toBe(
    '<p>See <a href="https://example.com/a_(b)" target="_blank" rel="noopener noreferrer">the docs</a> or ' +
      '<a href="https://example.com/x" target="_blank" rel="noopener noreferrer">https://example.com/x</a>.</p>',
  );
  expect(html("snake_case_name and 2*3*4 stay as they are, \\*escaped\\*")).toBe(
    "<p>snake_case_name and 2*3*4 stay as they are, *escaped*</p>",
  );
  expect(html("**bold with *nested em***")).toBe("<p><strong>bold with <em>nested em</em></strong></p>");
});

test("Markdown renders headings, lists, quotes, rules, tables and code blocks", () => {
  expect(html("# Title\n\n## Part")).toBe("<h3>Title</h3><h4>Part</h4>");
  expect(html("- one\n- two\n  - nested\n- three")).toBe("<ul><li>one</li><li>two<ul><li>nested</li></ul></li><li>three</li></ul>");
  expect(html("3. three\n4. four")).toBe('<ol start="3"><li>three</li><li>four</li></ol>');
  expect(html("> quoted\n> **text**")).toBe("<blockquote><p>quoted<br><strong>text</strong></p></blockquote>");
  expect(html("a\n\n---\n\nb")).toBe("<p>a</p><hr><p>b</p>");
  expect(html("| Name | Size |\n|:--|--:|\n| a.txt | 2 B |")).toBe(
    '<div data-part="table" tabindex="0" role="region" aria-label="Name, Size"><table><thead><tr>' +
      '<th scope="col" style="text-align: left;">Name</th><th scope="col" style="text-align: right;">Size</th></tr></thead>' +
      '<tbody><tr><td style="text-align: left;">a.txt</td><td style="text-align: right;">2 B</td></tr></tbody></table></div>',
  );
  const code = html("```ts\nconst a = 1 < 2;\n```");
  expect(code).toContain('<span data-part="code-language">ts</span>');
  expect(code).toContain('aria-label="Copy ts code"');
  expect(code).toContain('<pre><code class="language-ts">const a = 1 &lt; 2;</code></pre>');
  // A fence that hasn't closed yet, as mid-stream, is still a code block.
  expect(html("```js\nlet x")).toContain('<code class="language-js">let x</code>');
});

test("Markdown never runs HTML or scripts from the text", () => {
  const attacks = [
    "<img src=x onerror=alert(1)>",
    "<script>alert(1)</script>",
    "[click](javascript:alert(1))",
    "[click](JaVaScRiPt:alert(1))",
    "[click](data:text/html,<script>alert(1)</script>)",
    '`<b onclick="x">`',
    "| <img src=x onerror=1> |\n|---|\n| x |",
    "```\n</code><script>alert(1)</script>\n```",
  ];
  for (const attack of attacks) {
    const host = document.createElement("div");
    host.append(...renderMarkdown(attack).map((block) => block.node));
    expect(host.querySelector("script, img, [onerror], [onclick]"), attack).toBeNull();
    expect([...host.querySelectorAll("a")].every((a) => /^https?:|^mailto:/.test(a.getAttribute("href")!)), attack).toBe(true);
  }
  expect(html("[click](javascript:alert(1))")).toBe("<p>click</p>");
  expect(html("<b>not bold</b>")).toBe("<p>&lt;b&gt;not bold&lt;/b&gt;</p>");
});

test("deep nesting is capped, so a hostile reply can't hang the page", () => {
  const started = performance.now();
  const host = document.createElement("div");
  host.append(...renderMarkdown(">".repeat(5000) + " deep").map((block) => block.node));
  host.append(...renderMarkdown(Array.from({ length: 200 }, (_, depth) => `${"  ".repeat(depth)}- level ${depth}`).join("\n")).map((block) => block.node));
  host.append(...renderMarkdown("*".repeat(2000) + "x" + "*".repeat(2000)).map((block) => block.node));
  expect(host.querySelectorAll("blockquote").length).toBeLessThanOrEqual(10);
  expect(host.querySelectorAll("ul").length).toBeLessThanOrEqual(10);
  expect(performance.now() - started).toBeLessThan(2000);
});

test("an assistant message renders Markdown, a user message plain text", async () => {
  const assistant = await mount("<ai-message>**Hi** there</ai-message>");
  expect(assistant.body().innerHTML).toBe("<p><strong>Hi</strong> there</p>");
  expect(assistant.message.from).toBe("assistant");

  const user = await mount('<ai-message from="user"></ai-message>', (message) => (message.text = "**literally**\n\nTwo"));
  expect(user.body().innerHTML).toBe("<p>**literally**</p><p>Two</p>");

  user.message.format = "markdown";
  expect(user.body().innerHTML).toBe("<p><strong>literally</strong></p><p>Two</p>");
});

test("text written inside indented HTML is dedented before rendering", async () => {
  const { body } = await mount(`<ai-message>
      - one
      - two
    </ai-message>`);
  expect(body().innerHTML).toBe("<ul><li>one</li><li>two</li></ul>");
});

test("streamed text renders once a frame, keeps finished blocks, and fires messagecomplete", async () => {
  const { message, body } = await mount("<ai-message streaming></ai-message>");
  const complete = vi.fn();
  message.addEventListener("messagecomplete", complete);
  expect(message.getAttribute("aria-busy")).toBe("true");
  expect((message.querySelector("[data-part='actions']") as HTMLElement).hidden).toBe(true);

  message.appendText("First paragraph.\n\nSec");
  message.appendText("ond");
  expect(body().children).toHaveLength(0);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const first = body().firstElementChild;
  expect(body().textContent).toBe("First paragraph.Second");

  message.appendText(" paragraph.");
  message.done();
  expect(body().firstElementChild).toBe(first);
  expect(body().lastElementChild!.textContent).toBe("Second paragraph.");
  expect(message.hasAttribute("aria-busy")).toBe(false);
  expect((message.querySelector("[data-part='actions']") as HTMLElement).hidden).toBe(false);
  expect(complete).toHaveBeenCalledOnce();
});

test("Copy copies the source, says so, and can be taken over", async () => {
  const user = userEvent.setup();
  const { message } = await mount("<ai-message>Some **text**</ai-message>");
  const copy = within(message).getByRole("button", { name: "Copy" });
  expect(within(message).getByRole("button", { name: "Retry" })).toBeDefined();

  await user.click(copy);
  await vi.waitFor(() => expect(copy.getAttribute("aria-label")).toBe("Copied"));
  expect(await navigator.clipboard.readText()).toBe("Some **text**");
  expect(message.querySelector("[role='status']")!.textContent).toBe("Copied");

  const actions: string[] = [];
  message.addEventListener("messageaction", (event) => {
    actions.push(`${event.detail.action}:${event.detail.text}`);
    event.preventDefault();
  });
  await user.click(within(message).getByRole("button", { name: "Retry" }));
  expect(actions).toEqual(["retry:Some **text**"]);
});

test("code blocks have their own copy button", async () => {
  const user = userEvent.setup();
  const { message } = await mount("<ai-message></ai-message>", (message) => (message.text = "```sh\nnpm test\n```"));

  const copy = within(message).getByRole("button", { name: "Copy sh code" });
  expect(copy.textContent).toBe("Copy");
  await user.click(copy);
  await vi.waitFor(() => expect(copy.textContent).toBe("Copied"));
  expect(await navigator.clipboard.readText()).toBe("npm test");
});

test("user messages offer Edit, actions can be chosen, and words replaced", async () => {
  const user = await mount('<ai-message from="user">Hi</ai-message>');
  expect(within(user.message).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["Copy", "Edit"]);

  const none = await mount('<ai-message actions="">Hi</ai-message>');
  expect(within(none.message).queryAllByRole("button")).toHaveLength(0);

  const french = await mount('<ai-message actions="copy retry">Salut</ai-message>', (message) => {
    message.strings = { copy: "Copier", retry: "Réessayer" };
  });
  expect(within(french.message).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
    "Copier",
    "Réessayer",
  ]);
});

test("header and footer children sit around the text, even when added later", async () => {
  const { message } = await mount(`
    <ai-message>
      <span slot="header">Thinking</span>
      Answer
      <small slot="footer">Sonnet 5.5</small>
    </ai-message>`);
  const parts = () => [...message.children].map((child) => child.getAttribute("slot") ?? child.getAttribute("data-part"));
  expect(parts()).toEqual(["header", "attachments", "body", "error", "footer", "actions", "announcement"]);
  expect(message.text).toBe("Answer");

  message.append(Object.assign(document.createElement("span"), { slot: "header", textContent: "Searching" }));
  await settle();
  expect(parts()).toEqual(["header", "header", "attachments", "body", "error", "footer", "actions", "announcement"]);
});

test("agents can copy, retry or edit a message", async () => {
  const { message } = await mount("<ai-message>Answer</ai-message>");
  const retried = vi.fn();
  message.addEventListener("messageaction", (event) => event.detail.action === "retry" && retried());
  const agent = createAgent();
  const result = await agent.act({ steps: [{ ref: "Retry", action: "press" }] });
  expect(result.ok, result.error?.message).toBe(true);
  expect(retried).toHaveBeenCalledOnce();
});

test("fail() keeps what arrived, shows why, announces it, and ends streaming", async () => {
  const { message } = await mount("<ai-message streaming></ai-message>");
  const completed = vi.fn();
  message.addEventListener("messagecomplete", completed);
  message.appendText("Half an ans");
  message.fail("The connection dropped.");
  await settle();

  const error = message.querySelector<HTMLElement>("[data-part='error']")!;
  expect(error.hidden).toBe(false);
  expect(error.textContent).toBe("The connection dropped.");
  expect(message.hasAttribute("data-error")).toBe(true);
  expect(message.querySelector("[role='status']")!.textContent).toBe("The connection dropped.");
  expect(message.text).toBe("Half an ans");
  expect(message.streaming).toBe(false);
  expect(completed).toHaveBeenCalledOnce();
  // Retry stays, since that's what people do next.
  expect(within(message).getByRole("button", { name: "Retry" })).toBeTruthy();

  message.error = null;
  expect(error.hidden).toBe(true);
  expect(message.hasAttribute("data-error")).toBe(false);
});

test("an empty error shows a general message", async () => {
  const { message } = await mount(`<ai-message error="">Partial</ai-message>`);
  expect(message.querySelector("[data-part='error']")!.textContent).toBe("Something went wrong.");
});

test("feedback toggles between Good and Bad response, and can be cleared", async () => {
  const { message } = await mount(`<ai-message actions="copy retry feedback">Answer</ai-message>`);
  const ratings: (string | null)[] = [];
  message.addEventListener("messagefeedback", (event) => ratings.push(event.detail.feedback));
  const ui = within(message);
  const group = ui.getByRole("group", { name: "Feedback" });
  const good = within(group).getByRole("button", { name: "Good response" });
  const bad = within(group).getByRole("button", { name: "Bad response" });
  expect(good.getAttribute("aria-pressed")).toBe("false");

  await userEvent.click(good);
  expect(message.feedback).toBe("good");
  expect(good.getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(bad);
  expect(message.feedback).toBe("bad");
  expect(good.getAttribute("aria-pressed")).toBe("false");
  expect(bad.getAttribute("aria-pressed")).toBe("true");
  await userEvent.click(bad);
  expect(message.feedback).toBeNull();
  expect(ratings).toEqual(["good", "bad", null]);
});

test("a cancelled messagefeedback keeps the rating, and setting feedback presses the toggle", async () => {
  const { message } = await mount(`<ai-message actions="feedback" feedback="good">Answer</ai-message>`);
  const good = within(message).getByRole("button", { name: "Good response" });
  expect(good.getAttribute("aria-pressed")).toBe("true");
  message.addEventListener("messagefeedback", (event) => event.preventDefault());
  await userEvent.click(good);
  expect(message.feedback).toBe("good");
  expect(good.getAttribute("aria-pressed")).toBe("true");

  message.feedback = "bad";
  await settle();
  expect(within(message).getByRole("button", { name: "Bad response" }).getAttribute("aria-pressed")).toBe("true");
});

test("versions step with Previous and Next, and stop at either end", async () => {
  const { message } = await mount(`<ai-message versions="3">Third try</ai-message>`);
  const asked: number[] = [];
  message.addEventListener("messageversion", (event) => asked.push(event.detail.version));
  const pager = () => within(message).getByRole("group", { name: /^Version/ });
  expect(pager().getAttribute("aria-label")).toBe("Version 3 of 3");
  expect(message.querySelector("[data-part='version']")!.textContent).toBe("3 / 3");
  const next = () => within(message).getByRole("button", { name: "Next version" }) as HTMLButtonElement;
  const previous = () => within(message).getByRole("button", { name: "Previous version" }) as HTMLButtonElement;
  expect(next().disabled).toBe(true);

  await userEvent.click(previous());
  expect(message.version).toBe(2);
  expect(pager().getAttribute("aria-label")).toBe("Version 2 of 3");
  await userEvent.click(previous());
  expect(message.version).toBe(1);
  expect(previous().disabled).toBe(true);
  // Focus moves to the arrow that still works.
  expect(document.activeElement).toBe(next());
  expect(asked).toEqual([2, 1]);
});

test("a single version shows no pager", async () => {
  const { message } = await mount("<ai-message>Only one</ai-message>");
  expect(message.querySelector("[data-part='versions']")).toBeNull();
});

test("attachments show images as thumbnails and other files by name and size", async () => {
  const { message } = await mount(`<ai-message from="user">Look at these</ai-message>`, (m) => {
    m.attachments = [
      { name: "chart.png", type: "image/png", url: "https://example.com/chart.png" },
      { name: "notes.pdf", type: "application/pdf", size: 2_400_000 },
      { name: "evil.png", type: "image/png", url: "javascript:alert(1)" },
    ];
  });
  const list = within(message).getByRole("list", { name: "Attachments" });
  const items = within(list).getAllByRole("listitem");
  expect(items).toHaveLength(3);
  within(items[0]).getByRole("button", { name: "View chart.png" });
  expect(items[0].querySelector("img")!.src).toBe("https://example.com/chart.png");
  expect(items[1].textContent).toBe("notes.pdf2.3 MB");
  // With no address, a file is only its name and size.
  expect(within(items[1]).queryByRole("link")).toBeNull();
  // An address that isn't an image link shows as a file, never as a source.
  expect(items[2].dataset.kind).toBe("file");
  expect(items[2].querySelector("img")).toBeNull();

  message.attachments = [];
  expect(list.hidden).toBe(true);
});

test("attachments take File objects, like the ones <ai-composer> sends", async () => {
  const created = vi.fn(() => "blob:preview");
  const revoked = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked }));
  const { message } = await mount(`<ai-message from="user">Hi</ai-message>`, (m) => {
    m.attachments = [new File(["x"], "photo.jpg", { type: "image/jpeg" }), new File(["abc"], "a.txt", { type: "text/plain" })];
  });
  expect(message.querySelector("img")!.getAttribute("src")).toBe("blob:preview");
  expect(message.querySelectorAll("[data-part='attachment']")[1].textContent).toBe("a.txt3 B");
  message.attachments = [];
  expect(revoked).toHaveBeenCalledWith("blob:preview");
  vi.unstubAllGlobals();
});

test("a thumbnail opens the image full size, and the viewer steps through the message's images", async () => {
  const user = userEvent.setup();
  const { message } = await mount(`<ai-message from="user">Which is better?</ai-message>`, (m) => {
    m.attachments = [
      { name: "front.png", type: "image/png", url: "https://example.com/front.png" },
      { name: "notes.pdf", type: "application/pdf" },
      { name: "back.png", type: "image/png", url: "https://example.com/back.png" },
      { name: "side.png", type: "image/png", url: "https://example.com/side.png" },
    ];
  });
  const opened = vi.fn();
  message.addEventListener("attachmentopen", (event) => opened(event.detail));
  const thumbnail = within(message).getByRole("button", { name: "View back.png" });
  await user.click(thumbnail);
  expect(opened).toHaveBeenCalledWith({ attachment: message.attachments[2], index: 2, kind: "image" });

  const viewer = await vi.waitFor(() => within(message).getByRole("dialog", { name: "back.png" }));
  const image = () => within(viewer).getByRole("img") as HTMLImageElement;
  expect(image().src).toBe("https://example.com/back.png");
  expect(image().alt).toBe("back.png");
  expect(viewer.querySelector("[data-part='viewer-position']")!.textContent).toBe("2 of 3");
  expect(document.activeElement).toBe(within(viewer).getByRole("button", { name: "Close" }));

  await user.click(within(viewer).getByRole("button", { name: "Next image" }));
  expect(image().src).toBe("https://example.com/side.png");
  expect(viewer.querySelector("[data-part='viewer-position']")!.textContent).toBe("3 of 3");
  expect((within(viewer).getByRole("button", { name: "Next image" }) as HTMLButtonElement).disabled).toBe(true);
  // At the end, focus moves to the arrow that still works.
  expect(document.activeElement).toBe(within(viewer).getByRole("button", { name: "Previous image" }));

  await user.keyboard("{ArrowLeft}{ArrowLeft}");
  expect(image().src).toBe("https://example.com/front.png");
  expect((within(viewer).getByRole("button", { name: "Previous image" }) as HTMLButtonElement).disabled).toBe(true);

  // Escape closes it, and focus goes to the thumbnail of the image last shown.
  await user.keyboard("{Escape}");
  await vi.waitFor(() => expect(within(message).queryByRole("dialog")).toBeNull());
  await vi.waitFor(() => expect(document.activeElement).toBe(within(message).getByRole("button", { name: "View front.png" })));
  message.remove();
});

test("a single image shows no arrows, and attachmentopen can be cancelled to show it your own way", async () => {
  const user = userEvent.setup();
  const { message } = await mount(`<ai-message from="user">Hi</ai-message>`, (m) => {
    m.attachments = [{ name: "cat.png", type: "image/png", url: "https://example.com/cat.png" }];
  });
  await user.click(within(message).getByRole("button", { name: "View cat.png" }));
  const viewer = await vi.waitFor(() => within(message).getByRole("dialog", { name: "cat.png" }));
  expect(within(viewer).queryByRole("button", { name: "Next image" })).toBeNull();
  expect(viewer.querySelector<HTMLElement>("[data-part='viewer-position']")!.hidden).toBe(true);
  await user.click(within(viewer).getByRole("button", { name: "Close" }));
  await vi.waitFor(() => expect(within(message).queryByRole("dialog")).toBeNull());

  message.addEventListener("attachmentopen", (event) => event.preventDefault());
  await user.click(within(message).getByRole("button", { name: "View cat.png" }));
  await settle();
  expect(within(message).queryByRole("dialog")).toBeNull();
  message.remove();
});

test("a file with an address opens in a new tab, and only from web and blob addresses", async () => {
  const { message } = await mount(`<ai-message from="user">Read this</ai-message>`, (m) => {
    m.attachments = [
      { name: "report.pdf", type: "application/pdf", size: 2048, url: "https://example.com/report.pdf" },
      { name: "evil.html", type: "text/html", url: "javascript:alert(1)" },
      { name: "page.html", type: "text/html", url: "data:text/html,<script>alert(1)</script>" },
    ];
  });
  const link = within(message).getByRole("link", { name: "Open report.pdf in a new tab" }) as HTMLAnchorElement;
  expect(link.href).toBe("https://example.com/report.pdf");
  expect(link.target).toBe("_blank");
  expect(link.rel).toBe("noopener noreferrer");
  expect(link.textContent).toBe("report.pdf2 KB");
  expect(within(message).getAllByRole("link")).toHaveLength(1);

  const opened = vi.fn((event: Event) => event.preventDefault());
  message.addEventListener("attachmentopen", opened);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  link.dispatchEvent(click);
  expect(opened).toHaveBeenCalledTimes(1);
  expect((opened.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ index: 0, kind: "file" });
  expect(click.defaultPrevented).toBe(true);
  message.remove();
});

test("the viewer's words can be translated", async () => {
  const user = userEvent.setup();
  const { message } = await mount(`<ai-message from="user" lang="fr">Lequel ?</ai-message>`, (m) => {
    m.strings = {
      viewImage: (name) => `Voir ${name}`,
      previousImage: "Image précédente",
      nextImage: "Image suivante",
      imagePosition: (index, count) => `${index} sur ${count}`,
      closeViewer: "Fermer",
    };
    m.attachments = [
      { name: "a.png", type: "image/png", url: "https://example.com/a.png" },
      { name: "b.png", type: "image/png", url: "https://example.com/b.png" },
    ];
  });
  await user.click(within(message).getByRole("button", { name: "Voir a.png" }));
  const viewer = await vi.waitFor(() => within(message).getByRole("dialog", { name: "a.png" }));
  within(viewer).getByRole("button", { name: "Fermer" });
  within(viewer).getByRole("button", { name: "Image suivante" });
  expect(viewer.querySelector("[data-part='viewer-position']")!.textContent).toBe("1 sur 2");
  await user.keyboard("{Escape}");
  message.remove();
});

test("agents can rate a reply and step between versions", async () => {
  const { message } = await mount(`<ai-message actions="copy feedback" versions="2">Answer</ai-message>`);
  const agent = createAgent();
  const result = await agent.act({
    steps: [
      { ref: "Good response", action: "setPressed", args: [true] },
      { ref: "Previous version", action: "press" },
    ],
  });
  expect(result.ok, result.error?.message).toBe(true);
  expect(message.feedback).toBe("good");
  expect(message.version).toBe(1);
});
