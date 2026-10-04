import { api, body } from "@/server/http";
import { clientIp } from "@/server/auth/session";
import { resolveInvite } from "@/server/referral";
import { rateLimit } from "@/server/ratelimit";

/** Checks an invite code before sign-up (so Google sign-in doesn't open just to be refused). */
export const POST = api(async (req: Request) => {
  await rateLimit(`invite-check:${await clientIp()}`, 30, 15 * 60);
  const { code } = await body<{ code?: string }>(req);
  await resolveInvite(code); // throws "Code not found" for a wrong one
  return { ok: true };
});
