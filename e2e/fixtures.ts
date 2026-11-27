import { test as base, expect, type Locator, type Page } from "@playwright/test";

/**
 * Every test fails on an uncaught error, a console error or a dialog. A dialog would also mean
 * a reply's text ran as script, so this guards the Markdown renderer on every page.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("dialog", (dialog) => {
        errors.push(`A dialog opened: ${dialog.message()}`);
        void dialog.dismiss();
      });
      await use(errors);
      expect(errors, "errors on the page").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Stands in for the browser's speech recognition: it "hears" one phrase, then stops.
 * Pass it to `page.addInitScript` before the page loads.
 */
export function fakeSpeech() {
  type Session = { onresult?: (event: unknown) => void; onend?: () => void };
  const FakeRecognition = class {
    start(this: Session) {
      setTimeout(() => {
        const result = Object.assign([{ transcript: "hello from voice" }], { isFinal: true });
        this.onresult?.({ resultIndex: 0, results: [result] });
        setTimeout(() => this.onend?.(), 50);
      }, 50);
    }
    stop(this: Session) {
      this.onend?.();
    }
  };
  for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
    Object.defineProperty(window, name, { configurable: true, writable: true, value: FakeRecognition });
  }
}

/** Waits until the composer is no longer busy with a reply. */
export async function waitForReply(page: Page) {
  await expect(page.locator("ai-composer").first()).not.toHaveAttribute("busy", { timeout: 20_000 });
}

/** Turns thinking off in the chat shell, so pretend replies come at once. */
export async function skipThinking(page: Page) {
  await page.locator("ai-composer").evaluate((composer) => ((composer as HTMLElement & { thinking: string }).thinking = "off"));
}

/** Types a prompt in the chat shell, sends it, and waits for the reply. */
export async function ask(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Prompt" }).fill(text);
  await page.keyboard.press("Enter");
  await waitForReply(page);
}

/** How far the page can scroll sideways, in pixels. 0 means no sideways scrolling. */
export function sidewaysOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/**
 * The lowest contrast between each coloured code token in `scope` and its code block's
 * background, measured from the page's computed colours. Returns the token kinds seen too.
 */
export function syntaxContrast(scope: Locator) {
  return scope.evaluate((root) => {
    const channels = (color: string) => {
      const values = color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      // color-mix() and light-dark() can compute to color(srgb 0–1); rgb() is 0–255.
      return color.startsWith("color(") ? values.map((value) => value * 255) : values;
    };
    const linear = (value: number) => {
      const channel = value / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (color: string) => {
      const [r, g, b] = channels(color).map(linear);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    let worst = { token: "", ratio: Infinity };
    const kinds = new Set<string>();
    for (const token of root.querySelectorAll<HTMLElement>("pre [data-token]")) {
      const block = token.closest("[data-part='code-block']")!;
      const [light, dark] = [luminance(getComputedStyle(token).color), luminance(getComputedStyle(block).backgroundColor)].sort(
        (a, b) => b - a,
      );
      const ratio = (light + 0.05) / (dark + 0.05);
      kinds.add(token.dataset.token!);
      if (ratio < worst.ratio) worst = { token: token.dataset.token!, ratio };
    }
    return { kinds: [...kinds], worst };
  });
}

/** The contrast ratio between two computed CSS colours, like "rgb(0, 0, 0)" or "color(srgb 0.4 0.4 0.4)". */
export function contrastRatio(first: string, second: string) {
  const luminance = (color: string) => {
    const values = color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const [r, g, b] = (color.startsWith("color(") ? values : values.map((value) => value / 255)).map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}
