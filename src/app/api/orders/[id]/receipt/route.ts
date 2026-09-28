import { api } from "@/server/http";
import { currentAdmin, requireUser } from "@/server/auth/session";
import { buildReceipt } from "@/server/receipt";

type Ctx = { params: Promise<{ id: string }> };

export const GET = api(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const admin = await currentAdmin();
  const pdf = await buildReceipt(id, admin ? undefined : (await requireUser()).id);
  return new Response(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="receipt-${id}.pdf"`, "cache-control": "no-store" },
  });
});
