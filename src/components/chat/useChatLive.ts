"use client";

import { useEffect, useRef, useState } from "react";
import { liveChat } from "./liveChat";

type Side = "USER" | "ADMIN";
type Signal = { at: number; by: Side; kind: "message" | "read" | "thread" };

/**
 * Calls `onChange` whenever this order's chat changes: instantly through
 * Firebase, or by checking every few seconds when Firebase isn't set up.
 * Also carries the "typing…" mark both ways.
 */
export function useChatLive({ side, ownerId, orderId, fast, onChange }: { side: Side; ownerId: string | null; orderId: string; fast: boolean; onChange: () => void }) {
  const [live, setLive] = useState<boolean | null>(null); // null: still connecting
  const [typing, setTyping] = useState(false);
  const cb = useRef(onChange);
  cb.current = onChange;
  const sendTyping = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!ownerId) return;
    let stopped = false;
    const offs: (() => void)[] = [];
    const base = `chat/u/${ownerId}/${orderId}`;
    void liveChat(side).then(async (l) => {
      if (stopped) return;
      if (!l) return setLive(false);
      const { ref, onValue, set, serverTimestamp } = await import("firebase/database");
      if (stopped) return;
      let first = true;
      offs.push(
        onValue(
          ref(l.db, `${base}/sig`),
          (snap) => {
            const s = snap.val() as Signal | null;
            // The first answer is the current state, already loaded.
            if (first) return void (first = false);
            // Our own "read" needs nothing new.
            if (s && s.by === side && s.kind === "read") return;
            cb.current();
          },
          () => setLive(false),
        ),
      );
      let offset = 0;
      offs.push(onValue(ref(l.db, ".info/serverTimeOffset"), (snap) => void (offset = Number(snap.val()) || 0)));
      let hide: ReturnType<typeof setTimeout> | undefined;
      offs.push(
        onValue(ref(l.db, `${base}/typing/${side === "USER" ? "admin" : "user"}`), (snap) => {
          const t = Number(snap.val());
          clearTimeout(hide);
          const fresh = t && Date.now() + offset - t < 5000;
          setTyping(!!fresh);
          if (fresh) hide = setTimeout(() => setTyping(false), 4000);
        }),
      );
      offs.push(() => clearTimeout(hide));
      sendTyping.current = () => void set(ref(l.db, `${base}/typing/${side === "USER" ? "user" : "admin"}`), serverTimestamp()).catch(() => undefined);
      setLive(true);
    });
    return () => {
      stopped = true;
      offs.forEach((f) => f());
      sendTyping.current = () => undefined;
    };
  }, [side, ownerId, orderId]);

  // No Firebase: check now and then while the page is in front (more often while the chat is open).
  useEffect(() => {
    if (live !== false) return;
    const t = setInterval(() => document.visibilityState === "visible" && cb.current(), fast ? 4000 : 20000);
    const back = () => document.visibilityState === "visible" && cb.current();
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", back);
    };
  }, [live, fast]);

  return { live: live === true, typing, sendTyping: () => sendTyping.current() };
}
