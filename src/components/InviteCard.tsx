"use client";

import { Check, Copy, Link2, MessageCircle, Share2, Users } from "lucide-react";
import { useState } from "react";
import { inNativeApp, nativeCall } from "@/lib/nativeApp";
import { toastOk } from "./Toaster";

/**
 * The user's invite code with one big Share button: the phone's share menu in the app and
 * on phones that have it, otherwise the link is copied. WhatsApp and Copy link sit below.
 */
export function InviteCard({ code, url, text, joined, sold }: { code: string; url: string; text: string; joined: number; sold: number }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const copy = async (what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "code" ? code : url);
    } catch {
      /* clipboard blocked: the code is on screen to copy by hand */
    }
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };

  const share = async () => {
    if (inNativeApp()) {
      type R = { ok?: boolean; error?: string };
      const r: R = await nativeCall<R>("share", { title: "Invite", text, url }).catch(() => ({ error: "unavailable" }));
      if (r.ok) return; // older app versions answer "unknown": the link is copied instead
    } else if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Invite", text, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // closed the share sheet
      }
    }
    await copy("link");
    toastOk("Invite link copied. Paste it in any chat.");
  };

  return (
    <section className="card space-y-4">
      <div>
        <p className="text-xs font-medium text-slate-500">Your invite code</p>
        <button
          type="button"
          onClick={() => copy("code")}
          className="mt-1.5 flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100"
          aria-label={`Copy code ${code}`}
        >
          <span className="font-mono text-2xl font-bold tracking-[0.2em] text-slate-900">{code}</span>
          <span className={`flex shrink-0 items-center gap-1 text-xs font-medium ${copied === "code" ? "text-emerald-600" : "text-slate-500"}`}>
            {copied === "code" ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied === "code" ? "Copied" : "Copy"}
          </span>
        </button>
      </div>

      <button type="button" onClick={share} className="btn-primary w-full py-3">
        <Share2 className="size-4" aria-hidden /> Share invite link
      </button>

      <div className="grid grid-cols-2 gap-2">
        <a className="btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="size-4 text-emerald-600" aria-hidden /> WhatsApp
        </a>
        <button type="button" className="btn-secondary" onClick={() => copy("link")}>
          {copied === "link" ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
      </div>

      <p className="flex items-center justify-center gap-1.5 border-t border-slate-100 pt-3 text-sm text-slate-500">
        <Users className="size-4" aria-hidden /> {joined} {joined === 1 ? "friend" : "friends"} joined · {sold} sold
      </p>
    </section>
  );
}
