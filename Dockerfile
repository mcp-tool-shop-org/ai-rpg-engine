# AI RPG Engine — CLI image.
# Self-contained: builds the monorepo from source and exposes the `ai-rpg-engine`
# CLI as the entrypoint. `docker run ghcr.io/mcp-tool-shop-org/ai-rpg-engine --help`.

# Pinned to node:24: ci.yml's test matrix covers Node 22 (gate runner) and 24
# (current LTS). This image tracks the production LTS the matrix actually
# exercises — do not bump ahead of ci.yml.
#
# Digest last verified 2026-10-15 against Docker Hub tag 24-bookworm-slim
# (Node 24.22.0, index sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5,
# linux/amd64 + linux/arm64). Dependabot is a SHIP_GATE skip — re-verify
# this digest when bumping Node 24. Do not add dependabot.yml.

# --- build stage: compile the whole workspace ---
FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages
COPY templates ./templates
RUN npm ci
RUN npm run build

# --- runtime stage: prod deps + built dist only ---
FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS runtime
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

# The 2026-08-30 node:24-bookworm-slim digest shipped libpcre2 10.42-1;
# 10.42-1+deb12u1 closes CVE-2026-86145 / 89157 / 89161 (Trivy HIGH, fixed).
# The 2026-10-15 digest still ships perl-base 5.36.0-7+deb12u3; deb12u4 closes
# CVE-2026-13221 / 8376 / 42496 / 42497 / 48962 / 57432 / 57433 (Trivy HIGH and
# CRITICAL, fixed; 42496 / 42497 are perl's Archive::Tar). docker-smoke fails the
# job on fixable HIGH/CRITICAL OS packages. Drop a package from the list below
# once the base digest carries its fix.
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends --only-upgrade libpcre2-8-0 perl-base \
 && rm -rf /var/lib/apt/lists/*
USER node
ENTRYPOINT ["node", "/app/packages/cli/dist/bin.js"]
CMD ["--help"]
