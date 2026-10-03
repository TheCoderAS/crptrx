import { ImageResponse } from "next/og";
import { BrandMark, brandForImages } from "@/lib/brandMark";

export const size = { width: 1200, height: 630 };
// JPEG: the gradients make a PNG ~470 KB, and WhatsApp skips preview images over ~300 KB.
export const contentType = "image/jpeg";
export const alt = "Sell USDT for INR to your own bank or UPI";
export const dynamic = "force-dynamic";

/** Share preview shown on WhatsApp, X, LinkedIn, Slack etc. */
export default async function OgImage() {
  const b = await brandForImages();
  const name = b.name;
  const card = (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        color: "white",
        backgroundColor: "#0b1437",
        backgroundImage: `radial-gradient(circle at 0% 0%, ${b.primary} 0%, transparent 55%), radial-gradient(circle at 100% 100%, #10b981 0%, transparent 50%), radial-gradient(circle at 90% 10%, ${b.accent} 0%, transparent 45%)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <BrandMark size={72} logo={b.logo} primary={b.primary} accent={b.accent} />
        <div style={{ fontSize: 40, fontWeight: 700 }}>{name}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>USDT to rupees,</div>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: "#6ee7b7" }}>straight to your bank.</div>
      </div>
      <div style={{ display: "flex", gap: 16, fontSize: 28 }}>
        {["Bank & UPI payout", "15-min price lock", "TDS handled", "TRC-20 · BEP-20"].map((t) => (
          <div key={t} style={{ display: "flex", padding: "10px 20px", borderRadius: 999, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)" }}>{t}</div>
        ))}
      </div>
    </div>
  );
  const png = new ImageResponse(card, size);
  try {
    const sharp = (await import("sharp")).default;
    const jpg = await sharp(Buffer.from(await png.arrayBuffer())).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    return new Response(new Uint8Array(jpg), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=3600" } });
  } catch {
    // No image converter on this server: the PNG still works, just larger.
    return new ImageResponse(card, size);
  }
}
