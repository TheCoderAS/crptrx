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
