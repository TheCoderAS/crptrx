"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Modal } from "./Modal";

// Destructive wording gets a red button; everything else the normal one.
const DANGER = /\b(remove|delete|disable|decline|close|reset|cancel)\b/i;
// The button repeats the action ("Remove", "Approve") instead of a vague "OK".
const VERBS = ["Remove", "Delete", "Disable", "Decline", "Close", "Reset", "Approve", "Record", "Change", "Set", "Cancel"];

/**
 * In-app replacement for window.confirm: `await ask("Remove this?")` resolves
 * true or false. Render `prompt` somewhere in the component.
 */
export function useConfirm() {
  const [message, setMessage] = useState<string | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const ask = useCallback(
    (text: string) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setMessage(text);
      }),
    [],
  );
  const finish = useCallback((ok: boolean) => {
    setMessage(null);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);
  const cancel = useCallback(() => finish(false), [finish]);

  const danger = !!message && DANGER.test(message);
  const verb = message ? (VERBS.find((v) => message.startsWith(v)) ?? "Continue") : "Continue";
  const prompt = (
    <Modal open={message !== null} onClose={cancel} title={danger ? "Are you sure?" : "Please confirm"}>
      <div className="flex gap-3">
        <span className={`icon-tile size-10 shrink-0 rounded-xl ${danger ? "tile-rose" : "tile-blue"}`}>
          {danger ? <AlertTriangle className="size-5" aria-hidden /> : <HelpCircle className="size-5" aria-hidden />}
        </span>
        <p className="pt-2 text-sm text-slate-700">{message}</p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={cancel}>Go back</button>
        <button type="button" data-confirm-ok autoFocus className={danger ? "btn-danger" : "btn-primary"} onClick={() => finish(true)}>{verb}</button>
      </div>
    </Modal>
  );
  return { ask, prompt };
}
