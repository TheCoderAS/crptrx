"use client";

// The VisionPay Android app shows this website in a WebView and adds a small
// bridge object, window.VisionPayApp. Things a WebView can't do on its own
// (Google sign-in, push notifications) go through it; everything else is the
// normal website. On the web the bridge is absent and these helpers say so.

type Bridge = {
  /** JSON: { version, versionCode, channel, push: "granted" | "denied" | "default", pushReady } */
  info(): string;
  /** Starts a native task; the app answers with window.__vpResolve(id, result). */
  call(method: string, id: number, args: string): void;
};

export type NativeInfo = { version: string; versionCode: number; channel: "live" | "test"; push: "granted" | "denied" | "default"; pushReady: boolean };

declare global {
  interface Window {
    VisionPayApp?: Bridge;
    __vpResolve?: (id: number, result: unknown) => void;
  }
}

const bridge = (): Bridge | null => (typeof window !== "undefined" && window.VisionPayApp ? window.VisionPayApp : null);

/** True inside the Android app. */
export const inNativeApp = () => !!bridge();

export function nativeInfo(): NativeInfo | null {
  const b = bridge();
  if (!b) return null;
  try {
    return JSON.parse(b.info()) as NativeInfo;
  } catch {
    return null;
  }
}

let seq = 0;
const pending = new Map<number, (v: unknown) => void>();

/** Ask the app to do something native. Resolves with the app's answer; rejects outside the app. */
export function nativeCall<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const b = bridge();
  if (!b) return Promise.reject(new Error("Not in the app"));
  window.__vpResolve ??= (id, result) => {
    const done = pending.get(id);
    pending.delete(id);
    done?.(result);
  };
  return new Promise<T>((resolve) => {
    const id = ++seq;
    pending.set(id, resolve as (v: unknown) => void);
    b.call(method, id, JSON.stringify(args));
  });
}
