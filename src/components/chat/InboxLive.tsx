"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { liveChat } from "./liveChat";

/**
 * Re-renders the support inbox the moment any chat changes. Without Firebase
 * the admin pages' regular 20-second check keeps it current instead.
 */
export function InboxLive() {
  const router = useRouter();
  useEffect(() => {
    let off: (() => void) | undefined;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void liveChat("ADMIN").then(async (l) => {
      if (!l || stopped) return;
      const { ref, onValue } = await import("firebase/database");
      if (stopped) return;
      let first = true;
      off = onValue(ref(l.db, "chat/inbox"), () => {
        if (first) return void (first = false);
        // A burst of changes (message + read) becomes one refresh.
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 300);
      });
    });
    return () => {
      stopped = true;
      off?.();
      clearTimeout(timer);
    };
  }, [router]);
  return null;
}
