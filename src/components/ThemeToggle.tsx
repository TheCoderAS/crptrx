"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Pref = "light" | "dark" | "system";
const NEXT: Record<Pref, Pref> = { light: "dark", dark: "system", system: "light" };
const LABEL: Record<Pref, string> = { light: "Light theme", dark: "Dark theme", system: "Theme follows your device" };

/** Applied before the first paint (see THEME_SCRIPT) and whenever the choice or the device setting changes. */
function apply(pref: Pref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("theme")||"system";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;

export function ThemeToggle({ dark: onDark }: { dark?: boolean }) {
  const [pref, setPref] = useState<Pref>("system");
  useEffect(() => {
    let p: Pref = "system";
    try {
      p = (localStorage.getItem("theme") as Pref) || "system";
    } catch {
      /* storage blocked: follow the device */
    }
    setPref(p);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let cur: Pref = "system";
      try {
        cur = (localStorage.getItem("theme") as Pref) || "system";
      } catch {}
      if (cur === "system") apply("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const Icon = pref === "light" ? Sun : pref === "dark" ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={() => {
        const next = NEXT[pref];
        setPref(next);
        try {
          localStorage.setItem("theme", next);
        } catch {}
        apply(next);
      }}
      className={`grid size-9 place-items-center rounded-lg transition ${onDark ? "text-slate-400 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}
      aria-label={`${LABEL[pref]}. Click to change.`}
      title={LABEL[pref]}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}
