import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { prisma } from "../db";
import { env } from "../env";
import { firebaseApp, logFirebaseError } from "./admin";

// Push notifications through Firebase Cloud Messaging. One message reaches every
// device the person has registered: browsers today, the Android (or iOS) app
// later. Customers hear about support replies; support hears about customer messages.

export const PUSH_PLATFORMS = ["WEB", "ANDROID", "IOS"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

export interface PushNote {
  title: string;
  body: string;
  /** Path inside the app to open on tap, e.g. /orders/ORD-… */
  link: string;
  /** Notifications with the same tag replace each other (three quick replies = one notification). */
  tag: string;
  /** Extra fields for the apps, e.g. { type: "chat_reply", orderId }. */
  data?: Record<string, string>;
}

/** Push is set up for browsers: the server key plus the web settings. */
/** The server can send to the Android app (only the service account is needed). */
export function appPushReady(): boolean {
  try {
    return !!firebaseApp();
  } catch {
    return false;
  }
}

export function webPushReady(): boolean {
  const cfg = env.firebase.webConfig;
  return !!(cfg?.appId && env.firebase.serviceAccount && env.firebase.messagingSenderId && env.firebase.vapidKey);
}

/** Remember (or move) a device for this customer. A token belongs to one customer at a time. */
export async function registerPushDevice(userId: string, token: string, platform: PushPlatform) {
  await prisma.pushDevice.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform, lastSeenAt: new Date() },
  });
}

export async function unregisterPushDevice(userId: string, token: string) {
  await prisma.pushDevice.deleteMany({ where: { token, userId } });
}

export async function registerAdminPushDevice(adminId: string, token: string, platform: PushPlatform) {
  await prisma.adminPushDevice.upsert({
    where: { token },
    create: { adminId, token, platform },
    update: { adminId, platform, lastSeenAt: new Date() },
  });
}

export async function unregisterAdminPushDevice(adminId: string, token: string) {
  await prisma.adminPushDevice.deleteMany({ where: { token, adminId } });
}

// Firebase says these tokens will never work again (app removed, permission revoked).
const DEAD = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

/** Send to all of a customer's devices. Never throws: a failed push must not fail the action behind it. */
export async function pushToUser(userId: string, note: PushNote): Promise<{ sent: number; removed: number }> {
  if (!firebaseApp()) return { sent: 0, removed: 0 };
  try {
    const devices = await prisma.pushDevice.findMany({ where: { userId }, select: { token: true } });
    return await send(devices.map((d) => d.token), note, (dead) => prisma.pushDevice.deleteMany({ where: { token: { in: dead } } }));
  } catch (e) {
    logFirebaseError("push", e);
    return { sent: 0, removed: 0 };
  }
}

/** Send to every active admin's devices (or only super admins'). Never throws. */
/**
 * `forUser`: about this customer, so only super admins and the customer's own admin get it.
 * `superOnly`: super admins only.
 */
export async function pushToAdmins(note: PushNote, opts: { superOnly?: boolean; forUser?: string } = {}): Promise<{ sent: number; removed: number }> {
  if (!firebaseApp()) return { sent: 0, removed: 0 };
  try {
    const owner = opts.forUser ? (await prisma.user.findUnique({ where: { id: opts.forUser }, select: { adminId: true } }))?.adminId : null;
    const who = opts.superOnly ? { role: "SUPER_ADMIN" as const } : opts.forUser ? { OR: [{ role: "SUPER_ADMIN" as const }, ...(owner ? [{ id: owner }] : [])] } : {};
    const devices = await prisma.adminPushDevice.findMany({ where: { admin: { status: "ACTIVE", ...who } }, select: { token: true } });
    return await send(devices.map((d) => d.token), note, (dead) => prisma.adminPushDevice.deleteMany({ where: { token: { in: dead } } }));
  } catch (e) {
    logFirebaseError("admin push", e);
    return { sent: 0, removed: 0 };
  }
}

async function send(tokens: string[], note: PushNote, forget: (dead: string[]) => Promise<unknown>) {
  if (tokens.length === 0) return { sent: 0, removed: 0 };
  const data = { ...note.data, title: note.title, body: note.body, link: note.link, tag: note.tag };
  const message: MulticastMessage = {
    tokens,
    // Browsers: data only; our service worker (/push-sw.js) shows it.
    data,
    // Android app: shown by the system when the app is in the background.
    android: { priority: "high", notification: { title: note.title, body: note.body, tag: note.tag, channelId: "chat" } },
    // iOS app, if there ever is one.
    apns: { payload: { aps: { alert: { title: note.title, body: note.body }, sound: "default", threadId: note.tag } } },
    webpush: { headers: { Urgency: "high", TTL: String(24 * 3600) } },
  };
  // Firebase takes at most 500 devices per call.
  let sent = 0;
  const dead: string[] = [];
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await getMessaging(firebaseApp()!).sendEachForMulticast({ ...message, tokens: batch });
    sent += res.successCount;
    res.responses.forEach((r, j) => !r.success && r.error && DEAD.has(r.error.code) && dead.push(batch[j]));
  }
  if (dead.length) await forget(dead);
  return { sent, removed: dead.length };
}
