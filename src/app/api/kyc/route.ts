import { api, formData } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { DOC_FIELDS, submitKyc, type DocField } from "@/server/kyc";
import { rateLimit } from "@/server/ratelimit";

export const POST = api(async (req: Request) => {
  const user = await requireUser();
  await rateLimit(`kyc:${user.id}`, 10, 3600);
  const fd = await formData(req);
  const files = {} as Record<DocField, { buf: Buffer; type: string } | undefined>;
  for (const f of DOC_FIELDS) {
    const v = fd.get(f);
    files[f] = v instanceof File && v.size > 0 ? { buf: Buffer.from(await v.arrayBuffer()), type: v.type } : undefined;
  }
  await submitKyc(
    user.id,
    {
      fullName: String(fd.get("fullName") ?? ""),
      dob: String(fd.get("dob") ?? ""),
      pan: String(fd.get("pan") ?? ""),
      address: String(fd.get("address") ?? ""),
      maskedConfirmed: fd.get("maskedConfirmed") === "on" || fd.get("maskedConfirmed") === "true",
      files,
    },
    { type: "USER", id: user.id },
  );
  return { redirect: "/kyc" };
});
