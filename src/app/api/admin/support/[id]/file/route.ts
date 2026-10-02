import { api } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { signedUrl } from "@/server/storage";

type Ctx = { params: Promise<{ id: string }> };

export const GET = api(async (req: Request, ctx: Ctx) => {
  const a = await adminCtx();
  const { id } = await ctx.params;
  const m = await prisma.supportMessage.findUnique({ where: { id } });
  if (!m?.attachmentKey) throw new AppError("No attachment", 404);
  await audit(a.actor, "SUPPORT_FILE_VIEWED", { targetType: "support_message", targetId: id, ip: a.ip });
  const url = await signedUrl(m.attachmentKey);
  if (new URL(req.url).searchParams.get("format") === "json") return { url };
  return new Response(null, { status: 303, headers: { location: url } }); // relative: req.url is the internal address behind a proxy
});
