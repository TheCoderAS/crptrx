import { ImageResponse } from "next/og";
import { BrandMark, brandForImages } from "@/lib/brandMark";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function Icon() {
  const b = await brandForImages();
  return new ImageResponse(<BrandMark size={64} logo={b.logo} primary={b.primary} accent={b.accent} />, size);
}
