-- Hosted Postgres such as Supabase publishes every table in the "public" schema
-- through a web API reachable with the project's public key. Row-level security
-- with no policies blocks that API completely. The app connects as the table
-- owner, which bypasses RLS, so the app itself is unaffected (and on a plain
-- Postgres this changes nothing). New tables must do the same: see
-- tests/db-security.test.ts.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
