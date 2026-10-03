"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

const WARN_MS = 5 * 60_000;
const TOUCH_EVERY_MS = 60_000;

/**
 * Admin auto-logout. Real activity (a click, a key, opening a page) restarts the
 * server's 30-minute idle clock, at most once a minute; background updates don't.
 * Five minutes before the end, a window offers "Stay logged in".
 */
export function SessionTimer() {
  const path = usePathname();
  const [endsAt, setEndsAt] = useState<{ at: number; hard: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastTouch = useRef(0);
  const warning = useRef(false);

  const apply = (d: { idleMs?: number; hardMs?: number }) => {
    if (typeof d.idleMs !== "number" || typeof d.hardMs !== "number") return;
    const hard = d.hardMs < d.idleMs;
    setEndsAt({ at: Date.now() + Math.min(d.idleMs, d.hardMs), hard });
  };

  const call = useCallback(async (method: "GET" | "POST") => {
    try {
      const res = await fetch("/api/admin/session", { method, cache: "no-store" });
      if (res.status === 401) return void window.location.assign("/admin/login?expired=1");
      if (res.ok) apply(await res.json());
    } catch {
      /* offline for a moment */
    }
  }, []);

  const touch = useCallback(() => {
    if (warning.current) return; // while the warning shows, only its button counts
    if (Date.now() - lastTouch.current < TOUCH_EVERY_MS) return;
    lastTouch.current = Date.now();
    void call("POST");
  }, [call]);

  // Opening a page is activity.
  useEffect(() => touch(), [path, touch]);

  useEffect(() => {
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    // Other tabs may have kept the session alive: re-read now and then.
    const poll = setInterval(() => void call("GET"), 60_000);
    const back = () => document.visibilityState === "visible" && void call("GET");
    document.addEventListener("visibilitychange", back);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", back);
    };
  }, [touch, call]);

  const left = endsAt ? endsAt.at - now : Infinity;
  const show = left <= WARN_MS;
  warning.current = show;

  useEffect(() => {
    if (left <= 0) window.location.assign("/admin/login?expired=1");
  }, [left]);

  if (!show || !endsAt) return null;
  const secs = Math.max(0, Math.ceil(left / 1000));
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="session-title">
      <div className="card w-full max-w-sm space-y-4 text-center">
        <span className="icon-tile tile-amber mx-auto size-12"><Clock className="size-6" aria-hidden /></span>
        <div>
          <h2 id="session-title" className="h2">{endsAt.hard ? "Your session is ending" : "Still there?"}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {endsAt.hard ? "Sessions last 12 hours. You'll need to sign in again in" : "You'll be logged out for inactivity in"} <b className="font-mono text-slate-900">{mmss}</b>
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {!endsAt.hard && (
            <button
              type="button"
              autoFocus
              className="btn-primary"
              onClick={() => {
                lastTouch.current = Date.now();
                warning.current = false;
                void call("POST");
              }}
            >
              Stay logged in
            </button>
          )}
          <a href="/admin/login" className="btn-ghost text-sm" onClick={async (e) => {
            e.preventDefault();
            await fetch("/api/admin/auth/logout", { method: "POST" }).catch(() => undefined);
            window.location.assign("/admin/login");
          }}>
            Log out now
          </a>
        </div>
      </div>
    </div>
  );
}
