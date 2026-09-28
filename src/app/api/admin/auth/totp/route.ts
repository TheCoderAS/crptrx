import QRCode from "qrcode";
import { api, body } from "@/server/http";
import { beginTotpSetup, checkAdminTotp } from "@/server/auth/admin";
import { clientIp, pendingAdmin, upgradeAdminSession } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";

/** First sign-in: create the authenticator secret and return a QR code. */
export const GET = api(async () => {
  const admin = await pendingAdmin();
  if (!admin) throw new AppError("Please log in again.", 401);
  const { secret, url } = await beginTotpSetup(admin);
  return { secret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
});

export const POST = api(async (req: Request) => {
  const admin = await pendingAdmin();
  if (!admin) throw new AppError("Please log in again.", 401);
  await rateLimit(`admin-2fa:${admin.id}`, 10, 15 * 60);
  const { code } = await body<{ code: string }>(req);
  await checkAdminTotp(admin, String(code ?? ""), "login", await clientIp());
  await upgradeAdminSession();
  return { redirect: "/admin" };
});
