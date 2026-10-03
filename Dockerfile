# syntax=docker/dockerfile:1
# One image runs both the web app ("web") and the background worker ("worker").

FROM node:22-bookworm-slim AS base
# Prisma's query engine links against the system OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
# Build needs no real database or secrets: every page is rendered at request time.
ENV NEXT_TELEMETRY_DISABLED=1 DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npx prisma generate && npx next build && rm -rf .next/cache

# Drop dev tools but keep the generated Prisma client (no second download).
FROM build AS prod-deps
RUN npm prune --omit=dev && npm cache clean --force && rm -rf node_modules/@next/swc-linux-*-musl

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 STORAGE_LOCAL_DIR=/app/.data/uploads
RUN groupadd -r app && useradd -r -g app -d /app app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY package.json next.config.ts tsconfig.json server.ts ./
COPY prisma ./prisma
COPY src ./src
COPY docker/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint && mkdir -p /app/.data && chown -R app:app /app/.data /app/.next
USER app
VOLUME ["/app/.data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || exit 1
# Run with an init process (compose sets `init: true`; plain docker: `docker run --init`).
ENTRYPOINT ["entrypoint"]
CMD ["web"]
