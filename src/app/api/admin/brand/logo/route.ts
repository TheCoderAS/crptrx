import { api, body } from "@/server/http";
import { adminCtx } from "@/server/auth/guard";
import { AppError } from "@/server/errors";
import { removeLogo, saveLogo } from "@/server/brand";

export const POST = api(async (req: Request) => {
  const a = await adminCtx("SUPER_ADMIN");
  const b = await body<{ remove?: string; logo?: unknown }>(req); // multipart for uploads, JSON for remove
  if (b.remove === "1") {
    await removeLogo(a.actor);
    return { message: "Logo removed. The built-in mark is shown again." };
  }
  if (!(b.logo instanceof File) || b.logo.size === 0) throw new AppError("Choose a logo file.");
  await saveLogo(Buffer.from(await b.logo.arrayBuffer()), a.actor);
  return { message: "Logo updated." };
});
