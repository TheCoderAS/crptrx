import { NextResponse } from "next/server";
import { api } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { kycDocLink, type DocField } from "@/server/kyc";

type Ctx = { params: Promise<{ id: string }> };

/** Logs the view, then sends the admin to a 5-minute signed link. */
export const GET = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  const doc = new URL(req.url).searchParams.get("doc") as DocField;
  const url = await kycDocLink(id, doc, a.actor, a.ip);
  return NextResponse.redirect(new URL(url, req.url), 303);
});
