import type { SupportMessage } from "@prisma/client";
import { audit } from "../audit";
import { prisma } from "../db";
import { AppError } from "../errors";
import { signalChat } from "../firebase/chatSignal";
import { pushToAdmins, pushToUser } from "../firebase/push";
import { getSettings } from "../settings";

// Support chat on an order: the customer who owns it and any admin.
// Messages live in our database. After each change Firebase rings the open
// chats (../firebase/chatSignal), and a support reply sends the customer a push.

export type ChatViewer = { type: "USER"; userId: string } | { type: "ADMIN"; adminId: string };

export const CHAT_MAX_CHARS = 2000;

export interface ChatMessageDTO {
  id: string;
  from: "USER" | "ADMIN";
  /** Customers see support's first name; admins see the full name. */
  name: string;
  text: string;
  attachment: boolean;
  at: string;
}

/** The order, if this viewer may use its chat; otherwise "not found". */
export async function chatOrder(orderId: string, viewer: ChatViewer) {
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, userId: true } });
  if (!o || (viewer.type === "USER" && o.userId !== viewer.userId)) throw new AppError("Order not found", 404);
  return o;
}

function toDTO(m: SupportMessage, adminNames: Map<string, string>, viewer: ChatViewer): ChatMessageDTO {
  const from = m.authorType === "ADMIN" ? "ADMIN" : "USER";
  const adminName = m.adminId ? adminNames.get(m.adminId) ?? "Support" : "Support";
  return {
    id: m.id,
    from,
    // Customers see a first name ("Priya from support"); admins see the full name.
    name: from === "USER" ? "Customer" : viewer.type === "USER" ? `${adminName.split(" ")[0]} · Support` : adminName,
    text: m.message,
    attachment: !!m.attachmentKey,
    at: m.createdAt.toISOString(),
  };
}

async function namesFor(messages: SupportMessage[]) {
  const ids = [...new Set(messages.map((m) => m.adminId).filter(Boolean))] as string[];
  const admins = ids.length ? await prisma.admin.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  return new Map(admins.map((a) => [a.id, a.name]));
}

export async function listChat(orderId: string, viewer: ChatViewer) {
  const o = await chatOrder(orderId, viewer);
  const [messages, thread] = await Promise.all([
    prisma.supportMessage.findMany({ where: { orderId }, orderBy: { createdAt: "asc" }, take: 500 }),
    prisma.supportThread.findUnique({ where: { orderId } }),
  ]);
  const names = await namesFor(messages);
  return {
    // The customer the chat belongs to (where its live signal lives in Firebase).
    ownerId: o.userId,
    messages: messages.map((m) => toDTO(m, names, viewer)),
    status: (thread?.status ?? "OPEN") as "OPEN" | "RESOLVED",
    // When the other side last read the chat: drives the "Seen" mark.
    otherReadAt: (viewer.type === "USER" ? thread?.adminReadAt : thread?.userReadAt)?.toISOString() ?? null,
    // Messages from the other side this viewer hasn't seen yet.
    unread: unreadCount(messages, viewer.type, viewer.type === "USER" ? thread?.userReadAt : thread?.adminReadAt),
  };
}

export async function sendChat(orderId: string, viewer: ChatViewer, text: string, attachmentKey: string | null = null): Promise<ChatMessageDTO> {
  const o = await chatOrder(orderId, viewer);
  const body = text.trim();
  if (!body && !attachmentKey) throw new AppError("Write a message.");
  if (body.length > CHAT_MAX_CHARS) throw new AppError(`Please keep it under ${CHAT_MAX_CHARS} characters.`);
  const from = viewer.type;
  const now = new Date();
  const m = await prisma.$transaction(async (tx) => {
    const created = await tx.supportMessage.create({
      data: {
        orderId,
        userId: o.userId,
        message: body,
        attachmentKey,
        authorType: from,
        adminId: viewer.type === "ADMIN" ? viewer.adminId : null,
        // An admin reply answers everything before it.
        handled: from === "ADMIN",
      },
    });
    if (from === "ADMIN") await tx.supportMessage.updateMany({ where: { orderId, authorType: "USER", handled: false }, data: { handled: true } });
    // A new message reopens a resolved chat; the sender has read up to now.
    const read = from === "USER" ? { userReadAt: now } : { adminReadAt: now };
    await tx.supportThread.upsert({
      where: { orderId },
      create: { orderId, userId: o.userId, status: "OPEN", lastMessageAt: now, lastFrom: from, ...read },
      update: { status: "OPEN", resolvedAt: null, resolvedBy: null, lastMessageAt: now, lastFrom: from, ...read },
    });
    return created;
  });
  if (viewer.type === "ADMIN") await audit({ type: "ADMIN", id: viewer.adminId }, "SUPPORT_CHAT_REPLY", { targetType: "order", targetId: orderId });
  const dto = toDTO(m, await namesFor([m]), viewer);
  signalChat(o.userId, orderId, "message", from);
  if (from === "ADMIN") void notifyReply(o.userId, orderId);
  else void notifySupport(orderId);
  return dto;
}

/** The viewer has seen everything so far. */
export async function markChatRead(orderId: string, viewer: ChatViewer) {
  const o = await chatOrder(orderId, viewer);
  const now = new Date();
  const res = await prisma.supportThread.updateMany({ where: { orderId }, data: viewer.type === "USER" ? { userReadAt: now } : { adminReadAt: now } });
  if (res.count) signalChat(o.userId, orderId, "read", viewer.type);
}

export async function setChatResolved(orderId: string, adminId: string, resolved: boolean) {
  const thread = await prisma.supportThread.findUnique({ where: { orderId }, select: { userId: true } });
  if (!thread) throw new AppError("There's no chat on this order yet.", 404);
  await prisma.supportThread.update({
    where: { orderId },
    data: resolved ? { status: "RESOLVED", resolvedAt: new Date(), resolvedBy: adminId } : { status: "OPEN", resolvedAt: null, resolvedBy: null },
  });
  await audit({ type: "ADMIN", id: adminId }, resolved ? "SUPPORT_CHAT_RESOLVED" : "SUPPORT_CHAT_REOPENED", { targetType: "order", targetId: orderId });
  signalChat(thread.userId, orderId, "thread", "ADMIN");
}

function unreadCount(messages: SupportMessage[], side: "USER" | "ADMIN", readAt: Date | null | undefined) {
  return messages.filter((m) => (m.authorType === "ADMIN" ? "ADMIN" : "USER") !== side && (!readAt || m.createdAt > readAt)).length;
}

/** "Support replied" push to the customer's phones and browsers. No message text: it can show on a lock screen. */
async function notifyReply(userId: string, orderId: string) {
  const s = await getSettings().catch(() => null);
  await pushToUser(userId, {
    title: `${s?.brand_name ?? "Support"}: new reply`,
    body: `Support replied on order ${orderId}`,
    link: `/orders/${orderId}`,
    tag: `chat-${orderId}`,
    data: { type: "chat_reply", orderId },
  });
}

/** "Customer wrote" push to support staff's devices. No message text, same as for customers. */
async function notifySupport(orderId: string) {
  await pushToAdmins({
    title: "New customer message",
    body: `Order ${orderId}`,
    link: `/admin/orders/${orderId}`,
    tag: `admin-chat-${orderId}`,
    data: { type: "chat_customer", orderId },
  });
}

/** Orders where support replied after the customer last looked. */
export async function unreadForUser(userId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ orderId: string }[]>`
    SELECT "orderId" FROM support_threads
    WHERE "userId" = ${userId} AND "lastFrom" = 'ADMIN' AND ("userReadAt" IS NULL OR "userReadAt" < "lastMessageAt")`;
  return rows.map((r) => r.orderId);
}

/** Chats waiting on an admin reply. */
export const waitingOnUsCount = () => prisma.supportThread.count({ where: { status: "OPEN", lastFrom: "USER" } });
