import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AppError } from "./errors";

/** Wrap a route handler: AppError -> clean JSON error, anything else -> 500 without internals. */
export function api<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
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
