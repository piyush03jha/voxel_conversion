FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY apps/api/package*.json apps/api/
# Phase 2 lockfile must be refreshed in a network-enabled environment before release.
RUN npm install --prefix apps/api --no-audit --no-fund
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src
COPY apps/worker/src apps/worker/src
COPY packages/shared packages/shared
RUN npm run build --prefix apps/api && npm prune --omit=dev --prefix apps/api

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 util-linux ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app/apps/api
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY apps/worker/scripts /app/apps/worker/scripts
ENV NODE_ENV=production
ENV WORKER_SCRIPTS_DIR=/app/apps/worker/scripts
ENV WORKER_TEMP_DIR=/tmp
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/apps/worker/src/main.js"]
