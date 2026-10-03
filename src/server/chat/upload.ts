import { checkUpload, putFile } from "../storage";

/** Optional screenshot sent with a chat message (already shrunk in the browser). */
export async function chatAttachment(fd: FormData, ownerId: string): Promise<string | null> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  return putFile(`support/${ownerId}`, buf, checkUpload(buf, file.type));
}
