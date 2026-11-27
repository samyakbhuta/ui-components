/**
 * Types the elements for Svelte 5 markup, checked by svelte-check and the Svelte editor
 * extension. Add once, in any file your project type-checks:
 *
 *     import type {} from "@samyakbhuta/ui-components/svelte";
 *
 * Svelte sets a prop as a property when the element has one, so import a component (which
 * registers its tag) before it renders. Listen to an event with `on` and its exact name, like
 * `onpromptsubmit`.
 */
import type { HTMLAttributes } from "svelte/elements";
import type { CustomElements } from "./elements.ts";

/** `onpromptsubmit` and the like, one for each event the element fires. */
export type SvelteEventProps<Events> = {
  [Name in keyof Events & string as `on${Name}`]?: (event: Events[Name]) => void;
};

/** The attributes of one tag: its own props and events, plus Svelte's for any HTML element. */
export type SvelteElementProps<Tag extends keyof CustomElements> = CustomElements[Tag]["props"] &
  SvelteEventProps<CustomElements[Tag]["events"]> &
  Omit<HTMLAttributes<CustomElements[Tag]["element"]>, keyof CustomElements[Tag]["props"]>;

export type SvelteCustomElements = { [Tag in keyof CustomElements]: SvelteElementProps<Tag> };

declare module "svelte/elements" {
  interface SvelteHTMLElements extends SvelteCustomElements {}
}
