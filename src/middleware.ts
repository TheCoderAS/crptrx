import { NextResponse, type NextRequest } from "next/server";

/**
 * CSRF protection: state-changing API calls must come from our own origin.
 * Session cookies are also SameSite=Lax and HTTP-only.
 */
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    let ok = false;
    try {
      ok = !!origin && !!host && new URL(origin).host === host;
    } catch {
      ok = false;
    }
    if (!ok) return NextResponse.json({ error: "Request blocked (origin check failed)." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
