# AI RPG Engine — CLI image.
# Self-contained: builds the monorepo from source and exposes the `ai-rpg-engine`
# CLI as the entrypoint. `docker run ghcr.io/mcp-tool-shop-org/ai-rpg-engine --help`.

# Pinned to node:24: ci.yml's test matrix covers Node 22 (gate runner) and 24
# (current LTS). This image tracks the production LTS the matrix actually
# exercises — do not bump ahead of ci.yml.
#
# Digest last verified 2026-08-30 against Docker Hub tag 24-bookworm-slim
# (Node 24.20.0, index sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e,
# linux/amd64 + linux/arm64). Dependabot is a SHIP_GATE skip — re-verify
# this digest when bumping Node 24. Do not add dependabot.yml.

# --- build stage: compile the whole workspace ---
FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages
COPY templates ./templates
RUN npm ci
RUN npm run build

# --- runtime stage: prod deps + built dist only ---
FROM node:24-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS runtime
WORKDIR /app
# GIT_SHA is the CI build-arg (github.sha). VCS_REF is the OCI alias; created
# is SOURCE_DATE_EPOCH (ISO-8601 from the workflow when set).
ARG GIT_SHA=unknown
ARG VCS_REF
ARG SOURCE_DATE_EPOCH
LABEL org.opencontainers.image.source="https://github.com/mcp-tool-shop-org/ai-rpg-engine"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.created="${SOURCE_DATE_EPOCH}"
ENV NODE_ENV=production
# Bring the built workspace (each package's dist/) + manifests, then install only
# production deps (this re-creates the @ai-rpg-engine/* workspace symlinks the CLI
# resolves at runtime). No dev tooling (typescript/vitest) ships in the image.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/templates ./templates
RUN npm ci --omit=dev --ignore-scripts

# A non-root user for the runtime.
USER node
ENTRYPOINT ["node", "/app/packages/cli/dist/bin.js"]
CMD ["--help"]
