// Store UTC, show IST (spec 7.6).
const fmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
export const fmtIST = (d: Date | string | null | undefined) => (d ? `${fmt.format(new Date(d))} IST` : "—");

const IST_OFFSET_MS = 330 * 60 * 1000;
/** Start of the current IST day, as a UTC Date. */
export function istDayStart(now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}
export function istMonthStart(now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const start = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1);
  return new Date(start - IST_OFFSET_MS);
}

const shortFmt = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
/** Compact IST time for lists, e.g. "30 Sept, 1:31 am". */
export const fmtISTShort = (d: Date | string) => shortFmt.format(new Date(d));

/** Today's date in India as YYYY-MM-DD. */
export const istToday = (now = new Date()) => new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

/**
 * The latest date of birth of someone who is 18 today in India (YYYY-MM-DD): the same day
 * 18 years ago. On 29 Feb, when that year had no 29 Feb, it's 28 Feb.
 */
export function adultBornBy(now = new Date()): string {
  const [y, m, d] = istToday(now).split("-").map(Number);
  const year = y - 18;
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate(); // days in that month
  return `${year}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** The earliest date of birth accepted. */
export const OLDEST_DOB = "1900-01-01";
