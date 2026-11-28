/**
 * The props and events of every element, for typing them in JSX and templates. `react.ts`,
 * `vue.ts` and `svelte.ts` build on this map; use it directly for another framework.
 *
 * Props are what a framework can set: each element's writable properties, with the types their
 * setters take, and the attributes that have no property, by their attribute names. React 19,
 * Vue and Svelte set a property when the element has one, and an attribute otherwise.
 */
import type { AiChatListElement, ChatListAction, ChatListEvents, ChatListStrings, ChatSummary } from "./ai-chat-list/ai-chat-list.ts";
import type {
  AiComposerElement,
  ComposerCommands,
  ComposerEvents,
  ComposerIcons,
  ComposerOption,
  ComposerQuote,
  ComposerReferences,
  ComposerStrings,
  SpeechRecognizer,
} from "./ai-composer/ai-composer.ts";
import type {
  AiMessageElement,
  Highlighter,
  MessageActionName,
  MessageAttachment,
  MessageEvents,
  MessageFeedback,
  MessageIcons,
  MessageQuote,
  MessageStrings,
} from "./ai-message/ai-message.ts";
import type { AiSourcesElement, Source, SourcesEvents, SourcesStrings } from "./ai-sources/ai-sources.ts";
import type { AiChatElement, ChatEvents, ChatMessage, ChatModel, ChatStrings } from "./ai-chat/ai-chat.ts";
import type { AiApprovalElement, ApprovalDecisionDetail, ApprovalEvents, ApprovalStrings } from "./ai-approval/ai-approval.ts";
import type { AiQuestionsElement, QuestionsEvents, QuestionsItem, QuestionsStrings } from "./ai-questions/ai-questions.ts";
import type { AiNoticeElement, NoticeAction, NoticeEvents, NoticeStrings, NoticeTone } from "./ai-notice/ai-notice.ts";
import type { AiPlanElement, PlanAcceptOption, PlanDecisionDetail, PlanEvents, PlanStrings } from "./ai-plan/ai-plan.ts";
import type { AiQuestionElement, QuestionAnswer, QuestionEvents, QuestionOption, QuestionStrings } from "./ai-question/ai-question.ts";
import type { AiSuggestionsElement, Suggestion, SuggestionsEvents, SuggestionsStrings } from "./ai-suggestions/ai-suggestions.ts";
import type { AiThinkingElement, ThinkingStatus, ThinkingStrings } from "./ai-thinking/ai-thinking.ts";
import type { AiToolCallElement, ToolCallStatus, ToolCallStrings } from "./ai-tool-call/ai-tool-call.ts";
import type { AiTranscriptElement, TranscriptEvents, TranscriptStrings } from "./ai-transcript/ai-transcript.ts";

/** A number written as an attribute, which frameworks may pass as a string. */
type NumberAttribute = number | `${number}`;

export interface AiComposerProps {
  // Properties
  modes?: ComposerOption[];
  models?: ComposerOption[];
  thinkingLevels?: ComposerOption[];
  commands?: ComposerCommands;
  references?: ComposerReferences;
  strings?: Partial<ComposerStrings>;
  icons?: Partial<ComposerIcons>;
  speechRecognizer?: SpeechRecognizer;
  value?: string;
  mode?: string;
  model?: string;
  thinking?: string;
  /** `true` turns history on, like the attribute; a list seeds it. */
  history?: string[] | boolean;
  attachments?: boolean;
  voice?: boolean | "hide";
  pasteAsFile?: boolean | number;
  /** How quotes are added: cards above the text, or `> ` lines in it. */
  quoteStyle?: "card" | "markdown";
  quotes?: ComposerQuote[];
  busy?: boolean;
  disabled?: boolean;
  // Attributes
  accept?: string;
  "max-files"?: NumberAttribute;
  "max-size"?: NumberAttribute;
  "voice-lang"?: string;
  "default-mode"?: string;
  "default-model"?: string;
  "default-thinking"?: string;
  label?: string;
  placeholder?: string;
  hint?: string;
  "submit-on"?: "enter" | "mod-enter";
  rows?: NumberAttribute;
  "max-length"?: NumberAttribute;
  persist?: string;
}

export interface AiMessageProps {
  from?: "assistant" | "user";
  format?: "markdown" | "text";
  text?: string;
  streaming?: boolean;
  /** A list, or the attribute's space-separated words, like `"copy retry feedback"`. */
  actions?: MessageActionName[] | string;
  error?: string | null;
  feedback?: MessageFeedback | null;
  versions?: NumberAttribute;
  version?: NumberAttribute;
  /** When it was sent: a `Date`, an ISO time, or milliseconds. */
  time?: Date | string | number | null;
  /** The model that wrote it, like "Sonnet 5.5". */
  model?: string | null;
  attachments?: MessageAttachment[];
  strings?: Partial<MessageStrings>;
  highlighter?: Highlighter | null;
  icons?: Partial<MessageIcons>;
  quotes?: MessageQuote[];
}

export interface AiTranscriptProps {
  strings?: Partial<TranscriptStrings>;
  /** Selecting words in a message offers a Quote button. */
  quotable?: boolean;
  // Attributes
  /** "none" stops reading finished replies out. */
  announce?: "none";
  /** The id of the `<ai-composer>` that Quote adds to. */
  for?: string;
}

export interface AiThinkingProps {
  status?: ThinkingStatus;
  label?: string;
  duration?: NumberAttribute | null;
  timer?: boolean;
  reasoning?: string;
  strings?: Partial<ThinkingStrings>;
}

export interface AiToolCallProps {
  name?: string;
  label?: string;
  summary?: string;
  status?: ToolCallStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  strings?: Partial<ToolCallStrings>;
}

export interface AiSourcesProps {
  sources?: Source[];
  max?: NumberAttribute | null;
  strings?: Partial<SourcesStrings>;
}

export interface AiSuggestionsProps {
  suggestions?: Suggestion[];
  for?: string;
  action?: "send" | "fill";
  layout?: "chips" | "list";
  disabled?: boolean;
  strings?: Partial<SuggestionsStrings>;
  // Attributes
  label?: string;
}

export interface AiQuestionProps {
  options?: QuestionOption[];
  question?: string;
  multiple?: boolean;
  other?: boolean;
  max?: NumberAttribute | null;
  skippable?: boolean;
  disabled?: boolean;
  strings?: Partial<QuestionStrings>;
  value?: string | string[] | null;
  otherText?: string;
  answer?: QuestionAnswer | null;
  /** The answer it starts with, read once. `answer` shows a saved one at any time. */
  defaultAnswer?: QuestionAnswer | null;
  /** ui-sdk's own: logs the primitive's state and changes to the console. */
  debug?: boolean;
}

export interface AiApprovalProps {
  name?: string;
  label?: string;
  description?: string;
  always?: boolean;
  reason?: boolean;
  disabled?: boolean;
  input?: unknown;
  reasonText?: string;
  decision?: ApprovalDecisionDetail | null;
  /** The decision it starts with, read once. `decision` shows a saved one at any time. */
  defaultDecision?: ApprovalDecisionDetail | null;
  strings?: Partial<ApprovalStrings>;
  /** ui-sdk's own: logs the primitive's state and changes to the console. */
  debug?: boolean;
}

export interface AiQuestionsProps {
  label?: string;
  disabled?: boolean;
  questions?: QuestionsItem[] | null;
  index?: number;
  answers?: QuestionAnswer[] | null;
  /** The answers it starts with, read once. `answers` shows saved ones at any time. */
  defaultAnswers?: QuestionAnswer[] | null;
  strings?: Partial<QuestionsStrings>;
  /** ui-sdk's own: logs the primitive's state and changes to the console. */
  debug?: boolean;
}

export interface AiPlanProps {
  heading?: string;
  summary?: string;
  href?: string;
  open?: boolean;
  disabled?: boolean;
  plan?: string;
  accepts?: PlanAcceptOption[];
  feedbackText?: string;
  decision?: PlanDecisionDetail | null;
  /** The decision it starts with, read once. `decision` shows a saved one at any time. */
  defaultDecision?: PlanDecisionDetail | null;
  /** Whether the plan starts open, read once. */
  defaultOpen?: boolean;
  strings?: Partial<PlanStrings>;
  /** ui-sdk's own: logs the primitive's state and changes to the console. */
  debug?: boolean;
}

export interface AiNoticeProps {
  heading?: string;
  tone?: NoticeTone;
  /** An ISO time, as the attribute takes it, or a Date. */
  resetsAt?: Date | string | null;
  dismissible?: boolean;
  text?: string;
  actions?: NoticeAction[];
  /** Whether it shows. Dismiss closes it. */
  open?: boolean;
  /** Whether it starts shown, read once. */
  defaultOpen?: boolean;
  strings?: Partial<NoticeStrings>;
  /** ui-sdk's own: logs the primitive's state and changes to the console. */
  debug?: boolean;
}

export interface AiChatProps {
  model?: ChatModel | null;
  messages?: ChatMessage[];
  suggestions?: Suggestion[];
  alwaysAllowed?: string[];
  /** The actions each reply offers, as words, like "copy retry feedback". */
  actions?: string | string[];
  strings?: Partial<ChatStrings>;
}

export interface AiChatListProps {
  chats?: ChatSummary[];
  selected?: string | null;
  /** A list, or the attribute's space-separated words, like `"rename export delete"`. */
  actions?: ChatListAction[] | string;
  href?: (chat: ChatSummary) => string;
  strings?: Partial<ChatListStrings>;
}

/** Each tag's element class, props and events. */
export interface CustomElements {
  "ai-composer": { element: AiComposerElement; props: AiComposerProps; events: ComposerEvents };
  "ai-message": { element: AiMessageElement; props: AiMessageProps; events: MessageEvents };
  "ai-transcript": { element: AiTranscriptElement; props: AiTranscriptProps; events: TranscriptEvents };
  "ai-thinking": { element: AiThinkingElement; props: AiThinkingProps; events: {} };
  "ai-tool-call": { element: AiToolCallElement; props: AiToolCallProps; events: {} };
  "ai-sources": { element: AiSourcesElement; props: AiSourcesProps; events: SourcesEvents };
  "ai-suggestions": { element: AiSuggestionsElement; props: AiSuggestionsProps; events: SuggestionsEvents };
  "ai-question": { element: AiQuestionElement; props: AiQuestionProps; events: QuestionEvents };
  "ai-questions": { element: AiQuestionsElement; props: AiQuestionsProps; events: QuestionsEvents };
  "ai-approval": { element: AiApprovalElement; props: AiApprovalProps; events: ApprovalEvents };
  "ai-plan": { element: AiPlanElement; props: AiPlanProps; events: PlanEvents };
  "ai-notice": { element: AiNoticeElement; props: AiNoticeProps; events: NoticeEvents };
  "ai-chat": { element: AiChatElement; props: AiChatProps; events: ChatEvents };
  "ai-chat-list": { element: AiChatListElement; props: AiChatListProps; events: ChatListEvents };
}

export type CustomElementTag = keyof CustomElements;
