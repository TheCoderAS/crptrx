"use client";
import { useState } from "react";
import { AlertCircle, FileCheck2, Loader2, UploadCloud } from "lucide-react";
import { fitUpload, kb, replaceInputFile } from "@/lib/shrinkImage";

type Picked = { name: string; url: string | null; size: number; shrunkFrom?: number };

/** Tap-to-upload tile with a preview (images) or file name (PDF). Photos are shrunk to fit 200 KB. */
export function FileTile({ name, label, hint, required, keptNote }: { name: string; label: string; hint?: string; required?: boolean; keptNote?: string }) {
  const [file, setFile] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <label
      htmlFor={name}
      className={`group relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed p-4 text-center transition focus-within:ring-2 focus-within:ring-brand-600 ${error ? "border-rose-300 bg-rose-50/50" : file ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40"}`}
    >
      <input
        id={name}
        name={name}
        type="file"
        accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
        required={required}
        className="sr-only"
        onChange={async (e) => {
          const input = e.currentTarget;
          const picked = input.files?.[0];
          setError(null);
          input.setCustomValidity("");
          if (!picked) return setFile(null);
          setBusy(true);
          const r = await fitUpload(picked);
          setBusy(false);
          if ("error" in r) {
            input.value = "";
            setFile(null);
            setError(r.error);
            return;
          }
          if (r.shrunk) replaceInputFile(input, r.file);
          setFile({ name: r.file.name, size: r.file.size, url: r.file.type.startsWith("image/") ? URL.createObjectURL(r.file) : null, shrunkFrom: r.shrunk ? picked.size : undefined });
        }}
      />
      {busy ? (
        <Loader2 className="size-7 animate-spin text-brand-600" aria-hidden />
      ) : file?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt="" className="h-20 w-full rounded-lg object-cover" />
      ) : file ? (
        <FileCheck2 className="size-7 text-emerald-600" aria-hidden />
      ) : error ? (
        <AlertCircle className="size-7 text-rose-600" aria-hidden />
      ) : (
        <UploadCloud className="size-7 text-slate-400 transition group-hover:text-brand-600" aria-hidden />
      )}
      <span className="text-sm font-medium text-slate-900">{label}</span>
      <span className={`max-w-full text-xs ${error ? "text-rose-700" : "truncate text-slate-500"}`} role={error ? "alert" : undefined}>
        {busy
          ? "Preparing…"
          : error
            ? error
            : file
              ? `${file.name} · ${kb(file.size)}${file.shrunkFrom ? ` (reduced from ${kb(file.shrunkFrom)})` : ""}`
              : keptNote ?? hint ?? "JPG, PNG or PDF, max 200 KB. Big photos are reduced for you."}
      </span>
    </label>
  );
}
