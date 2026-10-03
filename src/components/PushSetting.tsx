"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { disablePush, enablePush, pushOnHere, pushSupported, type Who } from "@/lib/push";

type State = "loading" | "on" | "off" | "blocked" | "unsupported";
const DETAIL: Record<State, string> = {
  loading: "…",
  on: "On for this device",
  off: "Off for this device",
  blocked: "Blocked in your browser settings",
  unsupported: "Not available in this browser",
};

function usePush(who: Who) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!pushSupported()) return setState("unsupported");
    setState(Notification.permission === "denied" ? "blocked" : pushOnHere(who) ? "on" : "off");
  }, [who]);
  async function toggle() {
    setBusy(true);
    if (state === "on") {
      await disablePush(who);
      setState("off");
    } else {
      const r = await enablePush(who);
      setState(r === "on" ? "on" : r === "denied" ? "blocked" : "unsupported");
    }
    setBusy(false);
  }
  return { state, busy, toggle };
}

/** Account row: support-reply notifications on this phone or computer. */
export function PushSetting() {
  const { state, busy, toggle } = usePush("user");
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

/** Admin sidebar: a bell that turns "customer wrote" alerts on or off for this browser. */
export function AdminPushToggle() {
  const { state, busy, toggle } = usePush("admin");
  if (state === "loading" || state === "unsupported") return null;
  const label = state === "on" ? "Customer message alerts: on (tap to turn off)" : state === "off" ? "Turn on customer message alerts" : "Alerts are blocked in this browser's settings";
  return (
    <button
      type="button"
      disabled={busy || state === "blocked"}
      onClick={() => void toggle()}
      title={label}
      aria-label={label}
      className={`grid size-9 place-items-center rounded-lg transition hover:bg-white/10 disabled:opacity-50 ${state === "on" ? "text-emerald-300" : "text-slate-400 hover:text-white"}`}
    >
      {state === "on" ? <BellRing className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
    </button>
  );
}
