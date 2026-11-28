import { contrastRatio, expect, test } from "./fixtures";

test.use({ viewport: { width: 900, height: 760 } });

/**
 * A speech engine driven by the test: `window.speak(words, final)` sends words as heard,
 * `window.fail(error)` stops with an error, and it otherwise keeps listening.
 */
function scriptedSpeech() {
  type Session = { onresult?: (event: unknown) => void; onerror?: (event: unknown) => void; onend?: () => void };
  let current: Session | undefined;
  const Recognition = class {
    start(this: Session) {
      current = this;
    }
    stop(this: Session) {
      this.onerror?.({ error: "aborted" });
      this.onend?.();
    }
  };
  for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
    Object.defineProperty(window, name, { configurable: true, writable: true, value: Recognition });
  }
  Object.assign(window, {
    speak: (transcript: string, isFinal: boolean) =>
      current?.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal })] }),
    fail: (error: string) => {
      current?.onerror?.({ error });
      current?.onend?.();
    },
  });
}

const speak = (page: import("@playwright/test").Page, words: string, final = false) =>
  page.evaluate(([words, final]) => (window as unknown as { speak(words: string, final: boolean): void }).speak(words, final), [words, final] as const);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(scriptedSpeech);
  await page.goto("/experiments/chat-shell.html");
});

test("while listening, the mic is a red Stop, the box says to speak, and words show as they're heard", async ({ page }) => {
  const composer = page.locator("ai-composer");
  const box = page.getByRole("textbox", { name: "Prompt" });
  const voice = page.getByRole("button", { name: "Voice input" });
  await voice.click();

  await expect(composer).toHaveAttribute("listening", "");
  await expect(voice).toHaveAttribute("aria-pressed", "true");
  await expect(voice).toHaveAttribute("title", "Stop voice input");
  await expect(box).toHaveAttribute("placeholder", "Listening… speak now");
  await expect(composer.locator("[data-part='status']")).toHaveText("Listening…");

  await speak(page, "plan a trip");
  await expect(box).toHaveValue("plan a trip");
  await speak(page, "plan a trip to Goa");
  await expect(box).toHaveValue("plan a trip to Goa");
  await speak(page, "Plan a trip to Goa.", true);
  await expect(box).toHaveValue("Plan a trip to Goa.");

  await voice.click();
  await expect(composer).not.toHaveAttribute("listening", "");
  await expect(voice).toHaveAttribute("title", "Voice input");
  await expect(box).toHaveAttribute("placeholder", /^(?!Listening)/);
  await expect(composer.locator("[data-part='status']")).toHaveText("");
  await expect(box).toHaveValue("Plan a trip to Goa.");
});

test("a blocked microphone says so", async ({ page }) => {
  await page.getByRole("button", { name: "Voice input" }).click();
  await page.evaluate(() => (window as unknown as { fail(error: string): void }).fail("not-allowed"));
  const status = page.locator("ai-composer [data-part='status']");
  await expect(status).toHaveText(/^Microphone access is blocked/);
  await expect(status).toHaveAttribute("role", "status");
  await expect(page.getByRole("button", { name: "Voice input" })).toHaveAttribute("aria-pressed", "false");
});

test("the red Stop button, its icon and the card's border are readable @theme", async ({ page }) => {
  await page.getByRole("button", { name: "Voice input" }).click();
  // Move the pointer away, so the button isn't hovered.
  await page.mouse.move(0, 0);
  const colours = await page.locator("ai-composer").evaluate((composer) => {
    /** The colour behind an element: the nearest background that isn't transparent, or the page's canvas. */
    const behind = (element: Element) => {
      for (let node: Element | null = element; node; node = node.parentElement) {
        const colour = getComputedStyle(node).backgroundColor;
        if (!/rgba\(0, 0, 0, 0\)|transparent/.test(colour)) return colour;
      }
      const probe = document.body.appendChild(document.createElement("div"));
      probe.style.background = "Canvas";
      const canvas = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return canvas;
    };
    const button = composer.querySelector("[data-part='voice'] button")!;
    const card = composer.querySelector("[data-part='card']")!;
    const style = getComputedStyle(button);
    return {
      button: style.backgroundColor,
      icon: style.color,
      border: getComputedStyle(card).borderTopColor,
      card: getComputedStyle(card).backgroundColor,
      status: getComputedStyle(composer.querySelector("[data-part='status']")!).color,
      page: behind(composer.querySelector("[data-part='status']")!),
    };
  });
  expect(contrastRatio(colours.icon, colours.button)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(colours.button, colours.card)).toBeGreaterThanOrEqual(3);
  expect(contrastRatio(colours.border, colours.page)).toBeGreaterThanOrEqual(3);
  expect(contrastRatio(colours.status, colours.page)).toBeGreaterThanOrEqual(4.5);
});

test("with reduced motion, the ring stays still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Voice input" }).click();
  const button = page.locator("ai-composer [data-part='voice'] button");
  await expect(button).toHaveCSS("animation-name", "none");
  await expect(button).toHaveCSS("box-shadow", /rgb/);
});
