import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AppError } from "./errors";

// Uploads are at most 4 files of 200 KB. Anything far bigger is turned away before it's read.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/**
 * Checks every state-changing API call before it runs:
 * - CSRF: it must come from our own site. Accepts the request's own host (direct
 *   access) or the public APP_URL host (behind a proxy that rewrites Host). Session
 *   cookies are also SameSite=Lax and HTTP-only.
 * - Size: a body far over the upload limit is refused up front.
 * This used to be Next.js middleware, but middleware running on Node.js cuts off
 * request bodies that arrive slowly (phone uploads), so it lives here instead.
 */
export function guardRequest(req: Request): Response | null {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return null;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
    return NextResponse.json({ error: "Upload too large. Each file must be 200 KB or smaller (JPG, PNG or PDF).", code: "UPLOAD_TOO_LARGE" }, { status: 413 });
  const origin = req.headers.get("origin");
  const allowed = new Set<string>();
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) allowed.add(host);
  try {
    if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).host);
  } catch {
    /* bad APP_URL: fall back to host only */
  }
  let ok = false;
  try {
    ok = !!origin && allowed.has(new URL(origin).host);
  } catch {
    ok = false;
  }
  return ok ? null : NextResponse.json({ error: "Request blocked (origin check failed)." }, { status: 403 });
}

/** Wrap a route handler: AppError -> clean JSON error, anything else -> 500 without internals. */
export function api<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    if (args[0] instanceof Request) {
      const blocked = guardRequest(args[0]);
      if (blocked) return blocked;
    }
    try {
      const out = await fn(...args);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true }, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      if (e instanceof AppError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
        return NextResponse.json({ error: "This conflicts with an existing record." }, { status: 409 });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

/** Reads an upload form. A cut-off or broken body becomes a clear message instead of a 500. */
export async function formData(req: Request): Promise<FormData> {
  try {
    return await req.formData();
  } catch (e) {
    console.error(`[upload] unreadable form body (content-length ${req.headers.get("content-length") ?? "?"}): ${(e as Error).message}`);
    // Usually a cut-short upload (the phone or connection dropped part of it), not a size problem:
    // sizes are checked separately with their own message. The browser retries once on this code.
    throw new AppError("The file didn't arrive in full. Please try again.", 400, "UPLOAD_UNREADABLE");
  }
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await req.json().catch(() => ({}))) as T;
  if (ct.includes("form")) return Object.fromEntries((await formData(req)).entries()) as T;
  return {} as T;
}
