# AGENTS.md

## Cursor Cloud specific instructions

### Overview
Skooly is a multi-tenant School Management Dashboard — a single Next.js 14 app (App Router) with PostgreSQL 15 (Prisma ORM), custom JWT auth, and optional Stripe integration.

### Services

| Service | Required | How to run |
|---------|----------|------------|
| PostgreSQL 15 | Yes | `sudo docker start postgres_db` (container already exists) or `sudo docker run -d --name postgres_db -e POSTGRES_USER=myuser -e POSTGRES_PASSWORD=mypassword -e POSTGRES_DB=mydb -p 5432:5432 postgres:15` |
| Next.js dev server | Yes | `npm run dev` (port 3000) |

### Database
- Connection string: `DATABASE_URL="postgresql://myuser:mypassword@localhost:5432/mydb"` (stored in `.env`)
- Migrations: `npx prisma migrate deploy`
- Seed: `npx prisma db seed` (creates sysadmin, sample school, teachers, students, parents, etc.)
- Generate client: `npx prisma generate`

### Standard commands
See `package.json` scripts: `npm run dev`, `npm run build`, `npm run lint`, `npm start`.

### Gotchas
- **Production build fails** due to pre-existing ESLint errors (`react/no-unescaped-entities` in several components). The dev server (`npm run dev`) works fine regardless.
- The sign-in API field is `identifier` (not `username`): `POST /api/auth/sign-in` with `{ "identifier": "admin1", "password": "admin1pass" }`.
- Docker runs inside a nested container (Firecracker VM). Use `fuse-overlayfs` storage driver and `iptables-legacy`. Docker daemon config is at `/etc/docker/daemon.json`.
- The `.env` file is not committed to the repo. It must be created manually with at least `DATABASE_URL` and `JWT_SECRET`.

### Test accounts (from seed)
| Role | Username | Password |
|------|----------|----------|
| System Admin | sysadmin | StrongPassword123! |
| Admin | admin1 | admin1pass |
| Teacher | teacher1 | teacher1pass |
| Student | student1 | student1pass |
| Parent | parent1 | parent1pass |
