/**
 * Live check of the USDT/INR price sources used by Auto rate mode.
 * Needs internet; no database. Usage: npx tsx scripts/check-rate-sources.ts
 */
import { aggregate, fetchAll, RATE_SOURCE_IDS } from "@/server/rateFeed";

async function main() {
  const results = await fetchAll(RATE_SOURCE_IDS);
  for (const r of results) console.log(`${r.price ? "PASS" : "FAIL"}  ${r.source}: ${r.price ? `₹${Number(r.price).toFixed(4)}` : r.error}`);
  const agg = aggregate(results, 2);
  console.log(agg.ok ? `PASS  agreed market price ₹${agg.market.toFixed(2)} from ${agg.used.join(", ")}${agg.dropped.length ? ` (dropped ${agg.dropped.join(", ")})` : ""}` : `FAIL  ${agg.reason}`);
  // At least two independent sources must work for the default "2 must agree" setting.
  process.exit(agg.ok ? 0 : 1);
}

main();
