/**
 * Types the elements for Vue templates, checked by vue-tsc and the Vue editor extension. Add
 * once, in any file your project type-checks:
 *
 *     import type {} from "@samyakbhuta/ui-components/vue";
 *
 * Also tell Vue's compiler that tags starting with `ai-` are custom elements, through
 * `compilerOptions.isCustomElement`. Vue sets a prop as a property when the element has one,
 * and `@promptsubmit` listens to the event of that name.
 */
import type { EmitFn, HTMLAttributes, PublicProps } from "vue";
import type { CustomElements } from "./elements.ts";

/** How Vue's tooling sees one tag: its props for the template, and its events for `@`. */
export type VueCustomElement<Tag extends keyof CustomElements> = new () => CustomElements[Tag]["element"] & {
  /** For template type checks only; don't read it from a ref. */
  $props: CustomElements[Tag]["props"] &
    Omit<HTMLAttributes, keyof CustomElements[Tag]["props"]> &
    PublicProps;
  /** For template type checks only; don't call it from a ref. */
  $emit: EmitFn<{
    [Name in keyof CustomElements[Tag]["events"]]: (event: CustomElements[Tag]["events"][Name]) => void;
  }>;
};

export type VueCustomElements = { [Tag in keyof CustomElements]: VueCustomElement<Tag> };

declare module "vue" {
  interface GlobalComponents extends VueCustomElements {}
}
