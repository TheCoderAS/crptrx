import { isRealValue, type Settings } from "./settings";

export interface ContactChannel {
  kind: "email" | "phone" | "whatsapp";
  label: string;
  value: string;
  href: string;
}

/** The ways customers can reach support, from Settings → Brand & contact. Empty ones are left out. */
export function contactChannels(s: Pick<Settings, "support_email" | "support_phone" | "support_whatsapp">): ContactChannel[] {
  const out: ContactChannel[] = [];
  if (isRealValue(s.support_email)) out.push({ kind: "email", label: "Email", value: s.support_email, href: `mailto:${s.support_email}` });
  if (isRealValue(s.support_whatsapp)) out.push({ kind: "whatsapp", label: "WhatsApp", value: s.support_whatsapp, href: `https://wa.me/${s.support_whatsapp.replace(/\D/g, "")}` });
  if (isRealValue(s.support_phone)) out.push({ kind: "phone", label: "Call", value: s.support_phone, href: `tel:${s.support_phone.replace(/[^\d+]/g, "")}` });
  return out;
}

/** Legal name when set, else the app name. */
export const companyName = (s: Pick<Settings, "company_name" | "brand_name">) => (isRealValue(s.company_name) ? s.company_name : s.brand_name);
