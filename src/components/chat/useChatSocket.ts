"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Live connection to /ws. Reconnects by itself (1 s, 2 s, 4 s … up to 15 s) and
 * calls onReconnect after a drop, so the caller can fetch anything it missed.
 */
export function useChatSocket(query: string | null, onEvent: (e: Record<string, unknown>) => void, onReconnect?: () => void) {
  const [live, setLive] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const handlers = useRef({ onEvent, onReconnect });
  handlers.current = { onEvent, onReconnect };

  useEffect(() => {
    if (!query) return;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?${query}`);
      socket.current = ws;
      ws.onopen = () => {
        if (attempt > 0) handlers.current.onReconnect?.();
        attempt = 0;
        setLive(true);
      };
      ws.onmessage = (m) => {
        try {
          handlers.current.onEvent(JSON.parse(String(m.data)));
        } catch {
          /* ignore bad frames */
        }
      };
      ws.onclose = () => {
        setLive(false);
        socket.current = null;
        if (stopped) return;
        attempt++;
        timer = setTimeout(open, Math.min(15_000, 1000 * 2 ** (attempt - 1)));
      };
    };
    open();
    // Phones drop sockets while asleep: reconnect at once when the tab is back.
    const wake = () => {
      if (document.visibilityState === "visible" && !socket.current && !stopped) {
        clearTimeout(timer);
        open();
      }
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      socket.current?.close();
    };
  }, [query]);

  const send = (data: Record<string, unknown>) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(data));
  };
  return { live, send };
}
