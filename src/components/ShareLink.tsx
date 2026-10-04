"use client";

import { Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { CopyButton } from "./CopyButton";

/** The invite link with Copy, the phone's Share sheet (where available) and WhatsApp. */
export function ShareLink({ url, text }: { url: string; text: string }) {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && !!navigator.share), []);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <code className="input flex-1 truncate bg-slate-50 py-2 font-mono text-sm">{url}</code>
        <CopyButton text={url} label="Copy link" />
      </div>
      <div className="flex flex-wrap gap-2">
        {canShare && (
          <button type="button" className="btn-primary" onClick={() => navigator.share({ title: "Invite", text, url }).catch(() => undefined)}>
            <Share2 className="size-4" aria-hidden /> Share
          </button>
        )}
        <a className="btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      </div>
    </div>
  );
}
