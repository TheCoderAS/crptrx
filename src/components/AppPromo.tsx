"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { BellRing, Download, Zap } from "lucide-react";
import { Modal } from "./Modal";
import { inNativeApp } from "@/lib/nativeApp";
import icon from "@/assets/app-icon.png";

type Latest = { channel: "live" | "test"; versionName: string | null; url: string | null; size?: number };

const KEY = "app-promo-snoozed-at";
const SNOOZE_MS = 14 * 24 * 3600_000;

/**
 * "Get the Android app" pop-up for visitors on Android phones in a browser. Not inside the app,
 * not on the /app page, only when an app file is published, and once per 14 days after it's closed.
 */
export function AppPromo() {
  const path = usePathname();
  const [app, setApp] = useState<Latest | null>(null);

  useEffect(() => {
    if (inNativeApp() || /VisionPayApp\//.test(navigator.userAgent) || !/Android/i.test(navigator.userAgent)) return;
    if (path.startsWith("/app")) return;
    // Someone who opened an invite link signs up here first, so the code isn't lost in the app.
    if (new URLSearchParams(window.location.search).has("ref")) return;
    try {
      if (Date.now() - Number(localStorage.getItem(KEY) ?? 0) < SNOOZE_MS) return;
    } catch {
      return; // no storage: we couldn't remember a "Not now", so don't ask at all
    }
    let on = true;
    // A moment after the page settles, so it doesn't fight with the first paint.
    const t = setTimeout(() => {
      fetch("/api/app/latest")
        .then((r) => (r.ok ? (r.json() as Promise<Latest>) : null))
        .then((d) => on && d?.url && d.versionName && setApp(d))
        .catch(() => undefined);
    }, 1500);
    return () => {
      on = false;
      clearTimeout(t);
    };
    // Only on the first page of a visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snooze = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* private mode */
    }
    setApp(null);
  };

  if (!app?.url) return null;
  const name = app.channel === "test" ? "VisionPay Test" : "VisionPay";
  return (
    <Modal open onClose={snooze} title={`Get the ${name} app`} description="For Android phones. Free.">
      <div className="flex items-center gap-4">
        <Image src={icon} alt="" width={64} height={64} className="shrink-0 rounded-2xl shadow-md" />
        <ul className="space-y-1.5 text-sm text-slate-700">
          <li className="flex items-center gap-2"><Zap className="size-4 shrink-0 text-brand-600" aria-hidden /> Opens straight from your home screen</li>
          <li className="flex items-center gap-2"><BellRing className="size-4 shrink-0 text-brand-600" aria-hidden /> Alerts when support replies</li>
        </ul>
      </div>
      <a href={app.url} onClick={snooze} className="btn btn-lg bg-brand-gradient mt-5 w-full text-white hover:opacity-95" rel="nofollow">
        <Download className="size-5" aria-hidden /> Download app{app.size ? ` · ${(app.size / 1024 / 1024).toFixed(1)} MB` : ""}
      </a>
      <div className="mt-3 flex items-center justify-between text-sm">
        <a href="/app" onClick={snooze} className="font-medium text-brand-700 hover:underline">How to install</a>
        <button type="button" onClick={snooze} className="btn-ghost min-h-9 px-3 text-sm">Not now</button>
      </div>
    </Modal>
  );
}
