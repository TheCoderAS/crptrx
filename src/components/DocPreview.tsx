"use client";

import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, FileText, Loader2 } from "lucide-react";
import { Modal } from "./Modal";

type Doc = { label: string; href: string };
type Shown = { index: number; url: string | null; pdf: boolean; error: string | null };

/**
 * Buttons that open private documents inside the app (no new tab). Each opening
 * asks the server for a fresh 5-minute link, so every view is logged.
 */
export function DocPreview({ docs }: { docs: Doc[] }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const close = useCallback(() => setShown(null), []);

  async function open(index: number) {
    setShown({ index, url: null, pdf: false, error: null });
    try {
      const res = await fetch(docs[index].href + (docs[index].href.includes("?") ? "&" : "?") + "format=json");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.url !== "string") throw new Error(data.error ?? "Couldn't open this file.");
      const key = new URL(data.url, location.href).searchParams.get("key") ?? "";
      setShown({ index, url: data.url, pdf: key.endsWith(".pdf"), error: null });
    } catch (e) {
      setShown({ index, url: null, pdf: false, error: (e as Error).message });
    }
  }

  const doc = shown ? docs[shown.index] : null;
  return (
    <>
      <div className="space-y-2">
        {docs.map((d, i) => (
          <button key={d.href} type="button" onClick={() => open(i)} className="btn-secondary w-full justify-between">
            <span className="flex items-center gap-2"><FileText className="size-4 text-slate-400" aria-hidden /> {d.label}</span>
            <Eye className="size-4 text-slate-400" aria-hidden />
          </button>
        ))}
      </div>
      <Modal open={!!shown} onClose={close} title={doc?.label} description="Private link, valid for 5 minutes. This view is logged." wide>
        <div className="grid min-h-[50vh] place-items-center overflow-hidden rounded-xl bg-slate-100">
          {shown?.error ? (
            <p className="p-6 text-sm text-rose-700" role="alert">{shown.error}</p>
          ) : !shown?.url ? (
            <Loader2 className="size-6 animate-spin text-slate-400" aria-label="Loading" />
          ) : shown.pdf ? (
            <iframe src={shown.url} title={doc?.label} className="h-[70vh] w-full bg-white" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown.url} alt={doc?.label ?? ""} className="max-h-[70vh] w-auto object-contain" />
          )}
        </div>
        {docs.length > 1 && shown && (
          <div className="mt-3 flex items-center justify-between">
            <button type="button" className="btn-ghost" disabled={shown.index === 0} onClick={() => open(shown.index - 1)}><ChevronLeft className="size-4" aria-hidden /> Previous</button>
            <span className="text-xs text-slate-500">{shown.index + 1} of {docs.length}</span>
            <button type="button" className="btn-ghost" disabled={shown.index === docs.length - 1} onClick={() => open(shown.index + 1)}>Next <ChevronRight className="size-4" aria-hidden /></button>
          </div>
        )}
      </Modal>
    </>
  );
}
