import "@ui-sdk/web/input";

const template = document.createElement("template");
template.innerHTML = `
  <style>
    :host {
      display: block;
      max-width: 40rem;
      margin: 4rem auto;
      padding: 0 1rem;
    }

    [data-slot="input-group"] {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem;
      padding-inline-start: 0.5rem;
      border: 1px solid color-mix(in srgb, CanvasText 55%, Canvas);
      border-radius: 0.375rem;
      background: Field;
      color: FieldText;
    }

    [data-slot="input-group"]:has([data-slot="input"]:focus-visible) {
      outline: auto;
    }

    [data-slot="input"] {
      flex: 1;
      min-inline-size: 0;
      padding-block: 0.25rem;
      padding-inline: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      outline: none;
    }

    /* Firefox dims placeholders with opacity, which would undo this color. */
    [data-slot="input"]::placeholder {
      color: color-mix(in srgb, FieldText 60%, Field);
      opacity: 1;
    }

    /* Chromium and Safari add a clear button of their own to search inputs. */
    [data-slot="input"]::-webkit-search-cancel-button {
      appearance: none;
    }

    [data-slot="input-clear"] {
      font: inherit;
      font-size: 0.875rem;
    }
  </style>
  <h1>Web Components App</h1>
  <p>Edit <code>src/components/app-root.ts</code> to get started.</p>
  <ui-input-group>
    <ui-input>
      <input type="search" aria-label="Search" placeholder="Search" />
    </ui-input>
    <ui-input-clear>
      <button type="button">Clear</button>
    </ui-input-clear>
  </ui-input-group>
`;

export class AppRoot extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
  }
}

if (!customElements.get("app-root")) {
  customElements.define("app-root", AppRoot);
}

declare global {
  interface HTMLElementTagNameMap {
    "app-root": AppRoot;
  }
}
