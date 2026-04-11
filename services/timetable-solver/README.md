# Timetable feasibility solver (OR-Tools CP-SAT)

Small **FastAPI** service used by the Next.js app for Phase **F.2** feasibility-only placement (`POST /solve-feasibility`).

## Requirements

- Python 3.12+
- `TIMETABLE_SOLVER_SECRET` — shared with the Next.js app; requests must send `Authorization: Bearer <secret>`.

## Run locally

```bash
cd services/timetable-solver
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export TIMETABLE_SOLVER_SECRET=dev-secret
uvicorn main:app --reload --port 8000
```

## Docker

From the repository root:

```bash
docker compose build timetable-solver
docker compose up timetable-solver
```

Set `TIMETABLE_SOLVER_URL=http://localhost:8000` and `TIMETABLE_SOLVER_ENABLED=1` in the Next.js `.env`.

## API

- `GET /health` — no auth.
- `POST /solve-feasibility` — requires `Authorization: Bearer <TIMETABLE_SOLVER_SECRET>`.

Request body (JSON):

- `schemaVersion`: `1`
- `timeLimitSeconds`: `30` (server clamps to 120)
- `numTasks`, `candidatesPerTask` (length `numTasks`, each `>= 1`)
- `conflicts`: `[task_i, cand_i, task_j, cand_j]` with `task_i < task_j`

Response: `{ "ok": true, "choice": number[] }` or `{ "ok": false, "reason": "INFEASIBLE" | "TIMEOUT" | "INVALID" }`.

## Tests

```bash
pytest tests/ -q
```

(optional; CI may run TypeScript tests only.)
