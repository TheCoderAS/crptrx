"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useChatSocket } from "./useChatSocket";

/** Re-renders the support inbox the moment any chat changes. */
export function InboxLive() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refresh = () => {
    // A burst of events (message + read) becomes one refresh.
    clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 300);
  };
  useChatSocket("inbox=1", refresh, refresh);
  return null;
}
