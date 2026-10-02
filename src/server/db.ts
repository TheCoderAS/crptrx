import { PrismaClient } from "@prisma/client";

/**
 * Hosted Postgres poolers cap connections (Supabase free: 15 in session mode),
 * and Prisma otherwise opens one per CPU core x2 + 1. So every process gets a
 * small pool: DB_POOL_SIZE if set (the start script sets it per process),
 * else the URL's connection_limit, else 5.
 */
function databaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    const size = process.env.DB_POOL_SIZE || u.searchParams.get("connection_limit") || "5";
    u.searchParams.set("connection_limit", size);
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "20");
    return u.toString();
  } catch {
    return raw; // let Prisma report a malformed URL itself
  }
}

// One client (and so one pool) per process, even when the server bundle loads
// this module more than once (Next.js splits routes into separate chunks).
const g = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma = (g.__prisma ??= makeClient());

// DB_LOG_QUERIES=1 prints every query with its time: for finding slow pages.
function makeClient() {
  if (process.env.DB_LOG_QUERIES !== "1") return new PrismaClient({ datasourceUrl: databaseUrl() });
  const c = new PrismaClient({ datasourceUrl: databaseUrl(), log: [{ emit: "event", level: "query" }] });
  c.$on("query", (e) => console.log(`[db] ${e.duration}ms ${e.query.slice(0, 160)}`));
  return c;
}

export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
