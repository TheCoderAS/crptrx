"use client";

import { useEffect } from "react";
import { syncPush } from "@/lib/push";

/** Keeps this browser's push sign-up fresh for a signed-in customer who allowed notifications. */
export function PushSync() {
  useEffect(() => {
    void syncPush();
  }, []);
  return null;
}
