# AI RPG Engine — CLI image.
# Self-contained: builds the monorepo from source and exposes the `ai-rpg-engine`
# CLI as the entrypoint. `docker run ghcr.io/mcp-tool-shop-org/ai-rpg-engine --help`.

# --- build stage: compile the whole workspace ---
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY packages ./packages
COPY templates ./templates
RUN npm ci
RUN npm run build

# --- runtime stage: prod deps + built dist only ---
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
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
