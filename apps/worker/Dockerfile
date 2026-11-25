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
RUN apt-get update && apt-get install -y --no-install-recommends python3 util-linux ca-certificates tini curl xz-utils poppler-utils librsvg2-bin bubblewrap libxi6 libxrender1 libxfixes3 libxkbcommon0 libsm6 libgl1 libegl1 libfontconfig1 libx11-6 libxext6 libxrandr2 libxinerama1 libxcursor1 libdbus-1-3 libwayland-client0 && rm -rf /var/lib/apt/lists/*
# Versions match the existing ADVFX worker image.
ARG BLENDER_VERSION=4.5.14
RUN curl -fsSL "https://download.blender.org/release/Blender4.5/blender-${BLENDER_VERSION}-linux-x64.tar.xz" -o /tmp/blender.tar.xz \
    && mkdir -p /opt/blender \
    && tar -xJf /tmp/blender.tar.xz --strip-components=1 -C /opt/blender \
    && ln -s /opt/blender/blender /usr/local/bin/blender \
    && rm /tmp/blender.tar.xz
ARG THREEMF_ADDON_COMMIT=ddac1be1d728fa39cd5470d02d50f6fb0821198c
RUN mkdir -p /opt/3mf-addon \
    && curl -fsSL "https://github.com/Clonephaze/3MF-Blender-Add-on---Maintained/archive/${THREEMF_ADDON_COMMIT}.tar.gz" -o /tmp/3mf-addon.tar.gz \
    && tar -xzf /tmp/3mf-addon.tar.gz --strip-components=1 -C /opt/3mf-addon \
    && rm /tmp/3mf-addon.tar.gz \
    && test -f /opt/3mf-addon/io_mesh_3mf/api.py
RUN npm install --global @gltf-transform/cli@4.5.1 \
    && gltf-transform --version && blender --background --version
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
