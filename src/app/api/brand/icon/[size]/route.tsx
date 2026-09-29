import { ImageResponse } from "next/og";
import { BrandMark, brandForImages } from "@/lib/brandMark";

/** App icons at the sizes phones need to install the site (192 and 512 px). */
export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const n = Number((await ctx.params).size);
  if (n !== 192 && n !== 512) return new Response("Not found", { status: 404 });
  const b = await brandForImages();
  return new ImageResponse(
    <div style={{ width: n, height: n, display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
      <BrandMark size={Math.round(n * 0.84)} logo={b.logo} primary={b.primary} accent={b.accent} />
    </div>,
    { width: n, height: n },
  );
}
