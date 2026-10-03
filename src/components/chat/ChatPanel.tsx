"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CheckCheck, ImagePlus, Loader2, SendHorizontal, X } from "lucide-react";
import { fitUpload } from "@/lib/shrinkImage";
import { useChatLive } from "./useChatLive";
import { PushPrompt } from "./PushPrompt";

type Side = "USER" | "ADMIN";
interface Msg {
  id: string;
  from: Side;
  name: string;
  text: string;
  attachment: boolean;
  at: string;
}

const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
const day = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const when = (iso: string) => {
  const d = new Date(iso);
  return day.format(d) === day.format(new Date()) ? time.format(d) : `${day.format(d)}, ${time.format(d)}`;
};

/**
 * Live support chat for one order, used by the customer (side = USER) and by
 * support (side = ADMIN). Messages are sent and loaded over our API; Firebase
 * only says "something changed" (see useChatLive). Stays mounted while hidden so
 * unread replies are counted live.
 */
export function ChatPanel({ orderId, side, visible, onUnread, header, empty }: { orderId: string; side: Side; visible: boolean; onUnread?: (n: number) => void; header?: (s: { live: boolean; status: "OPEN" | "RESOLVED"; count: number }) => ReactNode; empty?: ReactNode }) {
  const base = side === "USER" ? `/api/orders/${orderId}/chat` : `/api/admin/orders/${orderId}/chat`;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [status, setStatus] = useState<"OPEN" | "RESOLVED">("OPEN");
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const lastTypingSent = useRef(0);
  const readBusy = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(base, { cache: "no-store" });
    if (!res.ok) return;
    const d = (await res.json()) as { messages: Msg[]; status: "OPEN" | "RESOLVED"; otherReadAt: string | null; unread: number; ownerId: string };
    setMessages(d.messages);
    setStatus(d.status);
    setOtherReadAt(d.otherReadAt);
    setUnread(d.unread);
    setOwnerId(d.ownerId);
    setLoaded(true);
  }, [base]);

  const { live, typing, sendTyping } = useChatLive({ side, ownerId, orderId, fast: visible, onChange: () => void load() });

  useEffect(() => {
    void load();
  }, [load]);

  // Open and in front: everything in it counts as read.
  useEffect(() => {
    const markRead = () => {
      if (!visible || unread === 0 || readBusy.current || document.visibilityState !== "visible") return;
      readBusy.current = true;
      setUnread(0);
      void fetch(`${base}/read`, { method: "POST" }).finally(() => (readBusy.current = false));
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [visible, unread, base]);

  useEffect(() => onUnread?.(unread), [unread, onUnread]);

  // Keep the newest message in view.
  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.length, typing, visible]);

  async function submit() {
    if (sending || (!text.trim() && !file)) return;
    setSending(true);
    setError(null);
    const fd = new FormData();
    fd.set("text", text);
    if (file) fd.set("file", file);
    try {
      const res = await fetch(base, { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't send. Try again.");
      setMessages((prev) => (prev.some((x) => x.id === d.message.id) ? prev : [...prev, d.message]));
      setText("");
      setFile(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    const r = await fitUpload(f);
    if ("error" in r) return setError(r.error);
    setFile(r.file);
  }

  const fileHref = (id: string) => (side === "USER" ? `/api/orders/${orderId}/chat/file/${id}` : `/api/admin/support/${id}/file`);
  const lastMine = [...messages].reverse().find((m) => m.from === side);
  const seen = !!(lastMine && otherReadAt && otherReadAt >= lastMine.at);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {header?.({ live, status, count: messages.length })}
      <div ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3" aria-live="polite">
        {loaded && messages.length === 0 && <div className="grid h-full place-items-center px-6 text-center text-sm text-slate-500">{empty}</div>}
        {messages.map((m, i) => {
          const mine = m.from === side;
          const showName = !mine && (i === 0 || messages[i - 1].from !== m.from);
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              {showName && <span className="mb-0.5 px-1 text-[11px] font-medium text-slate-500">{m.name}</span>}
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-slate-100 text-slate-900"}`}>
                {m.text}
                {m.attachment && (
                  <a href={fileHref(m.id)} target="_blank" rel="noreferrer" className={`mt-1 flex items-center gap-1.5 text-xs font-medium underline ${mine ? "text-white/90" : "text-brand-700"}`}>
                    <ImagePlus className="size-3.5" aria-hidden /> Screenshot
                  </a>
                )}
              </div>
              <span className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-slate-400">
                {when(m.at)}
                {mine && m.id === lastMine?.id && seen && <><CheckCheck className="size-3 text-brand-600" aria-hidden /> Seen</>}
              </span>
            </div>
          );
        })}
        {typing && (
          <div className="flex items-center gap-1 px-1 text-xs text-slate-500" aria-label="Typing">
            <span className="flex gap-0.5">
              {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${i * 120}ms` }} />)}
            </span>
            {side === "USER" ? "Support is typing" : "Customer is typing"}
          </div>
        )}
      </div>

      <form
        className="border-t border-slate-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {side === "USER" && messages.some((m) => m.from === "USER") && <PushPrompt />}
        {status === "RESOLVED" && <p className="mb-2 text-center text-xs text-slate-500">{side === "USER" ? "Marked resolved. Write again to reopen." : "Resolved. A new message reopens it."}</p>}
        {error && <p role="alert" className="mb-2 text-xs text-rose-700">{error}</p>}
        {file && (
          <p className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700">
            <ImagePlus className="size-3.5" aria-hidden /> <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <button type="button" onClick={() => setFile(null)} aria-label="Remove screenshot" className="text-slate-500 hover:text-slate-900"><X className="size-3.5" /></button>
          </p>
        )}
        <div className="flex items-end gap-2">
          <label className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Attach a screenshot">
            <ImagePlus className="size-5" aria-hidden />
            <input type="file" accept="image/jpeg,image/png,application/pdf" className="sr-only" onChange={(e) => void pick(e.currentTarget.files?.[0]).then(() => (e.currentTarget.value = ""))} />
          </label>
          <textarea
            value={text}
            rows={1}
            maxLength={2000}
            placeholder="Type a message"
            aria-label="Message"
            className="input max-h-32 min-h-10 flex-1 resize-none py-2"
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(128, e.target.scrollHeight)}px`;
              if (Date.now() - lastTypingSent.current > 2000) {
                lastTypingSent.current = Date.now();
                sendTyping();
              }
            }}
            onKeyDown={(e) => {
              // Enter sends on a keyboard; Shift+Enter makes a new line. Phones keep Enter for new lines.
              if (e.key === "Enter" && !e.shiftKey && !("ontouchstart" in window)) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <button className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white disabled:opacity-50" disabled={sending || (!text.trim() && !file)} aria-label="Send">
            {sending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <SendHorizontal className="size-4" aria-hidden />}
          </button>
        </div>
      </form>
    </div>
  );
}
