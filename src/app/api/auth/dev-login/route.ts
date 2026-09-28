import { api, body } from "@/server/http";
import { env } from "@/server/env";
import { AppError } from "@/server/errors";
import { clientIp, createSession } from "@/server/auth/session";
import { upsertUserFromIdentity } from "@/server/auth/user";
import { rateLimit } from "@/server/ratelimit";

/** Test phases only (DEV_LOGIN_ENABLED=true): sign in with any email, no Google account needed. */
export const POST = api(async (req: Request) => {
  if (!env.devLoginEnabled) throw new AppError("Not found", 404);
  const ip = await clientIp();
  await rateLimit(`login:${ip}`, 20, 15 * 60);
  const { email } = await body<{ email: string }>(req);
  const e = String(email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new AppError("Enter an email address.");
  const user = await upsertUserFromIdentity({ uid: `dev:${e}`, email: e, emailVerified: true, provider: "dev" }, ip);
  await createSession("USER", user.id);
  return { redirect: user.mobileVerifiedAt ? "/dashboard" : "/account" };
});
