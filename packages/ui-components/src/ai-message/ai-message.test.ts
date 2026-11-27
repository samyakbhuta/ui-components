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
  expect(parts()).toEqual(["header", "body", "footer", "actions", "announcement"]);
  expect(message.text).toBe("Answer");

  message.append(Object.assign(document.createElement("span"), { slot: "header", textContent: "Searching" }));
  await settle();
  expect(parts()).toEqual(["header", "header", "body", "footer", "actions", "announcement"]);
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
