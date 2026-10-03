"use client";

// Browser push for customers (Firebase Cloud Messaging). The browser's own
// "Allow notifications?" question is asked only when the customer taps "Turn on".

const SW = "/push-sw.js";
const KEY = "push-token";
const SYNC_KEY = "push-synced";

type Cfg = { enabled: boolean; config?: Record<string, string>; vapidKey?: string };

export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode */
    }
  },
};

async function messaging(cfg: Cfg) {
  const [{ initializeApp, getApps }, m] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
  if (!(await m.isSupported())) return null;
  const app = getApps().find((a) => a.name === "push") ?? initializeApp(cfg.config!, "push");
  return { m, msg: m.getMessaging(app) };
}

async function register(): Promise<"on" | "unavailable" | "denied"> {
  const cfg = (await (await fetch("/api/me/push")).json()) as Cfg;
  if (!cfg.enabled || !cfg.config || !cfg.vapidKey) return "unavailable";
  const fm = await messaging(cfg);
  if (!fm) return "unavailable";
  const reg = await navigator.serviceWorker.register(SW);
  const token = await fm.m.getToken(fm.msg, { vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
  if (!token) return "denied";
  const res = await fetch("/api/me/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, platform: "WEB" }) });
  if (!res.ok) return "unavailable";
  store.set(KEY, token);
  store.set(SYNC_KEY, String(Date.now()));
  return "on";
}

/** Ask permission (must come from a tap) and sign this browser up. */
export async function enablePush(): Promise<"on" | "unavailable" | "denied"> {
  if (!pushSupported()) return "unavailable";
  const p = await Notification.requestPermission();
  if (p !== "granted") return "denied";
  return register().catch(() => "unavailable" as const);
}

/** Already allowed: refresh the sign-up once a day (browsers change tokens now and then). */
export async function syncPush() {
  if (!pushSupported() || Notification.permission !== "granted") return;
  if (Date.now() - Number(store.get(SYNC_KEY) ?? 0) < 24 * 3600_000) return;
  await register().catch(() => undefined);
}

/** On log out: this browser stops getting the customer's notifications. */
export async function disablePush() {
  const token = store.get(KEY);
  if (!token) return;
  store.set(KEY, null);
  store.set(SYNC_KEY, null);
  await fetch("/api/me/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => undefined);
}
