import { getSettings } from "@/server/settings";

/** Brand name for metadata; falls back when the database isn't reachable (e.g. at build time). */
export async function brandName(): Promise<string> {
  try {
    return (await getSettings()).brand_name;
  } catch {
    return "USDT Exchange";
  }
}
