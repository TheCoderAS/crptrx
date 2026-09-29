"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header links for logged-out visitors; the login page offers "Sign up" instead. */
export function GuestNav() {
  const path = usePathname();
  return (
    <div className="flex items-center gap-2">
      <Link href="/help" className={`btn-ghost ${path === "/help" ? "bg-slate-100 text-slate-900" : ""}`}>Help</Link>
      {path === "/login" ? <Link href="/signup" className="btn-primary">Sign up</Link> : <Link href="/login" className="btn-primary">Log in</Link>}
    </div>
  );
}
