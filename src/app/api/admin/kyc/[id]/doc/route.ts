import { api } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { assertOwned } from "@/server/scope";
import { kycDocLink, type DocField } from "@/server/kyc";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Logs the view and returns a 5-minute signed link: as JSON for the in-app viewer
 * (?format=json), else as a redirect. The redirect is relative: behind a proxy
 * (Render) req.url is the internal address, e.g. localhost:10000.
 */
export const GET = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  await assertOwned(a.admin, "kycSubmission", id);
  const params = new URL(req.url).searchParams;
  const url = await kycDocLink(id, params.get("doc") as DocField, a.actor, a.ip);
  if (params.get("format") === "json") return { url };
  return new Response(null, { status: 303, headers: { location: url } });
});
