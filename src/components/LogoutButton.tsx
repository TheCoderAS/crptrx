"use client";
import { useRouter } from "next/navigation";

export function LogoutButton({ action }: { action: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-gray-500 hover:text-gray-900"
      onClick={async () => {
        const r = await fetch(action, { method: "POST" });
        const d = await r.json().catch(() => ({}));
        router.push(d.redirect ?? "/");
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
