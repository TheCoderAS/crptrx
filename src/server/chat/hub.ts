import { EventEmitter } from "node:events";

// Live chat events, shared by the web app and the WebSocket server in the same
// process. Kept on globalThis because the custom server and Next's own bundle
// each load their own copy of this module.

export type ChatEvent =
  | { type: "message"; message: ChatMessageDTO }
  | { type: "read"; by: "USER" | "ADMIN"; at: string }
  | { type: "typing"; from: "USER" | "ADMIN" }
  | { type: "thread"; status: "OPEN" | "RESOLVED" };

export interface ChatMessageDTO {
  id: string;
  from: "USER" | "ADMIN";
  /** Support replies show the admin's first name; customers see "Support". */
  name: string;
  text: string;
  attachment: boolean;
  at: string;
}

const g = globalThis as unknown as { __chatHub?: EventEmitter };
export const hub: EventEmitter = g.__chatHub ?? (g.__chatHub = new EventEmitter().setMaxListeners(0));

export const orderRoom = (orderId: string) => `order:${orderId}`;
/** Admins' inbox: something changed in some thread. */
export const INBOX = "inbox";

export function publish(orderId: string, e: ChatEvent) {
  hub.emit(orderRoom(orderId), e);
  if (e.type !== "typing") hub.emit(INBOX, { orderId });
}
