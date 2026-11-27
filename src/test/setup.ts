import { afterEach } from "vitest";

declare global {
  var __UI_SDK_STRICT__: boolean | undefined;
}
globalThis.__UI_SDK_STRICT__ = true;

// Tests marked `@vitest-environment node` run without a DOM, so the browser stubs are skipped.
if (typeof document !== "undefined") {
  HTMLElement.prototype.showPopover = function () {};
  HTMLElement.prototype.hidePopover = function () {};
  Element.prototype.getAnimations = () => [];
  Element.prototype.scrollIntoView = function () {};
  Element.prototype.checkVisibility = () => true;
  Element.prototype.getClientRects = () => [] as unknown as DOMRectList;
  document.elementFromPoint = () => null;
  document.elementsFromPoint = () => [];
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  document.head.append(
    Object.assign(document.createElement("style"), {
      textContent: "[popover] { display: block !important }",
    }),
  );

  // jsdom's ElementInternals lacks the form and state APIs that custom elements call.
  const attachInternals = HTMLElement.prototype.attachInternals;
  HTMLElement.prototype.attachInternals = function () {
    const internals = attachInternals.call(this);
    const stubs = {
      setFormValue() {},
      setValidity() {},
      checkValidity: () => true,
      reportValidity: () => true,
      states: new Set<string>(),
    };
    for (const [key, value] of Object.entries(stubs)) {
      Object.defineProperty(internals, key, { value, configurable: true });
    }
    return internals;
  };

  afterEach(() => {
    document.body.replaceChildren();
  });
}
