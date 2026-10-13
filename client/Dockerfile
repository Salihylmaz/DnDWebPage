# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY client/package.json ./client/

RUN npm ci --workspace=client --workspace=shared --include-workspace-root

COPY shared/ ./shared/
COPY client/ ./client/

WORKDIR /app/client
# Build the static bundle (output: /app/client/dist)
RUN npm run build

# ─── Stage 2: Nginx ──────────────────────────────────────────────────────────
# Serve the built SPA with Nginx. Nginx also handles API proxying in production.
FROM nginx:1.27-alpine AS runner

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom config
COPY client/nginx.conf /etc/nginx/conf.d/app.conf

# Copy the built static files
COPY --from=builder /app/client/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
