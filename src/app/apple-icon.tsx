import { ImageResponse } from "next/og";
import { BrandMark, brandForImages } from "@/lib/brandMark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function AppleIcon() {
  const b = await brandForImages();
  return new ImageResponse(
    <div style={{ width: 180, height: 180, display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
      <BrandMark size={150} logo={b.logo} primary={b.primary} accent={b.accent} />
    </div>,
    size,
  );
}
