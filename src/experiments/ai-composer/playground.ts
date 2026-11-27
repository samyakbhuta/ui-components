import "@ui-sdk/web/segmented-control";
import "@ui-sdk/web/slider";
import "@ui-sdk/web/switch";
import "@samyakbhuta/ui-components/ai-message";
import {
  type AiComposerElement,
  defaultModels,
  defaultModes,
  defaultThinkingLevels,
} from "@samyakbhuta/ui-components/ai-composer";

type Feature = { key: string; label: string; on: boolean };

const features: Feature[] = [
  { key: "attachments", label: "Attachments", on: true },
  { key: "voice", label: "Voice", on: false },
  { key: "modes", label: "Mode", on: true },
  { key: "models", label: "Model", on: true },
  { key: "thinking", label: "Thinking", on: false },
  { key: "commands", label: "/ commands", on: true },
  { key: "references", label: "@ references", on: true },
  { key: "history", label: "History (↑)", on: false },
  { key: "busy", label: "Busy", on: false },
  { key: "disabled", label: "Disabled", on: false },
];

const commands = [
  { value: "summarize", label: "summarize" },
  { value: "explain", label: "explain" },
];
const references = ["README.md", "package.json", "src/main.ts"];

/** Black or white, whichever reads better on the accent. */
function readableOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = (channel: number) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance > 0.4 ? "#000000" : "#ffffff";
}

/** The playground: switches and sliders that change a live composer and write its code. */
export function mountPlayground(section: HTMLElement) {
  section.querySelector(".demo-stage")!.innerHTML = `
    <div class="playground">
      <div class="playground-controls">
        <fieldset class="playground-switches">
          <legend>Features</legend>
          ${features
            .map(
              (feature) => `
            <label data-slot="label">
              <ui-switch data-option="${feature.key}"${feature.on ? " default-checked" : ""}><ui-switch-thumb></ui-switch-thumb></ui-switch>
              ${feature.label}
            </label>`,
            )
            .join("")}
        </fieldset>
        <div class="playground-settings">
          <div class="playground-setting">
            <span id="playground-send-label">Send with</span>
            <ui-segmented-control data-option="submit-on" aria-labelledby="playground-send-label" default-value="enter">
              <ui-segmented-control-indicator></ui-segmented-control-indicator>
              <ui-segmented-control-item value="enter">Enter</ui-segmented-control-item>
              <ui-segmented-control-item value="mod-enter">Ctrl+Enter</ui-segmented-control-item>
            </ui-segmented-control>
          </div>
          <div class="playground-setting">
            <span>Corner radius</span>
            <ui-slider data-option="radius" default-value="20" min="0" max="32">
              <ui-slider-control>
                <ui-slider-track>
                  <ui-slider-indicator></ui-slider-indicator>
                  <ui-slider-thumb aria-label="Corner radius"></ui-slider-thumb>
                </ui-slider-track>
              </ui-slider-control>
              <ui-slider-value></ui-slider-value>
            </ui-slider>
          </div>
          <label class="playground-setting">
            <span>Accent</span>
            <input type="color" data-option="accent" value="#1f1f1f">
          </label>
          <label class="playground-setting">
            <span>Placeholder</span>
            <input type="text" data-option="placeholder" value="Ask anything…">
          </label>
        </div>
      </div>
      <ai-composer class="playground-composer"></ai-composer>
      <ai-message class="playground-code" actions=""></ai-message>
    </div>`;

  const composer = section.querySelector<AiComposerElement>(".playground-composer")!;
  const code = section.querySelector<HTMLElementTagNameMap["ai-message"]>(".playground-code")!;
  const on = (key: string) =>
    section.querySelector<HTMLElement & { checked: boolean }>(`ui-switch[data-option="${key}"]`)!.checked;
  const option = <T extends HTMLElement>(key: string) => section.querySelector<T>(`[data-option="${key}"]`)!;
  let accentChanged = false;

  const update = () => {
    const attributes: [string, string?][] = [];
    for (const key of ["attachments", "voice", "history", "busy", "disabled"]) if (on(key)) attributes.push([key]);
    if (on("modes")) attributes.push(["default-mode", "auto"]);
    if (on("models")) attributes.push(["default-model", "sonnet-5.5"]);
    if (on("thinking")) attributes.push(["default-thinking", "medium"]);
    const submitOn = (option<HTMLElement & { api: { getValue(): unknown } }>("submit-on").api.getValue() as string) ?? "enter";
    if (submitOn === "mod-enter") attributes.push(["submit-on", "mod-enter"]);
    const placeholder = option<HTMLInputElement>("placeholder").value;
    if (placeholder !== "Ask anything…") attributes.push(["placeholder", placeholder]);

    // Apply to the live composer.
    for (const name of ["attachments", "voice", "history", "busy", "disabled", "default-mode", "default-model", "default-thinking", "submit-on", "placeholder"]) {
      const attribute = attributes.find(([key]) => key === name);
      if (attribute) composer.setAttribute(name, attribute[1] ?? "");
      else composer.removeAttribute(name);
    }
    composer.modes = on("modes") ? defaultModes : [];
    composer.models = on("models") ? defaultModels : [];
    composer.thinkingLevels = on("thinking") ? defaultThinkingLevels : [];
    composer.commands = on("commands") ? commands : undefined;
    composer.references = on("references") ? references : undefined;

    const radius = Number(option<HTMLElement & { value: number }>("radius").value ?? 20);
    const accent = option<HTMLInputElement>("accent").value;
    const styles: string[] = [];
    if (radius !== 20) styles.push(`  --ai-composer-radius: ${radius}px;`);
    if (accentChanged) styles.push(`  --ai-composer-accent: ${accent};`, `  --ai-composer-accent-text: ${readableOn(accent)};`);
    composer.style.setProperty("--ai-composer-radius", `${radius}px`);
    if (accentChanged) {
      composer.style.setProperty("--ai-composer-accent", accent);
      composer.style.setProperty("--ai-composer-accent-text", readableOn(accent));
    }

    // Write the code for what's on.
    const tag = attributes.length
      ? `<ai-composer\n${attributes.map(([name, value]) => `  ${value === undefined ? name : `${name}="${value}"`}`).join("\n")}>\n</ai-composer>`
      : "<ai-composer></ai-composer>";
    const lists = [
      on("modes") && "composer.modes = defaultModes;",
      on("models") && "composer.models = defaultModels;",
      on("thinking") && "composer.thinkingLevels = defaultThinkingLevels;",
      on("commands") &&
        `composer.commands = [\n${commands.map((command) => `  { value: "${command.value}", label: "${command.label}" },`).join("\n")}\n];`,
      on("references") && `composer.references = [${references.map((reference) => `"${reference}"`).join(", ")}];`,
    ].filter(Boolean);
    const presets = ["modes", "models", "thinking"].filter(on).map((key) =>
      key === "modes" ? "defaultModes" : key === "models" ? "defaultModels" : "defaultThinkingLevels",
    );
    const script = [
      'import "@samyakbhuta/ui-components/ai-composer";',
      presets.length && `import { ${presets.join(", ")} } from "@samyakbhuta/ui-components/ai-composer";`,
      "",
      'const composer = document.querySelector("ai-composer");',
      ...lists,
      'composer.addEventListener("promptsubmit", (event) => console.log(event.detail));',
    ].filter((line) => line !== 0 && line !== false);
    code.text = [
      "```html",
      tag,
      "```",
      "",
      "```ts",
      ...script,
      "```",
      ...(styles.length ? ["", "```css", "ai-composer {", ...styles, "}", "```"] : []),
    ].join("\n");
  };

  // ui-sdk's change events don't bubble, so listen on each control.
  for (const control of section.querySelectorAll("ui-switch")) control.addEventListener("checkedchange", () => queueMicrotask(update));
  for (const control of section.querySelectorAll(".playground-settings [data-option]")) {
    control.addEventListener("valuechange", () => queueMicrotask(update));
  }
  option<HTMLInputElement>("accent").addEventListener("input", () => {
    accentChanged = true;
    update();
  });
  option<HTMLInputElement>("placeholder").addEventListener("input", update);
  customElements.whenDefined("ui-switch").then(() => queueMicrotask(update));
}
