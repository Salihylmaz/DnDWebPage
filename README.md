# ⚔️ DnD Session Manager

A web app for Dungeons & Dragons groups. DMs create sessions, share an invite link, and everyone can view items, character sheets, and session notes from their phone.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, React Router v6, TanStack Query v5, Tailwind CSS v3 |
| Backend | Node.js, TypeScript, Express |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT (httpOnly cookie) + argon2 |
| Realtime | Socket.IO |

## Prerequisites

- Node.js 22+
- PostgreSQL running locally (or a hosted instance)

## Getting Started

### Option A — Docker (Recommended ✅)

The fastest way. You only need Docker Desktop installed.

```bash
git clone <repo-url>
cd dnd-session-manager

# 1. Start PostgreSQL in Docker
docker compose up -d db

# 2. Configure server env
copy server\.env.example server\.env
# Edit server/.env — the DATABASE_URL is already set for Docker:
# DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dnd_session_manager"

# 3. Install deps & run migrations
npm install
npm run db:migrate --workspace=server

# 4. Start server + client (hot-reload)
npm run dev
```

### Option B — Everything in Docker (no local Node needed)

```bash
docker compose --profile full up
```

### Production Deploy

- This project needs a VPS (or another host that runs Docker Compose), PostgreSQL, and a domain. GitHub Pages alone cannot run its Express API, database, and Socket.IO server.
- Point the domain's DNS `A` record at the VPS and allow inbound TCP ports 80/443. Caddy obtains and renews HTTPS certificates automatically.
- On the VPS, clone this repository to `/home/ubuntu/DnDWebPage`, copy `.env.prod.example` to `.env`, then set `APP_DOMAIN`, the matching `CLIENT_ORIGIN=https://<your-domain>`, a strong unique `POSTGRES_PASSWORD`, and a random `JWT_SECRET` (for example, generate one with `openssl rand -hex 32`). Keep `.env` only on the VPS.
- Pushes to `main` run CI to generate the Prisma client and build the server/client. Production deployment is manual: add `VPS_HOST`, `VPS_USER`, and `VPS_SSH_KEY` under GitHub repository **Settings → Secrets and variables → Actions**, then run **Deploy to Production** from Actions. The VPS SSH public key must be in `authorized_keys` for that user, and that user must be able to run Docker with `sudo`.
- The deploy workflow updates `/home/ubuntu/DnDWebPage` and runs `sudo docker compose -f docker-compose.prod.yml up -d --build --remove-orphans`. The server container applies Prisma migrations before starting.
- Check the VPS with `docker compose -f docker-compose.prod.yml ps` and `docker compose -f docker-compose.prod.yml logs -f server proxy`.

### Sign-in provider setup

- Google sign-in uses Google Identity Services. Create a **Web application** OAuth client in Google Cloud and add your site as an authorized JavaScript origin (for this deployment: `https://dndoturumlari.duckdns.org`). Put the client ID in `GOOGLE_CLIENT_ID` in the VPS `.env`; it is also passed into the Vite build. No Google client secret is used by this sign-in flow.
- Email/password registration requires a working SMTP sender. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, and `APP_BASE_URL` in the VPS `.env`. Use port 465 for implicit TLS or 587 for STARTTLS. The app sends a single-use verification link that expires after 24 hours.
- If SMTP is not configured, email/password registration fails closed and Google sign-in remains available when `GOOGLE_CLIENT_ID` is configured. After changing these values, rebuild and restart with `docker compose -f docker-compose.prod.yml up -d --build`.

## Useful Commands

```bash
npm run dev:server          # Start only the backend
npm run dev:client          # Start only the frontend
npm run db:studio --workspace=server   # Open Prisma Studio (DB GUI)
npm run db:migrate --workspace=server  # Run pending migrations
npm run db:generate --workspace=server # Regenerate Prisma client after schema change
```

## Project Structure

```
dnd-session-manager/
├── client/          # React + Vite frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   └── ...
├── server/          # Express backend
│   ├── src/
│   │   ├── index.ts      # Entry point
│   │   ├── app.ts        # Express + Socket.IO setup
│   │   └── lib/
│   │       ├── prisma.ts  # Prisma singleton
│   │       └── env.ts     # Env validation
│   ├── prisma/
│   │   └── schema.prisma
│   └── ...
└── shared/          # Shared TypeScript types
    └── src/index.ts
```

## Build Order Progress

- [x] Step 1 — Project setup, Prisma, DB connection
- [x] Step 2 — Auth (register, login, logout, /me)
- [x] Step 3 — Sessions & invite codes
- [x] Step 4 — Items (DM CRUD, player read-only, search)
- [x] Step 5 — Character sheets & stats (`playersCanEditStats` enforced)
- [x] Step 6 — Middleware tests (11 passing — Jest + Supertest)
- [x] Step 7 — Traits & notes (per character, owner/DM only)
- [x] Step 8 — Realtime with Socket.IO (item/character/stat/trait events)
- [x] Step 9 — Mobile-first UI, README, Docker deployment ready

## API Overview

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/api/auth/register` | Public |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/logout` | Auth |
| GET | `/api/auth/me` | Auth |
| POST | `/api/sessions` | Auth |
| GET | `/api/sessions` | Auth |
| POST | `/api/sessions/join` | Auth |
| GET | `/api/sessions/:id` | Member |
| PATCH | `/api/sessions/:id/settings` | DM |
| GET | `/api/sessions/:id/members` | Member |
| DELETE | `/api/sessions/:id/members/:userId` | DM |
| GET | `/api/sessions/:id/items` | Member |
| POST | `/api/sessions/:id/items` | DM |
| PATCH | `/api/sessions/:id/items/:itemId` | DM |
| DELETE | `/api/sessions/:id/items/:itemId` | DM |
| GET | `/api/sessions/:id/characters` | Member |
| POST | `/api/sessions/:id/characters` | Member |
| PATCH | `/api/sessions/:id/characters/:charId` | Owner/DM |
| DELETE | `/api/sessions/:id/characters/:charId` | DM |
| PUT | `/api/sessions/:id/characters/:charId/stats` | Owner\*/DM |
| GET | `/api/sessions/:id/characters/:charId/traits` | Member |
| POST | `/api/sessions/:id/characters/:charId/traits` | Owner/DM |
| PATCH | `/api/sessions/:id/characters/:charId/traits/:traitId` | Owner/DM |
| DELETE | `/api/sessions/:id/characters/:charId/traits/:traitId` | Owner/DM |

> \* Owner can edit stats only if `playersCanEditStats = true` on the session.

## Running Tests

```bash
# Make sure Docker DB is running first
docker compose up -d db

cd server
npm test        # Run all tests once
npm run test:watch  # Watch mode
```

## Socket.IO Events

The server emits these events to session rooms (`session:<id>`):

| Event | Payload |
|-------|---------|
| `item:created` | Full item object |
| `item:updated` | Full item object |
| `item:deleted` | `{ id, sessionId }` |
| `character:created` | Full character object |
| `character:deleted` | `{ id, sessionId }` |
| `stat:updated` | `{ characterId, sessionId }` |
| `trait:created` | Full trait object |
| `trait:updated` | Full trait object |
| `trait:deleted` | `{ id, characterId, sessionId }` |
