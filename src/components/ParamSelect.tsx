"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Select, type SelectOption } from "./Select";

/** A dropdown that sets one URL parameter (e.g. ?type=…); the page number resets. */
export function ParamSelect({ name, options, label, icon, className }: { name: string; options: SelectOption[]; label: string; icon?: ReactNode; className?: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const value = params.get(name) ?? "";
  return (
    <Select
      aria-label={label}
      value={options.some((o) => o.value === value) ? value : ""}
      onChange={(v) => {
        const p = new URLSearchParams(params.toString());
        p.delete("page");
        if (v) p.set(name, v);
        else p.delete(name);
        const s = p.toString();
        router.push(s ? `${path}?${s}` : path);
      }}
      options={options}
      icon={icon}
      className={className}
    />
  );
}
