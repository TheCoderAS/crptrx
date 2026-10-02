"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { ApiForm } from "./ApiForm";

/** Centered dialog: closes on Escape, the backdrop, or the X. Locks page scroll while open. */
export function Modal({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Escape belongs to the 2FA prompt when it's open on top of this one.
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector('[aria-labelledby="stepup-title"]') && onClose();
    window.addEventListener("keydown", esc);
    panel.current?.querySelector<HTMLElement>("input:not([type=hidden]):not(.sr-only), select, textarea")?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-[var(--shadow-float)] sm:max-w-lg sm:rounded-2xl sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 id="modal-title" className="h2">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost -mt-1 -mr-2 size-9 min-h-0 p-0" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * A button that opens a form in a dialog and closes it once the form saves.
 * The fields are passed as children, so server pages can use it.
 */
export function ModalForm({ button, title, description, action, submitLabel, children }: { button: ReactNode; title: ReactNode; description?: ReactNode; action: string; submitLabel: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>{button}</button>
      <Modal open={open} onClose={close} title={title} description={description}>
        <ApiForm action={action} className="space-y-4" onSuccess={close}>
          {children}
          <button className="btn-primary w-full">{submitLabel}</button>
        </ApiForm>
      </Modal>
    </>
  );
}
