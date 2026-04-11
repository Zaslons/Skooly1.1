# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

| Service | How to start | Port | Required? |
|---------|-------------|------|-----------|
| PostgreSQL 16 | `docker compose up -d postgres` | 5432 | Yes |
| Next.js dev server | `npm run dev` | 3000 | Yes |
| Timetable Solver (Python/FastAPI) | `docker compose up -d timetable-solver` | 8000 | No (feature-flagged) |

### Environment setup

- Copy `.env.example` to `.env`; the defaults work with the Dockerized Postgres (`postgresql://skooly:skooly@localhost:5432/skooly`).
- A `JWT_SECRET` env var is required for auth. Any non-empty string works for local dev (e.g. `JWT_SECRET=dev-jwt-secret-for-local-testing-only`).
- After starting Postgres, run `npx prisma migrate deploy && npx prisma generate` to apply migrations and generate the client.
- Seed with `npx prisma db seed` (uses `ts-node`). This creates 3 schools, teachers, students, parents, lessons, exams, etc.

### Login credentials (seeded)

All seeded accounts use password `Password123!`. Key accounts:
- `sysadmin` — system admin
- `admin1` — school admin (Springfield Academy)
- `teacher1`–`teacher15` — teachers
- `student1`–`student60` — students
- `parent1`–`parent30` — parents

### Common commands

See `package.json` scripts:
- **Lint:** `npm run lint`
- **Unit/integration tests:** `npm run test` (vitest)
- **E2E tests:** `npm run test:e2e` (Playwright; requires `npx playwright install` first)
- **Dev server:** `npm run dev`
- **Build:** `npm run build`

### Gotchas

- `npm run build` currently fails due to a pre-existing ESLint error in `BrowseNeedsClient.tsx` (unescaped apostrophe). The dev server (`npm run dev`) works fine.
- Docker must be running before starting the app; the Prisma client will fail to connect without Postgres.
- The Docker daemon in Cloud Agent VMs requires `fuse-overlayfs` storage driver and `iptables-legacy`. These are configured during initial setup.
