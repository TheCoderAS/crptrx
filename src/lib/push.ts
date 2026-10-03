"use client";

// Browser push (Firebase Cloud Messaging) for customers and for support staff.
// The browser's own "Allow notifications?" question is asked only after a tap.
// One browser can be signed up as both (same device token, separate lists).

export type Who = "user" | "admin";

const SW = "/push-sw.js";
const api = (who: Who) => (who === "admin" ? "/api/admin/push" : "/api/me/push");
const keys = (who: Who) => ({ token: `push-token-${who}`, synced: `push-synced-${who}` });

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

// Sign-ups saved before admins had push used these names (customers only).
try {
  const old = typeof localStorage !== "undefined" ? localStorage.getItem("push-token") : null;
  if (old) {
    localStorage.setItem("push-token-user", old);
    localStorage.setItem("push-synced-user", localStorage.getItem("push-synced") ?? "0");
    localStorage.removeItem("push-token");
    localStorage.removeItem("push-synced");
  }
} catch {
  /* private mode */
}

const cfgCache: Partial<Record<Who, Promise<Cfg>>> = {};
const loadCfg = (who: Who) =>
  (cfgCache[who] ??= fetch(api(who))
    .then((r) => (r.ok ? r.json() : { enabled: false }))
    .catch(() => ({ enabled: false })));

/** Push is set up on the server and this browser can do it. */
export async function pushAvailable(who: Who = "user"): Promise<boolean> {
  return pushSupported() && !!(await loadCfg(who)).enabled;
}

/** This browser is signed up (and still allowed). */
export const pushOnHere = (who: Who = "user") => pushSupported() && Notification.permission === "granted" && !!store.get(keys(who).token);

async function messaging(cfg: Cfg) {
  const [{ initializeApp, getApps }, m] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
  if (!(await m.isSupported())) return null;
  const app = getApps().find((a) => a.name === "push") ?? initializeApp(cfg.config!, "push");
  return { m, msg: m.getMessaging(app) };
}

async function register(who: Who): Promise<"on" | "unavailable" | "denied"> {
  const cfg = await loadCfg(who);
  if (!cfg.enabled || !cfg.config || !cfg.vapidKey) return "unavailable";
  const fm = await messaging(cfg);
  if (!fm) return "unavailable";
  const reg = await navigator.serviceWorker.register(SW);
  const token = await fm.m.getToken(fm.msg, { vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
  if (!token) return "denied";
  const res = await fetch(api(who), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, platform: "WEB" }) });
  if (!res.ok) return "unavailable";
  store.set(keys(who).token, token);
  store.set(keys(who).synced, String(Date.now()));
  return "on";
}

/** Ask permission (must come from a tap) and sign this browser up. */
export async function enablePush(who: Who = "user"): Promise<"on" | "unavailable" | "denied"> {
  if (!(await pushAvailable(who))) return "unavailable";
  const p = await Notification.requestPermission();
  if (p !== "granted") return "denied";
  return register(who).catch(() => "unavailable" as const);
}

/** Already signed up here: refresh it once a day (browsers change tokens now and then). */
export async function syncPush(who: Who = "user") {
  if (!pushSupported() || Notification.permission !== "granted" || !store.get(keys(who).token)) return;
  if (Date.now() - Number(store.get(keys(who).synced) ?? 0) < 24 * 3600_000) return;
  await register(who).catch(() => undefined);
}

/** Turned off, or logging out: this browser stops getting these notifications. */
export async function disablePush(who: Who = "user") {
  const token = store.get(keys(who).token);
  if (!token) return;
  store.set(keys(who).token, null);
  store.set(keys(who).synced, null);
  await fetch(api(who), { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => undefined);
}
