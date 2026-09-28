import { api } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { notifyAllAdmins } from "@/server/notify";
import { rateLimit } from "@/server/ratelimit";
import { checkUpload, putFile } from "@/server/storage";
import { env } from "@/server/env";

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  await rateLimit(`support:${user.id}`, 5, 3600);
  const fd = await req.formData();
  const message = String(fd.get("message") ?? "").trim();
  if (message.length < 5) throw new AppError("Please describe the problem.");
  if (message.length > 4000) throw new AppError("Please keep the message under 4000 characters.");
  const orderId = String(fd.get("orderId") ?? "") || null;
  if (orderId && !(await prisma.order.findFirst({ where: { id: orderId, userId: user.id } }))) throw new AppError("Order not found", 404);
  let attachmentKey: string | null = null;
  const file = fd.get("screenshot");
  if (file instanceof File && file.size > 0) {
    const buf = Buffer.from(await file.arrayBuffer());
    attachmentKey = await putFile(`support/${user.id}`, buf, checkUpload(buf, file.type));
  }
  const m = await prisma.supportMessage.create({ data: { userId: user.id, orderId, message, attachmentKey } });
  await notifyAllAdmins(`Support message${orderId ? ` for ${orderId}` : ""}`, `From ${user.email}:\n\n${message}\n\n${env.appUrl}/admin/support#${m.id}`);
  return { message: "Sent. Our team will get back to you by email." };
});
