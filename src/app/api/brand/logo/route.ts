import { getLogo } from "@/server/brand";

/** Public: the uploaded logo. Cached for a year; the URL carries a version. */
export async function GET() {
  const logo = await getLogo();
  if (!logo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(Buffer.from(logo.data, "base64")), {
    headers: {
      "content-type": logo.mime,
      "cache-control": "public, max-age=31536000, immutable",
      // An SVG opened directly must not be able to run anything.
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}
