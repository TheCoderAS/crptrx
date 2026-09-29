import { Mail, MessageCircle, Phone } from "lucide-react";
import type { ContactChannel } from "@/server/contact";

const ICON = { email: Mail, whatsapp: MessageCircle, phone: Phone };

/** Support contact buttons. `tone="dark"` for coloured backgrounds. */
export function ContactLinks({ channels, tone = "light" }: { channels: ContactChannel[]; tone?: "light" | "dark" }) {
  if (channels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {channels.map((c) => {
        const Icon = ICON[c.kind];
        return (
          <a
            key={c.kind}
            href={c.href}
            target={c.kind === "whatsapp" ? "_blank" : undefined}
            rel={c.kind === "whatsapp" ? "noreferrer" : undefined}
            className={tone === "dark" ? "btn bg-white text-brand-800 hover:bg-brand-50" : "btn-secondary"}
          >
            <Icon className="size-4" aria-hidden /> {c.label}
            <span className="sr-only">: {c.value}</span>
          </a>
        );
      })}
    </div>
  );
}
