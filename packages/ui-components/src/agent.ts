/**
 * Marks an element as needing a person (`data-agent-confirm`): ui-sdk's agent bridge then asks
 * through the app's `allow` before an agent uses it. An empty sentence takes the mark off.
 */
export function needsPerson(element: HTMLElement, sentence: string) {
  if (sentence) element.dataset.agentConfirm = sentence;
  else delete element.dataset.agentConfirm;
}
