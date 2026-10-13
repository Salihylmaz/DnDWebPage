# ─── Stage 1: Builder ────────────────────────────────────────────────────────
# We build TypeScript here so the final image contains only compiled JS.
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace manifests first (layer cache: deps only reinstall when package.json changes)
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/

# Install all dependencies (including devDeps needed for tsc)
RUN npm ci --workspace=server --workspace=shared --include-workspace-root

# Copy source
COPY shared/ ./shared/
COPY server/ ./server/

# Compile TypeScript → dist/
WORKDIR /app/server
RUN npx prisma generate
RUN npx tsc

# ─── Stage 2: Runner ─────────────────────────────────────────────────────────
# Lean production image — no devDeps, no source files.
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace manifests
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/

# Install only production deps
RUN npm ci --workspace=server --workspace=shared --include-workspace-root --omit=dev

# Copy compiled output and Prisma artifacts
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
# Prisma client is generated into node_modules; copy it from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3001

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy --schema=/app/server/prisma/schema.prisma && node /app/server/dist/index.js"]
