import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { hmac, randomToken, safeEqual } from "./crypto";
import { env } from "./env";
import { AppError } from "./errors";

// Private storage for ID documents and support screenshots (spec 10.2).
// "s3": S3-compatible bucket in an India region, server-side encrypted.
// "local": a private folder served only through short-lived signed links (test phases).

export const LINK_TTL_SEC = 5 * 60;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

/** Check size and real file type from the first bytes, not the name. */
export function checkUpload(buf: Buffer, declared: string): string {
  if (buf.length === 0) throw new AppError("The file is empty.");
  if (buf.length > MAX_FILE_BYTES) throw new AppError("Each file must be 5 MB or smaller.");
  const sniffed =
    buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? "image/png" : buf.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : null;
  if (!sniffed || !TYPES[sniffed]) throw new AppError("Only JPG, PNG or PDF files are allowed.");
  void declared;
  return sniffed;
}

let s3: S3Client | null = null;
const client = () =>
  (s3 ??= new S3Client({ region: env.storage.s3Region, endpoint: env.storage.s3Endpoint, forcePathStyle: !!env.storage.s3Endpoint }));

const localPath = (key: string) => {
  const root = path.resolve(env.storage.localDir);
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new AppError("Bad file key", 400);
  return p;
};

export async function putFile(prefix: string, buf: Buffer, contentType: string): Promise<string> {
  const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomToken(16)}.${TYPES[contentType]}`;
  if (env.storage.driver === "s3") {
    await client().send(
      new PutObjectCommand({ Bucket: env.storage.s3Bucket, Key: key, Body: buf, ContentType: contentType, ServerSideEncryption: "AES256" }),
    );
  } else {
    const p = localPath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, buf, { mode: 0o600 });
  }
  return key;
}

/** A link that stops working after 5 minutes. */
export async function signedUrl(key: string): Promise<string> {
  if (env.storage.driver === "s3")
    return getSignedUrl(client(), new GetObjectCommand({ Bucket: env.storage.s3Bucket, Key: key }), { expiresIn: LINK_TTL_SEC });
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SEC;
  return `/api/files?key=${encodeURIComponent(key)}&exp=${exp}&sig=${hmac(`${key}|${exp}`)}`;
}

export async function readSignedLocal(key: string, exp: string, sig: string): Promise<{ buf: Buffer; type: string }> {
  if (env.storage.driver !== "local") throw new AppError("Not found", 404);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) throw new AppError("This link has expired.", 410);
  if (!safeEqual(sig, hmac(`${key}|${exp}`))) throw new AppError("Invalid link.", 403);
  const buf = await readFile(localPath(key));
  const ext = key.split(".").pop();
  return { buf, type: Object.entries(TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream" };
}
