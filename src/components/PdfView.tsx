"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

const MAX_PAGES = 10;

/**
 * Draws a PDF's pages inside the app with PDF.js. Phones (Chrome on Android)
 * can't show a PDF in a frame, so the browser's own viewer isn't used.
 * PDF.js loads only when a PDF is opened.
 */
export function PdfView({ url, title }: { url: string; title?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ loading: boolean; error: string | null; pages: number; shown: number }>({ loading: true, error: null, pages: 0, shown: 0 });

  useEffect(() => {
    let cancelled = false;
    const el = box.current;
    if (!el) return;
    el.replaceChildren();
    setState({ loading: true, error: null, pages: 0, shown: 0 });
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const data = new Uint8Array(await res.arrayBuffer());
        const doc = await pdfjs.getDocument({ data }).promise;
        const count = Math.min(doc.numPages, MAX_PAGES);
        const width = el.clientWidth || 600;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        for (let n = 1; n <= count && !cancelled; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.className = "mb-3 block rounded-lg bg-white shadow-sm";
          canvas.setAttribute("aria-label", `${title ?? "Document"}, page ${n}`);
          el.appendChild(canvas);
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
          if (!cancelled) setState({ loading: false, error: null, pages: doc.numPages, shown: n });
        }
        void doc.destroy();
      } catch {
        if (!cancelled) setState({ loading: false, error: "Couldn't show this PDF.", pages: 0, shown: 0 });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, title]);

  return (
    <div className="max-h-[70vh] w-full overflow-y-auto p-2">
      <div ref={box} />
      {state.loading && <div className="grid h-[50vh] place-items-center"><Loader2 className="size-6 animate-spin text-slate-400" aria-label="Loading" /></div>}
      {state.error && <p className="p-6 text-center text-sm text-rose-700" role="alert">{state.error}</p>}
      {state.pages > MAX_PAGES && state.shown === MAX_PAGES && <p className="pb-2 text-center text-xs text-slate-500">Showing the first {MAX_PAGES} of {state.pages} pages.</p>}
    </div>
  );
}
