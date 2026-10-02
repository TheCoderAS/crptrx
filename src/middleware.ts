import { NextResponse, type NextRequest } from "next/server";

/**
 * CSRF protection: state-changing API calls must come from our own site.
 * Accepts the request's own host (direct access) or the public APP_URL host
 * (behind a reverse proxy that rewrites Host). Session cookies are also
 * SameSite=Lax and HTTP-only.
 */
// Uploads are at most 4 files of 200 KB. Anything far bigger is turned away here,
// before Next.js cuts the body off at 10 MB and the route fails with a confusing error.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
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
    if (!ok) return NextResponse.json({ error: "Request blocked (origin check failed)." }, { status: 403 });
  }
  return NextResponse.next();
}

// Node.js runtime so APP_URL is read when the server runs, not baked in at build time.
export const config = { matcher: ["/api/:path*"], runtime: "nodejs" };
