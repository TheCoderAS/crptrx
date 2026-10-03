"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { disablePush, enablePush, pushOnHere, pushSupported } from "@/lib/push";

type State = "loading" | "on" | "off" | "blocked" | "unsupported";
const DETAIL: Record<State, string> = {
  loading: "…",
  on: "On for this device",
  off: "Off for this device",
  blocked: "Blocked in your browser settings",
  unsupported: "Not available in this browser",
};

/** Account row: support-reply notifications on this phone or computer. */
export function PushSetting() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!pushSupported()) return setState("unsupported");
    setState(Notification.permission === "denied" ? "blocked" : pushOnHere() ? "on" : "off");
  }, []);
  async function toggle() {
    setBusy(true);
    if (state === "on") {
      await disablePush();
      setState("off");
    } else {
      const r = await enablePush();
      setState(r === "on" ? "on" : r === "denied" ? "blocked" : "unsupported");
    }
    setBusy(false);
  }
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500"><Bell className="size-4" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-900">Support reply alerts</span>
        <span className="block truncate text-xs text-slate-500">{DETAIL[state]}</span>
      </span>
      {(state === "on" || state === "off") && (
        <button type="button" disabled={busy} onClick={() => void toggle()} className="btn-ghost min-h-9 px-3 text-sm">
          {state === "on" ? "Turn off" : "Turn on"}
        </button>
      )}
    </div>
  );
}
