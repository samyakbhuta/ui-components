// Type tests for `@samyakbhuta/ui-components/react`. Each `@ts-expect-error` must stay an error.
import type {} from "@samyakbhuta/ui-components/react";
import type { PromptSubmitDetail, SuggestionSelectDetail } from "@samyakbhuta/ui-components";

export const valid = (
  <>
    <ai-composer
      id="box"
      attachments
      voice="hide"
      history
      pasteAsFile={4000}
      max-files={3}
      submit-on="mod-enter"
      placeholder="Ask"
      modes={[{ value: "chat", label: "Chat" }]}
      strings={{ send: "Go" }}
      busy={false}
      className="composer"
      onpromptsubmit={(event) => {
        const detail: PromptSubmitDetail = event.detail;
        event.preventDefault();
        return detail;
      }}
      onvaluechange={(event) => event.detail.value.toUpperCase()}
      ref={(element) => element?.focus()}
    />
    <ai-transcript>
      <ai-message from="assistant" text="Hi [1]" actions="copy retry feedback" feedback="good" versions={2} onmessagefeedback={(event) => event.detail}>
        <ai-sources slot="footer" max={2} sources={[{ title: "MDN", url: "https://developer.mozilla.org" }]} />
      </ai-message>
      <ai-message from="user" actions={["copy", "edit"]} attachments={[{ name: "a.txt", type: "text/plain", size: 1 }]} />
    </ai-transcript>
    <ai-thinking status="done" duration={12} timer />
    <ai-tool-call name="search" status="running" input={{ query: "x" }} />
    <ai-suggestions
      for="box"
      layout="list"
      suggestions={["Write a haiku", { label: "Explain", value: "Explain this" }]}
      onsuggestionselect={(event) => {
        const detail: SuggestionSelectDetail = event.detail;
        return detail.value;
      }}
    />
    <ai-question
      question="Where to?"
      other
      multiple
      max={2}
      options={["Paris", { value: "rome", label: "Rome", description: "Warm" }]}
      onquestionanswer={(event) => event.detail.labels.join(", ")}
      onquestionskip={() => {}}
    />
    <ai-chat-list chats={[{ id: "1", title: "Chat" }]} selected="1" onchatselect={(event) => event.detail.id} />
  </>
);

export const invalid = (
  <>
    {/* @ts-expect-error status takes running, done or error */}
    <ai-tool-call status="finished" />
    {/* @ts-expect-error from is assistant or user */}
    <ai-message from="system" />
    {/* @ts-expect-error a list of actions only takes known ones */}
    <ai-message actions={["copy", "share"]} />
    {/* @ts-expect-error layout is chips or list */}
    <ai-suggestions layout="grid" />
    {/* @ts-expect-error submit-on is enter or mod-enter */}
    <ai-composer submit-on="shift-enter" />
    {/* @ts-expect-error the detail of promptsubmit has no `prompt` */}
    <ai-composer onpromptsubmit={(event) => event.detail.prompt} />
    {/* @ts-expect-error ai-sources fires no promptsubmit */}
    <ai-sources onpromptsubmit={() => {}} />
    {/* @ts-expect-error the detail of questionanswer has no `text` */}
    <ai-question onquestionanswer={(event) => event.detail.text} />
    {/* @ts-expect-error sources need a title and a url */}
    <ai-sources sources={[{ title: "No address" }]} />
  </>
);
