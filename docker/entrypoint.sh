#!/bin/sh
# Usage: entrypoint web | worker | all | migrate | seed
#   all = web + worker in one container (single-service hosts such as Render)
set -e
cd /app

# For test phases: if ENCRYPTION_KEY isn't given, generate one once and keep it
# in the shared data volume so the web app and worker use the same key.
# Production must pass ENCRYPTION_KEY from a secret store instead.
SECRETS=/app/.data/secrets.env
if [ -z "$ENCRYPTION_KEY" ] && [ "${AUTO_GENERATE_SECRETS:-false}" = "true" ]; then
  if [ ! -f "$SECRETS" ]; then
    KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    LINK=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    # noclobber makes creation atomic if web and worker start together.
    ( set -C; printf 'ENCRYPTION_KEY=%s\nLINK_SIGNING_SECRET=%s\n' "$KEY" "$LINK" > "$SECRETS" ) 2>/dev/null || true
    chmod 600 "$SECRETS" 2>/dev/null || true
  fi
  set -a; . "$SECRETS"; set +a
fi
if [ -z "$ENCRYPTION_KEY" ]; then
  echo "ENCRYPTION_KEY is not set. Set it (64 hex chars), or AUTO_GENERATE_SECRETS=true for test setups." >&2
  exit 1
fi
# Links in emails, share previews and search results are built from APP_URL.
if [ -z "$APP_URL" ]; then
  if [ "${AUTO_GENERATE_SECRETS:-false}" = "true" ]; then
    echo "APP_URL is not set; using http://localhost:3000 (fine for local testing only)." >&2
  else
    echo "APP_URL is not set. Set it to the public https:// address of the site." >&2
    exit 1
  fi
fi

migrate() {
  # Retry while the database starts up. prisma migrate deploy is safe to run from several containers.
  for i in $(seq 1 30); do
    if npx prisma migrate deploy; then return 0; fi
    echo "Database not ready, retrying ($i/30)..."; sleep 2
  done
  echo "Could not run migrations" >&2; exit 1
}

seed() {
  # Retry: during a redeploy the old copy may still hold database connections for a moment.
  for i in $(seq 1 10); do
    if npx tsx prisma/seed.ts; then return 0; fi
    echo "Seed failed, retrying ($i/10)..."; sleep 3
  done
  echo "Could not seed the database" >&2; exit 1
}

# Start node directly (no npx/npm wrapper processes): saves ~200 MB, which
# matters on small hosts such as Render's free 512 MB plan.
WEB="node node_modules/next/dist/bin/next start -p ${PORT:-3000}"
WORKER="node --import tsx src/worker/index.ts"

case "${1:-web}" in
  web)
    migrate
    seed
    exec $WEB
    ;;
  worker)
    migrate
    exec $WORKER
    ;;
  all)
    migrate
    seed
    # One container, two processes sharing the database limit: website 4
    # connections, watcher 3. Old and new copies
    # overlapping during a redeploy still stay under Supabase's 15.
    ( while true; do DB_POOL_SIZE="${DB_POOL_SIZE_WORKER:-3}" $WORKER; echo "worker exited, restarting in 5s" >&2; sleep 5; done ) &
    export DB_POOL_SIZE="${DB_POOL_SIZE_WEB:-4}"
    exec $WEB
    ;;
  migrate) migrate ;;
  seed) seed ;;
  *) exec "$@" ;;
esac
