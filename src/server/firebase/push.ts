import { getMessaging, type MulticastMessage } from "firebase-admin/messaging";
import { prisma } from "../db";
import { firebaseApp, logFirebaseError } from "./admin";

// Push notifications to customers through Firebase Cloud Messaging. One message
// reaches every device the customer has registered: browsers today, the Android
// (or iOS) app later. Admins don't get push.

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

// Firebase says these tokens will never work again (app removed, permission revoked).
const DEAD = new Set(["messaging/registration-token-not-registered", "messaging/invalid-registration-token"]);

/** Send to all of a customer's devices. Never throws: a failed push must not fail the action behind it. */
export async function pushToUser(userId: string, note: PushNote): Promise<{ sent: number; removed: number }> {
  const app = firebaseApp();
  if (!app) return { sent: 0, removed: 0 };
  try {
    const devices = await prisma.pushDevice.findMany({ where: { userId }, select: { token: true } });
    if (devices.length === 0) return { sent: 0, removed: 0 };
    const tokens = devices.map((d) => d.token);
    const data = { ...note.data, title: note.title, body: note.body, link: note.link, tag: note.tag };
    const message: MulticastMessage = {
      tokens,
      // Browsers: data only; our service worker (public/push-sw.js) shows it.
      data,
      // Android app: shown by the system when the app is in the background.
      android: { priority: "high", notification: { title: note.title, body: note.body, tag: note.tag, channelId: "chat" } },
      // iOS app, if there ever is one.
      apns: { payload: { aps: { alert: { title: note.title, body: note.body }, sound: "default", threadId: note.tag } } },
      webpush: { headers: { Urgency: "high", TTL: String(24 * 3600) } },
    };
    const res = await getMessaging(app).sendEachForMulticast(message);
    const dead = res.responses.flatMap((r, i) => (!r.success && r.error && DEAD.has(r.error.code) ? [tokens[i]] : []));
    if (dead.length) await prisma.pushDevice.deleteMany({ where: { token: { in: dead } } });
    return { sent: res.successCount, removed: dead.length };
  } catch (e) {
    logFirebaseError("push", e);
    return { sent: 0, removed: 0 };
  }
}
