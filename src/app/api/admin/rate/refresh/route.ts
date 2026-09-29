import { api } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { getSettings } from "@/server/settings";
import { previewRate, refreshAutoRate } from "@/server/rateFeed";

/** "Fetch now": in Auto mode updates the rate; in Manual mode only shows what the feed says. */
export const POST = api(async () => {
  await adminCtx("SUPER_ADMIN");
  if ((await getSettings()).rate_mode === "AUTO") {
    const r = await refreshAutoRate();
    if ("ok" in r) return { message: r.ok ? `Live rate updated: ₹${r.rate.toFixed(2)} (market ₹${r.market.toFixed(2)}).` : `Not updated: ${r.reason}` };
  }
  const p = await previewRate();
  const prices = p.results.map((r) => `${r.source}: ${r.price ? `₹${Number(r.price).toFixed(2)}` : `error (${r.error})`}`).join(", ");
  return {
    message: p.evaluation.ok
      ? `Market ₹${p.evaluation.market.toFixed(2)} → with your margin ₹${p.evaluation.rate.toFixed(2)}. (${prices}). Manual mode: nothing changed.`
      : `${p.evaluation.reason} (${prices})`,
  };
});
