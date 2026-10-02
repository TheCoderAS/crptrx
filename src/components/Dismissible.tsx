"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/**
 * Wraps a notice with an × that hides it on this browser. Remembered by `id`, or
 * by the notice's own text, so a notice with new wording shows again.
 */
export function Dismissible({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState<string | null>(id ? `dismissed:${id}` : null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const k = id ? `dismissed:${id}` : `dismissed:t:${hash(box.current?.textContent ?? "")}`;
    setKey(k);
    try {
      if (localStorage.getItem(k)) setHidden(true);
    } catch {
      /* storage blocked: keep showing it */
    }
  }, [id]);
  if (hidden) return null;
  return (
    <div ref={box} className={`relative [&>*:first-child]:pr-11 ${className}`}>
      {children}
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-lg opacity-60 hover:bg-black/10 hover:opacity-100"
        onClick={() => {
          setHidden(true);
          try {
            if (key) localStorage.setItem(key, "1");
          } catch {
            /* ignore */
          }
        }}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
