"use client";
import { useState } from "react";
import { FileCheck2, UploadCloud } from "lucide-react";

/** Tap-to-upload tile with a preview (images) or file name (PDF). */
export function FileTile({ name, label, hint, required, keptNote }: { name: string; label: string; hint?: string; required?: boolean; keptNote?: string }) {
  const [file, setFile] = useState<{ name: string; url: string | null; size: number } | null>(null);
  return (
    <label htmlFor={name} className={`group relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed p-4 text-center transition focus-within:ring-2 focus-within:ring-brand-600 ${file ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 bg-slate-50 hover:border-brand-400 hover:bg-brand-50/40"}`}>
      <input
        id={name}
        name={name}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        required={required}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          setFile(f ? { name: f.name, size: f.size, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null } : null);
        }}
      />
      {file?.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt="" className="h-20 w-full rounded-lg object-cover" />
      ) : file ? (
        <FileCheck2 className="size-7 text-emerald-600" aria-hidden />
      ) : (
        <UploadCloud className="size-7 text-slate-400 transition group-hover:text-brand-600" aria-hidden />
      )}
      <span className="text-sm font-medium text-slate-900">{label}</span>
      <span className="max-w-full truncate text-xs text-slate-500">
        {file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB${file.size > 5 * 1024 * 1024 ? " (too big, max 5 MB)" : ""}` : keptNote ?? hint ?? "JPG, PNG or PDF, max 5 MB"}
      </span>
    </label>
  );
}
