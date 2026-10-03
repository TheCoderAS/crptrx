"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "./Select";
import { useRef, type ReactNode } from "react";
import { ArrowDownUp, Search, X } from "lucide-react";

export type SortOption = { value: string; label: string };

/**
 * Search box + sort menu for a list page. Both live in the URL (?q=…&sort=…),
 * so results survive a refresh and can be shared. Other query params (tab,
 * status…) are kept; the page number resets.
 */
export function ListToolbar({ placeholder, sorts = [], defaultSort = "", children }: { placeholder: string; sorts?: SortOption[]; defaultSort?: string; children?: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);
  const q = params.get("q") ?? "";
  const sort = sorts.some((s) => s.value === params.get("sort")) ? params.get("sort")! : defaultSort;

  const go = (next: { q?: string; sort?: string }) => {
    const p = new URLSearchParams(params.toString());
    p.delete("page");
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined) continue;
      if (!v || (k === "sort" && v === defaultSort)) p.delete(k);
      else p.set(k, v);
    }
    const s = p.toString();
    router.push(s ? `${path}?${s}` : path);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        role="search"
        className="relative min-w-0 flex-1 basis-56"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: input.current?.value.trim() ?? "" });
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input ref={input} key={q} name="q" type="search" defaultValue={q} aria-label={placeholder} placeholder={placeholder} className="input pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden" />
        {q && (
          <button type="button" onClick={() => go({ q: "" })} className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Clear search">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </form>
      {sorts.length > 0 && <Select
        aria-label="Sort"
        value={sort}
        onChange={(v) => go({ sort: v })}
        options={sorts}
        icon={<ArrowDownUp className="size-4" aria-hidden />}
        className="w-52 max-w-full text-sm font-medium"
      />}
      {children}
    </div>
  );
}
