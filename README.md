# Skooly - School Management Dashboard

A multi-tenant school management SaaS platform built with Next.js 14, Prisma, PostgreSQL, and Stripe.

## Documentation

- [System Design Analysis](SYSTEM_DESIGN.md) - Architecture, domain model, auth flow, and diagrams
- [Ecosystem Roadmap](ECOSYSTEM_ROADMAP.md) - Planned features and development roadmap

### Scheduling

- [Bell schedule implementation](docs/scheduling/BELL_SCHEDULE_IMPLEMENTATION.md) — phases, API, and strict grid (lessons + bell periods)
- [Documentation index](docs/README.md) — all docs by area
- [Scheduling assessment task board](SCHEDULING_ASSESSMENT_TASK_BOARD.md) — related roadmap and checklist items

## Getting Started

### Database (PostgreSQL)

Prisma expects `DATABASE_URL` in `.env` (copy from `.env.example`). The app needs a running PostgreSQL server.

**Option A — Docker (recommended for local dev)**

```bash
docker compose up -d postgres
# wait until healthy, then:
npx prisma migrate deploy
# or: npx prisma db push
```

Use:

`DATABASE_URL="postgresql://skooly:skooly@localhost:5432/skooly"`

**Option B — Homebrew / existing Postgres**

Install and start PostgreSQL, create a database, and set `DATABASE_URL` accordingly (often `localhost:5432`).

If you see `Can't reach database server at localhost:5432`, the server is not running or `DATABASE_URL` is wrong.

### Dev server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js](https://nextjs.org/learn)