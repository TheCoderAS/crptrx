import { headers } from "next/headers";

/** The VisionPay Android app adds "VisionPayApp/<version>" to its WebView's user agent. */
export async function nativeAppVersion(): Promise<string | null> {
  return /VisionPayApp\/([\w.+-]+)/.exec((await headers()).get("user-agent") ?? "")?.[1] ?? null;
}
