import { api } from "@/server/http";
import { readSignedFile } from "@/server/storage";

/** Serves private files for the local storage driver via 5-minute signed links. */
export const GET = api(async (req: Request) => {
  const u = new URL(req.url);
  const { buf, type } = await readSignedFile(u.searchParams.get("key") ?? "", u.searchParams.get("exp") ?? "", u.searchParams.get("sig") ?? "");
  return new Response(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "private, no-store", "content-disposition": "inline" } });
});
