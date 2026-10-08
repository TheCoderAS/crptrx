import { describe, expect, it } from "vitest";
import { adultBornBy, istToday } from "@/lib/time";

const at = (iso: string) => new Date(iso);

describe("18 or older, by today's date in India", () => {
  it("is the same day 18 years ago", () => {
    expect(adultBornBy(at("2026-10-08T06:00:00Z"))).toBe("2008-10-08");
  });

  it("uses India's date, not UTC (10:00 PM UTC is already tomorrow in India)", () => {
    expect(istToday(at("2026-10-08T22:00:00Z"))).toBe("2026-10-09");
    expect(adultBornBy(at("2026-10-08T22:00:00Z"))).toBe("2008-10-09");
  });

  it("29 Feb today, no 29 Feb 18 years ago: 28 Feb", () => {
    expect(adultBornBy(at("2028-02-29T06:00:00Z"))).toBe("2010-02-28");
  });

  it("someone born on 29 Feb is let in from 1 Mar in a year without one", () => {
    expect("2008-02-29" <= adultBornBy(at("2026-02-28T06:00:00Z"))).toBe(false);
    expect("2008-02-29" <= adultBornBy(at("2026-03-01T06:00:00Z"))).toBe(true);
  });
});
