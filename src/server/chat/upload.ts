import { AppError } from "../errors";
import { checkUpload, putFile } from "../storage";

/** Optional image sent with a chat message (JPG or PNG only; already shrunk in the browser). */
export async function chatAttachment(fd: FormData, ownerId: string): Promise<string | null> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  const buf = Buffer.from(await file.arrayBuffer());
  const type = checkUpload(buf, file.type); // checks the actual bytes, not the name
  if (type !== "image/jpeg" && type !== "image/png") throw new AppError("Only JPG or PNG images can be sent in chat.");
  return putFile(`support/${ownerId}`, buf, type);
}
