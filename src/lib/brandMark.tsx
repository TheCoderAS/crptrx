/** The brand mark drawn for generated images (favicon, share preview): the uploaded logo, or the built-in mark. */
export function BrandMark({ size, logo, primary = "#2563eb", accent = "#7c3aed" }: { size: number; logo?: string | null; primary?: string; accent?: string }) {
  if (logo)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} width={size} height={size} style={{ objectFit: "contain", borderRadius: size * 0.22 }} alt="" />;
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: size * 0.28,
        backgroundColor: primary,
        backgroundImage: `linear-gradient(135deg, ${primary} 0%, ${primary} 45%, ${accent} 100%)`,
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 7h11l-3-3" />
        <path d="M17 17H6l3 3" />
      </svg>
    </div>
  );
}

/** Settings + logo for generated images; safe when the database isn't reachable (build time). */
export async function brandForImages() {
  try {
    const { getSettings } = await import("@/server/settings");
    const { logoDataUri } = await import("@/server/brand");
    const s = await getSettings();
    return { name: s.brand_name, primary: s.brand_primary_color, accent: s.brand_accent_color, logo: s.brand_logo_version ? await logoDataUri() : null };
  } catch {
    return { name: "USDT Exchange", primary: "#2563eb", accent: "#7c3aed", logo: null };
  }
}
