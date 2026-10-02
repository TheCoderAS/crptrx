import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { env } from "@/server/env";
import { putFile, readSignedFile, signedUrl } from "@/server/storage";

process.env.STORAGE_LOCAL_DIR = `${tmpdir()}/usdt-test-uploads`;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);

describe("private file links", () => {
  it("opens through the app's own signed link, and only with a valid signature", async () => {
    const key = await putFile("kyc/test", PNG, "image/png");
    const url = new URL(await signedUrl(key), "http://x");
    expect(url.pathname).toBe("/api/files");
    const [k, exp, sig] = ["key", "exp", "sig"].map((n) => url.searchParams.get(n)!);
    expect((await readSignedFile(k, exp, sig)).buf.equals(PNG)).toBe(true);
    await expect(readSignedFile(k, exp, sig.replace(/.$/, (c) => (c === "a" ? "b" : "a")))).rejects.toThrow(/Invalid link/);
    await expect(readSignedFile(k, String(Math.floor(Date.now() / 1000) - 1), sig)).rejects.toThrow(/expired/);
  });
});

describe("Supabase Storage driver", () => {
  it("is used whenever Supabase is configured, even without STORAGE_DRIVER", () => {
    try {
      process.env.SUPABASE_URL = "https://example.supabase.co";
      expect(env.storage.driver).toBe("supabase");
      process.env.STORAGE_DRIVER = "local";
      expect(env.storage.driver).toBe("local");
    } finally {
      delete process.env.SUPABASE_URL;
      delete process.env.STORAGE_DRIVER;
    }
    expect(env.storage.driver).toBe("local");
  });

  it("uploads and reads back through Supabase's storage API with the server key", async () => {
    const { createServer } = await import("node:http");
    const store = new Map<string, Buffer>();
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(`${req.method} ${req.url} ${req.headers.authorization}`);
      if (req.headers.authorization !== "Bearer service-key") return res.writeHead(401).end();
      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          store.set(req.url!, Buffer.concat(chunks));
          res.writeHead(200, { "content-type": "application/json" }).end("{}");
        });
      } else {
        const b = store.get(req.url!);
        if (!b) return res.writeHead(404).end();
        res.writeHead(200).end(b);
      }
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;
    Object.assign(process.env, { STORAGE_DRIVER: "supabase", SUPABASE_URL: `http://127.0.0.1:${port}/`, SUPABASE_SERVICE_ROLE_KEY: "service-key", SUPABASE_STORAGE_BUCKET: "kyc" });
    try {
      const key = await putFile("kyc/user1", PNG, "image/png");
      expect(seen[0]).toMatch(new RegExp(`^POST /storage/v1/object/kyc/kyc/user1/.+\\.png Bearer service-key$`));
      const url = new URL(await signedUrl(key), "http://x");
      expect(url.pathname).toBe("/api/files"); // never a direct storage link
      const got = await readSignedFile(key, url.searchParams.get("exp")!, url.searchParams.get("sig")!);
      expect(got.buf.equals(PNG)).toBe(true);
      expect(got.type).toBe("image/png");
    } finally {
      for (const k of ["STORAGE_DRIVER", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET"]) delete process.env[k];
      server.close();
    }
  });

  it("creates the private bucket once if the project doesn't have it yet", async () => {
    const { createServer } = await import("node:http");
    let bucket: Record<string, unknown> | null = null;
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        if (req.url === "/storage/v1/bucket") {
          bucket = JSON.parse(Buffer.concat(chunks).toString());
          return res.writeHead(200).end("{}");
        }
        if (!bucket) return res.writeHead(400, { "content-type": "application/json" }).end('{"statusCode":"404","error":"Bucket not found","message":"Bucket not found"}');
        res.writeHead(200).end("{}");
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    const port = (server.address() as { port: number }).port;
    Object.assign(process.env, { STORAGE_DRIVER: "supabase", SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_SERVICE_ROLE_KEY: "service-key", SUPABASE_STORAGE_BUCKET: "kyc" });
    try {
      await expect(putFile("kyc/user1", PNG, "image/png")).resolves.toMatch(/\.png$/);
      expect(bucket).toMatchObject({ id: "kyc", public: false });
    } finally {
      for (const k of ["STORAGE_DRIVER", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET"]) delete process.env[k];
      server.close();
    }
  });
});
