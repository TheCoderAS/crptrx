import { audit, type Actor } from "./audit";
import { prisma } from "./db";
import { AppError } from "./errors";
import { writeSetting, type Settings } from "./settings";

// Branding the admin controls: logo (kept in the database as base64), app
// name, colours and contact details. Colours become CSS variables at runtime,
// so no rebuild is needed.

export const MAX_LOGO_BYTES = 300 * 1024;
type LogoType = "image/png" | "image/jpeg" | "image/svg+xml";

function sniff(buf: Buffer): LogoType | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  const head = buf.subarray(0, 512).toString("utf8").trimStart().toLowerCase();
  if ((head.startsWith("<svg") || head.startsWith("<?xml")) && head.includes("<svg")) return "image/svg+xml";
  return null;
}

export async function saveLogo(buf: Buffer, actor: Actor) {
  if (buf.length === 0) throw new AppError("Choose a logo file.");
  if (buf.length > MAX_LOGO_BYTES) throw new AppError("The logo must be 300 KB or smaller. A square PNG or SVG works best.");
  const mime = sniff(buf);
  if (!mime) throw new AppError("Use a PNG, JPG or SVG file.");
  if (mime === "image/svg+xml" && /<script|on\w+\s*=|javascript:/i.test(buf.toString("utf8"))) throw new AppError("This SVG contains scripts. Export a plain SVG or use PNG.");
  await prisma.brandAsset.upsert({
    where: { key: "logo" },
    create: { key: "logo", mime, data: buf.toString("base64"), size: buf.length },
    update: { mime, data: buf.toString("base64"), size: buf.length },
  });
  await writeSetting("brand_logo_version", String(Date.now()), actor);
  await audit(actor, "BRAND_LOGO_UPDATED", { details: { mime, size: buf.length } });
}

export async function removeLogo(actor: Actor) {
  await prisma.brandAsset.deleteMany({ where: { key: "logo" } });
  await writeSetting("brand_logo_version", "", actor);
  await audit(actor, "BRAND_LOGO_REMOVED");
}

export const getLogo = () => prisma.brandAsset.findUnique({ where: { key: "logo" } });

/** URL for the logo, versioned so browsers pick up a new upload at once. Null = built-in mark. */
export const logoSrc = (s: Pick<Settings, "brand_logo_version">) => (s.brand_logo_version ? `/api/brand/logo?v=${s.brand_logo_version}` : null);

/** The logo as a data URI, for generated images (favicon, share preview). */
export async function logoDataUri(): Promise<string | null> {
  try {
    const l = await getLogo();
    return l ? `data:${l.mime};base64,${l.data}` : null;
  } catch {
    return null;
  }
}

const HEX = /^#[0-9a-f]{6}$/i;

/** CSS variables for the admin's colours. Tailwind's brand-* shades are derived from the one primary colour. */
export function themeCss(s: Pick<Settings, "brand_primary_color" | "brand_accent_color">): string {
  const p = HEX.test(s.brand_primary_color) ? s.brand_primary_color : "#2563eb";
  const a = HEX.test(s.brand_accent_color) ? s.brand_accent_color : "#7c3aed";
  const tint = (pct: number) => `color-mix(in oklab, ${p} ${pct}%, white)`;
  const shade = (pct: number) => `color-mix(in oklab, ${p} ${pct}%, black)`;
  const light = `--color-brand-50:${tint(7)};--color-brand-100:${tint(14)};--color-brand-200:${tint(28)};--color-brand-300:${tint(50)};--color-brand-500:${tint(82)};--color-brand-600:${p};--color-brand-700:${shade(86)};--color-brand-800:${shade(72)};--color-brand-900:${shade(52)};--color-brand-950:${shade(32)}`;
  // Dark theme: light tints become deep shades and dark text shades become light (see scripts/gen-dark-theme.mjs).
  const dark = `--color-brand-50:${shade(22)};--color-brand-100:${shade(32)};--color-brand-200:${shade(45)};--color-brand-300:${shade(65)};--color-brand-700:${tint(55)};--color-brand-800:${tint(35)};--color-brand-900:${tint(20)};--color-brand-950:${tint(10)}`;
  const lock = ':root[data-theme="dark"] :is(.theme-lock,.bg-mesh-dark,.bg-brand-gradient)';
  return `:root{${light};--color-accent:${a};--brand-ink:${shade(32)}}:root[data-theme="dark"]{${dark}}${lock}{${light}}`;
}
