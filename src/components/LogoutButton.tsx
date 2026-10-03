"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function LogoutButton({ action, dark }: { action: string; dark?: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={`btn px-3 py-2 ${dark ? "text-slate-300 hover:bg-white/10 hover:text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}
      onClick={async () => {
        // This browser stops getting this person's notifications and chat updates.
        await import("@/lib/push").then((p) => p.disablePush(action.startsWith("/api/admin") ? "admin" : "user")).catch(() => undefined);
        await import("./chat/liveChat").then((l) => l.endLiveChat()).catch(() => undefined);
        const r = await fetch(action, { method: "POST" });
        const d = await r.json().catch(() => ({}));
        router.push(d.redirect ?? "/");
        router.refresh();
      }}
    >
      <LogOut className="size-4" aria-hidden />
      <span>Log out</span>
    </button>
  );
}
