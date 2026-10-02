import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";

describe("database exposure", () => {
  it("every table has row-level security on (blocks Supabase's public data API)", async () => {
    const open = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`;
    // A new table needs: ALTER TABLE "<name>" ENABLE ROW LEVEL SECURITY; in its migration.
    expect(open.map((r) => r.relname)).toEqual([]);
  });
});
