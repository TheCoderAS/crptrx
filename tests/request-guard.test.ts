import { describe, expect, it } from "vitest";
import { api, guardRequest } from "@/server/http";

const post = (headers: Record<string, string>) => new Request("http://app.example/api/x", { method: "POST", headers });

describe("request guard (CSRF + size), on every API write", () => {
  it("lets reads through and same-site writes through", () => {
    expect(guardRequest(new Request("http://app.example/api/x"))).toBeNull();
    expect(guardRequest(post({ host: "app.example", origin: "https://app.example" }))).toBeNull();
    expect(guardRequest(post({ host: "internal:3000", "x-forwarded-host": "app.example", origin: "https://app.example" }))).toBeNull();
  });

  it("blocks writes from other sites or with no origin", async () => {
    expect(guardRequest(post({ host: "app.example", origin: "https://evil.example" }))?.status).toBe(403);
    expect(guardRequest(post({ host: "app.example" }))?.status).toBe(403);
    const handler = api(async (req: Request) => ({ ran: req.method }));
    const res = await handler(post({ host: "app.example", origin: "https://evil.example" }));
    expect(res.status).toBe(403);
  });

  it("turns away oversized bodies before reading them", async () => {
    const res = guardRequest(post({ host: "app.example", origin: "https://app.example", "content-length": String(5 * 1024 * 1024) }));
    expect(res?.status).toBe(413);
    expect(await res!.json()).toMatchObject({ code: "UPLOAD_TOO_LARGE" });
  });
});
