"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { enablePush, pushAvailable, type Who } from "@/lib/push";

/** One slim line under the chat: "Get notified when …". Shown until answered or closed. */
export function PushPrompt({ who = "user" }: { who?: Who }) {
  const DISMISSED = `push-prompt-dismissed-${who}`;
  const [show, setShow] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = !!localStorage.getItem(DISMISSED);
    } catch {
      /* private mode */
    }
    if (dismissed || !("Notification" in window) || Notification.permission !== "default") return;
    let on = true;
    void pushAvailable(who).then((ok) => on && setShow(ok));
    return () => {
      on = false;
    };
  }, [who, DISMISSED]);
  const close = () => {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      /* private mode */
    }
    setShow(false);
  };
  if (note) return <p className="mb-2 text-center text-xs text-slate-500">{note}</p>;
  if (!show) return null;
  return (
    <p className="mb-2 flex items-center gap-2 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs text-brand-800 ring-1 ring-brand-200 ring-inset">
      <BellRing className="size-3.5 shrink-0" aria-hidden />
      <span className="flex-1">{who === "user" ? "Get notified when we reply" : "Get notified when customers write"}</span>
      <button
        type="button"
        className="font-semibold underline"
        onClick={async () => {
          const r = await enablePush(who);
          setShow(false);
          setNote(r === "on" ? "Notifications on." : r === "denied" ? "Notifications blocked in your browser settings." : null);
          if (r !== "on") close();
        }}
      >
        Turn on
      </button>
      <button type="button" onClick={close} aria-label="Not now" className="text-brand-700/70 hover:text-brand-900"><X className="size-3.5" /></button>
    </p>
  );
}
