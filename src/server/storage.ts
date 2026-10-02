import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hmac, randomToken, safeEqual } from "./crypto";
import { env } from "./env";
import { AppError } from "./errors";

// Private storage for ID documents and support screenshots (spec 10.2).
// "supabase": a PRIVATE Supabase Storage bucket, reached with the service-role key
//   from the server only (never sent to browsers).
// "local": a private folder (Docker volume) for test phases.
// Either way, files are opened only through the app's own 5-minute signed links.

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

/** Supabase Storage REST API: /storage/v1/object/<bucket>/<key> with the service-role key. */
function supabaseObjectUrl(key: string) {
  const base = env.storage.supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/${encodeURIComponent(env.storage.supabaseBucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
const supabaseHeaders = () => ({ authorization: `Bearer ${env.storage.supabaseKey}`, apikey: env.storage.supabaseKey });

const localPath = (key: string) => {
  const root = path.resolve(env.storage.localDir);
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new AppError("Bad file key", 400);
  return p;
};

export async function putFile(prefix: string, buf: Buffer, contentType: string): Promise<string> {
  const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomToken(16)}.${TYPES[contentType]}`;
  if (env.storage.driver === "supabase") {
    const res = await fetch(supabaseObjectUrl(key), {
      method: "POST",
      headers: { ...supabaseHeaders(), "content-type": contentType, "x-upsert": "false" },
      body: new Uint8Array(buf),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error(`[storage] upload failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
      throw new AppError("We couldn't save your file. Please try again.", 502);
    }
  } else {
    const p = localPath(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, buf, { mode: 0o600 });
  }
  return key;
}

/**
 * A link that stops working after 5 minutes. Always our own URL: the file is
 * read through the app, so ID documents never get a public storage-provider link.
 */
export async function signedUrl(key: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SEC;
  return `/api/files?key=${encodeURIComponent(key)}&exp=${exp}&sig=${hmac(`${key}|${exp}`)}`;
}

export async function readSignedFile(key: string, exp: string, sig: string): Promise<{ buf: Buffer; type: string }> {
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) throw new AppError("This link has expired.", 410);
  if (!safeEqual(sig, hmac(`${key}|${exp}`))) throw new AppError("Invalid link.", 403);
  let buf: Buffer;
  if (env.storage.driver === "supabase") {
    const res = await fetch(supabaseObjectUrl(key), { headers: supabaseHeaders(), signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new AppError("File not found.", 404);
    buf = Buffer.from(await res.arrayBuffer());
  } else buf = await readFile(localPath(key));
  const ext = key.split(".").pop();
  return { buf, type: Object.entries(TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream" };
}
