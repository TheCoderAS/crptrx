"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function PasswordInput({ id, name = "password", autoComplete, minLength, placeholder }: { id: string; name?: string; autoComplete: string; minLength?: number; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} name={name} type={show ? "text" : "password"} required autoComplete={autoComplete} minLength={minLength} placeholder={placeholder} className="input pr-11" />
      <button type="button" onClick={() => setShow((v) => !v)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 hover:text-slate-700" aria-label={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}
