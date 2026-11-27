/**
 * Types the elements for React 19's JSX. Add once, in any file your project type-checks:
 *
 *     import type {} from "@samyakbhuta/ui-components/react";
 *
 * React 19 sets a prop as a property when the element has one, so import a component (which
 * registers its tag) before React renders it. Listen to an event with `on` and its exact name,
 * like `onpromptsubmit`.
 */
import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type { CustomElements } from "./elements.ts";

/** `onpromptsubmit` and the like, one for each event the element fires. */
export type ReactEventProps<Events> = {
  [Name in keyof Events & string as `on${Name}`]?: (event: Events[Name]) => void;
};

/** The JSX props of one tag: its own props and events, plus React's for any HTML element. */
export type ReactElementProps<Tag extends keyof CustomElements> = CustomElements[Tag]["props"] &
  ReactEventProps<CustomElements[Tag]["events"]> &
  Omit<
    DetailedHTMLProps<HTMLAttributes<CustomElements[Tag]["element"]>, CustomElements[Tag]["element"]>,
    keyof CustomElements[Tag]["props"]
  >;

export type ReactCustomElements = { [Tag in keyof CustomElements]: ReactElementProps<Tag> };

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends ReactCustomElements {}
  }
}
