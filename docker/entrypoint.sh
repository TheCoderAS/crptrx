#!/bin/sh
# Usage: entrypoint web | worker | migrate | seed
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

case "${1:-web}" in
  web)
    migrate
    npx tsx prisma/seed.ts
    exec npx next start -p "${PORT:-3000}"
    ;;
  worker)
    migrate
    exec npx tsx src/worker/index.ts
    ;;
  migrate) migrate ;;
  seed) npx tsx prisma/seed.ts ;;
  *) exec "$@" ;;
esac
