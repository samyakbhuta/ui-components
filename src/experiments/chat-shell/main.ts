import "../../styles/base.css";
import "./chat-shell.css";
import { mountChatShell } from "./chat-shell.ts";

mountChatShell(document.querySelector<HTMLElement>("#app")!);
