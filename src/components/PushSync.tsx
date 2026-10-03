"use client";

import { useEffect } from "react";
import { syncPush, type Who } from "@/lib/push";

/** Keeps this browser's push sign-up fresh for someone signed in who allowed notifications. */
export function PushSync({ who = "user" }: { who?: Who }) {
  useEffect(() => {
    void syncPush(who);
  }, [who]);
  return null;
}
