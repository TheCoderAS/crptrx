import type { Prisma } from "@prisma/client";
import { audit, SYSTEM } from "./audit";
import { prisma } from "./db";
import { D, Decimal } from "./money";
import { notifySuperAdmins } from "./notify";
import { getSettings, RATE_SOURCES_REF, writeSetting, type Settings } from "./settings";

/**
 * Auto rate: the rate offered to users = live USDT/INR market price x (1 - margin%).
 * Guards (a bad feed must block quotes, never pay a wrong price):
 *  - several sources; outliers (> OUTLIER_PCT from the median) are dropped, and at
 *    least `rate_min_sources` must agree;
 *  - the final rate must sit between the owner's floor and ceiling;
 *  - a market move bigger than `rate_max_jump_percent` since the last accepted
 *    price is refused until an admin accepts it;
 *  - if the feed keeps failing, the rate goes stale after `rate_feed_max_age_minutes`
 *    and quotes are blocked (settings.rateIsStale).
 */

export const OUTLIER_PCT = 2;
export const ALERT_AFTER_MS = 15 * 60_000;
export const RATE_SOURCE_IDS = RATE_SOURCES_REF.RATE_SOURCE_IDS;

export type SourceResult = { source: string; price?: string; error?: string };
export type Fetcher = (source: string) => Promise<Decimal>;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const positive = (v: unknown, what: string): Decimal => {
  const d = new Decimal(String(v));
  if (!d.isFinite() || d.lte(0)) throw new Error(`bad price from ${what}: ${String(v)}`);
  return d;
};

/** Public USDT/INR price endpoints. No API keys. */
export const defaultFetcher: Fetcher = async (source) => {
  switch (source) {
    case "coindcx": {
      const rows = (await getJson("https://api.coindcx.com/exchange/ticker")) as { market?: string; last_price?: string }[];
      const row = rows.find((r) => r.market === "USDTINR");
      if (!row) throw new Error("USDTINR market not listed");
      return positive(row.last_price, source);
    }
    case "wazirx": {
      const r = (await getJson("https://api.wazirx.com/sapi/v1/ticker/24hr?symbol=usdtinr")) as { lastPrice?: string };
      return positive(r.lastPrice, source);
    }
    case "coingecko": {
      const r = (await getJson("https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=inr")) as { tether?: { inr?: number } };
      return positive(r.tether?.inr, source);
    }
    default:
      throw new Error(`unknown source ${source}`);
  }
};

function median(xs: Decimal[]): Decimal {
  const s = [...xs].sort((a, b) => a.comparedTo(b));
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : s[m - 1].plus(s[m]).div(2);
}

export type Aggregate = { ok: true; market: Decimal; used: string[]; dropped: string[] } | { ok: false; reason: string };

/** Median of the sources that agree within OUTLIER_PCT of the overall median. */
export function aggregate(results: SourceResult[], minSources: number): Aggregate {
  const good = results.filter((r) => r.price).map((r) => ({ source: r.source, price: D(r.price!) }));
  if (good.length < minSources)
    return { ok: false, reason: `Only ${good.length} price source(s) answered; ${minSources} needed.` };
  const mid = median(good.map((g) => g.price));
  const agree = good.filter((g) => g.price.minus(mid).abs().div(mid).mul(100).lte(OUTLIER_PCT));
  const dropped = good.filter((g) => !agree.includes(g)).map((g) => g.source);
  if (agree.length < minSources)
    return { ok: false, reason: `Price sources disagree by more than ${OUTLIER_PCT}% (${good.map((g) => `${g.source} ${g.price.toFixed(2)}`).join(", ")}).` };
  return { ok: true, market: median(agree.map((g) => g.price)), used: agree.map((g) => g.source), dropped };
}

/** Rate offered to users, in whole paise, rounded down (never over-pay). */
export function rateFromMarket(market: Decimal, marginPercent: string): Decimal {
  return market.mul(new Decimal(1).minus(D(marginPercent).div(100))).toDecimalPlaces(2, Decimal.ROUND_DOWN);
}

export type Evaluation =
  | { ok: true; market: Decimal; rate: Decimal; used: string[]; dropped: string[] }
  | { ok: false; reason: string; market?: Decimal; rate?: Decimal; needsAcceptance?: boolean };

/** All guard logic in one pure function (unit-tested). */
export function evaluate(results: SourceResult[], s: Settings, baselineMarket: Decimal | null): Evaluation {
  const agg = aggregate(results, s.rate_min_sources);
  if (!agg.ok) return { ok: false, reason: agg.reason };
  const rate = rateFromMarket(agg.market, s.rate_margin_percent);
  if (rate.lt(D(s.rate_floor)) || rate.gt(D(s.rate_ceiling)))
    return { ok: false, market: agg.market, rate, reason: `Rate ${rate.toFixed(2)} is outside your floor/ceiling (${s.rate_floor}–${s.rate_ceiling}).` };
  if (baselineMarket) {
    const jump = agg.market.minus(baselineMarket).abs().div(baselineMarket).mul(100);
    if (jump.gt(D(s.rate_max_jump_percent)))
      return {
        ok: false,
        market: agg.market,
        rate,
        needsAcceptance: true,
        reason: `Market moved ${jump.toFixed(2)}% (from ${baselineMarket.toFixed(2)} to ${agg.market.toFixed(2)}), above your ${s.rate_max_jump_percent}% limit. Check the market and accept it in Settings.`,
      };
  }
  return { ok: true, market: agg.market, rate, used: agg.used, dropped: agg.dropped };
}

export async function fetchAll(sources: string[], fetcher: Fetcher = defaultFetcher): Promise<SourceResult[]> {
  return Promise.all(
    sources.map(async (source) => {
      try {
        return { source, price: (await fetcher(source)).toString() };
      } catch (e) {
        return { source, error: (e as Error).message.slice(0, 200) };
      }
    }),
  );
}

/**
 * One refresh (the worker calls this every 2 minutes). Writes the `rate`
 * setting (logged in settings history) only when the value changes.
 */
export async function refreshAutoRate(opts: { now?: Date; fetcher?: Fetcher } = {}) {
  const now = opts.now ?? new Date();
  const s = await getSettings();
  if (s.rate_mode !== "AUTO") return { skipped: true as const };
  const state = await prisma.rateFeedState.findUnique({ where: { id: 1 } });
  const results = await fetchAll(s.rate_sources, opts.fetcher);
  const ev = evaluate(results, s, state?.baselineMarket ? D(state.baselineMarket) : null);
  const sources = results as unknown as Prisma.InputJsonValue;

  if (!ev.ok) {
    const failingSince = state?.failingSince ?? now;
    const shouldAlert = !state?.alertSentAt && (ev.needsAcceptance || now.getTime() - failingSince.getTime() >= ALERT_AFTER_MS);
    await prisma.rateFeedState.upsert({
      where: { id: 1 },
      create: { id: 1, sources, lastError: ev.reason, lastErrorAt: now, failingSince, lastMarket: ev.market?.toString(), alertSentAt: shouldAlert ? now : null },
      update: { sources, lastError: ev.reason, lastErrorAt: now, failingSince, ...(ev.market ? { lastMarket: ev.market.toString() } : {}), ...(shouldAlert ? { alertSentAt: now } : {}) },
    });
    if (shouldAlert) {
      await audit(SYSTEM, "RATE_FEED_ALERT", { details: { reason: ev.reason } });
      await notifySuperAdmins(
        "Live rate paused",
        `The automatic USDT/INR rate was not updated: ${ev.reason}\n\nNew quotes stop once the last good rate is older than ${s.rate_feed_max_age_minutes} minutes. Open Admin → Settings to accept the new price or switch to a manual rate.`,
        "/admin/settings",
      );
    }
    return { ok: false as const, reason: ev.reason, results };
  }

  if (!D(s.rate).eq(ev.rate)) await writeSetting("rate", ev.rate.toFixed(2), SYSTEM);
  await prisma.rateFeedState.upsert({
    where: { id: 1 },
    create: { id: 1, lastOkAt: now, lastMarket: ev.market.toString(), baselineMarket: ev.market.toString(), sources },
    update: { lastOkAt: now, lastMarket: ev.market.toString(), baselineMarket: ev.market.toString(), sources, lastError: null, failingSince: null, alertSentAt: null },
  });
  return { ok: true as const, rate: ev.rate, market: ev.market, results };
}

/** Admin confirms a big market move: clear the baseline so the next refresh accepts the current price. */
export async function acceptCurrentMarket(actor: { type: "ADMIN"; id: string }, ip: string | null, fetcher?: Fetcher) {
  await prisma.rateFeedState.upsert({ where: { id: 1 }, create: { id: 1 }, update: { baselineMarket: null, alertSentAt: null } });
  await audit(actor, "RATE_JUMP_ACCEPTED", { ip });
  return refreshAutoRate({ fetcher });
}

/** Read-only look at what the feed would give right now (for the Settings screen in either mode). */
export async function previewRate(fetcher?: Fetcher) {
  const s = await getSettings();
  const results = await fetchAll(s.rate_sources, fetcher);
  return { results, evaluation: evaluate(results, s, null) };
}

export const rateFeedState = () => prisma.rateFeedState.findUnique({ where: { id: 1 } });
