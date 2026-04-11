"""
CP-SAT for timetable placement: feasibility + soft-objective optimize (Phase F.3).
POST /solve-feasibility — see docs/timetable/TIMETABLE_SOLVER_F2_IMPLEMENTATION_PLAN.md
POST /solve-optimize — see docs/timetable/TIMETABLE_SOLVER_PHASE_F_DESIGN.md §F.3
"""

import os
from typing import List, Literal, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
from ortools.sat.python import cp_model

app = FastAPI(title="Skooly timetable solver", version="1.0.0")

MAX_PAIRWISE_COEFF = 2_000_000


def _require_secret(authorization: Optional[str]) -> None:
    secret = os.environ.get("TIMETABLE_SOLVER_SECRET", "").strip()
    if not secret:
        raise HTTPException(
            status_code=503,
            detail="Timetable solver is not configured (missing TIMETABLE_SOLVER_SECRET).",
        )
    expected = f"Bearer {secret}"
    if not authorization or authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized.")


class SolveFeasibilityRequest(BaseModel):
    schemaVersion: int = 1
    timeLimitSeconds: float = Field(default=30.0, ge=0.1, le=120.0)
    numTasks: int = Field(ge=1)
    candidatesPerTask: List[int] = Field(min_length=1)
    conflicts: List[List[int]] = Field(default_factory=list)

    def validate_dims(self) -> None:
        if len(self.candidatesPerTask) != self.numTasks:
            raise ValueError("candidatesPerTask length must equal numTasks")
        for k in self.candidatesPerTask:
            if k < 1:
                raise ValueError("each candidatesPerTask entry must be >= 1")


class SolveFeasibilityOk(BaseModel):
    ok: Literal[True]
    choice: List[int]


class SolveFeasibilityFail(BaseModel):
    ok: Literal[False]
    reason: Literal["INFEASIBLE", "TIMEOUT", "INVALID"]


class PairwiseTerm(BaseModel):
    i: int = Field(ge=0)
    k: int = Field(ge=0)
    j: int = Field(ge=0)
    l: int = Field(ge=0)
    coeff: int = Field(ge=0, le=MAX_PAIRWISE_COEFF)


class SolveOptimizeRequest(BaseModel):
    schemaVersion: Literal[2] = 2
    timeLimitSeconds: float = Field(default=30.0, ge=0.1, le=120.0)
    numTasks: int = Field(ge=1)
    candidatesPerTask: List[int] = Field(min_length=1)
    conflicts: List[List[int]] = Field(default_factory=list)
    linearCost: Optional[List[List[int]]] = None
    pairwiseTerms: Optional[List[PairwiseTerm]] = None

    def validate_dims(self) -> None:
        if len(self.candidatesPerTask) != self.numTasks:
            raise ValueError("candidatesPerTask length must equal numTasks")
        for k in self.candidatesPerTask:
            if k < 1:
                raise ValueError("each candidatesPerTask entry must be >= 1")
        if self.linearCost is not None:
            if len(self.linearCost) != self.numTasks:
                raise ValueError("linearCost row count must equal numTasks")
            for i, row in enumerate(self.linearCost):
                if len(row) != self.candidatesPerTask[i]:
                    raise ValueError("linearCost row length must match candidatesPerTask[i]")


def _validate_conflict_row(
    body: SolveFeasibilityRequest | SolveOptimizeRequest, row: List[int]
) -> bool:
    if len(row) != 4:
        return False
    i, k, j, l = row
    if not (0 <= i < body.numTasks and 0 <= j < body.numTasks and i < j):
        return False
    if k < 0 or k >= body.candidatesPerTask[i] or l < 0 or l >= body.candidatesPerTask[j]:
        return False
    return True


def _validate_pairwise_term(body: SolveOptimizeRequest, t: PairwiseTerm) -> bool:
    if not (t.i < t.j):
        return False
    if not (0 <= t.i < body.numTasks and 0 <= t.j < body.numTasks):
        return False
    if t.k < 0 or t.k >= body.candidatesPerTask[t.i]:
        return False
    if t.l < 0 or t.l >= body.candidatesPerTask[t.j]:
        return False
    return True


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/solve-feasibility")
def solve_feasibility(
    body: SolveFeasibilityRequest,
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> SolveFeasibilityOk | SolveFeasibilityFail:
    _require_secret(authorization)
    try:
        body.validate_dims()
    except ValueError:
        return SolveFeasibilityFail(ok=False, reason="INVALID")

    for row in body.conflicts:
        if not _validate_conflict_row(body, row):
            return SolveFeasibilityFail(ok=False, reason="INVALID")

    model = cp_model.CpModel()
    num_tasks = body.numTasks
    x: list[list[cp_model.IntVar]] = []

    for i in range(num_tasks):
        ki = body.candidatesPerTask[i]
        row = [model.NewBoolVar(f"x_{i}_{k}") for k in range(ki)]
        x.append(row)
        model.Add(sum(row) == 1)

    for row in body.conflicts:
        i, k, j, l = row
        model.Add(x[i][k] + x[j][l] <= 1)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = body.timeLimitSeconds
    status = solver.Solve(model)

    if status == cp_model.INFEASIBLE:
        return SolveFeasibilityFail(ok=False, reason="INFEASIBLE")

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveFeasibilityFail(ok=False, reason="TIMEOUT")

    choice: List[int] = []
    for i in range(num_tasks):
        picked: Optional[int] = None
        for k in range(len(x[i])):
            if solver.Value(x[i][k]) == 1:
                picked = k
                break
        if picked is None:
            return SolveFeasibilityFail(ok=False, reason="INVALID")
        choice.append(picked)

    return SolveFeasibilityOk(ok=True, choice=choice)


@app.post("/solve-optimize")
def solve_optimize(
    body: SolveOptimizeRequest,
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> SolveFeasibilityOk | SolveFeasibilityFail:
    _require_secret(authorization)
    try:
        body.validate_dims()
    except ValueError:
        return SolveFeasibilityFail(ok=False, reason="INVALID")

    for row in body.conflicts:
        if not _validate_conflict_row(body, row):
            return SolveFeasibilityFail(ok=False, reason="INVALID")

    terms = body.pairwiseTerms or []
    for t in terms:
        if not _validate_pairwise_term(body, t):
            return SolveFeasibilityFail(ok=False, reason="INVALID")

    model = cp_model.CpModel()
    num_tasks = body.numTasks
    x: list[list[cp_model.IntVar]] = []

    for i in range(num_tasks):
        ki = body.candidatesPerTask[i]
        row = [model.NewBoolVar(f"x_{i}_{k}") for k in range(ki)]
        x.append(row)
        model.Add(sum(row) == 1)

    for row in body.conflicts:
        i, k, j, l = row
        model.Add(x[i][k] + x[j][l] <= 1)

    objective_terms: list[cp_model.LinearExpr] = []

    if body.linearCost is not None:
        for i in range(num_tasks):
            for k in range(body.candidatesPerTask[i]):
                c = body.linearCost[i][k]
                if c != 0:
                    objective_terms.append(c * x[i][k])

    for t in terms:
        z = model.NewBoolVar(f"z_{t.i}_{t.k}_{t.j}_{t.l}")
        model.Add(z <= x[t.i][t.k])
        model.Add(z <= x[t.j][t.l])
        model.Add(z >= x[t.i][t.k] + x[t.j][t.l] - 1)
        objective_terms.append(t.coeff * z)

    model.Minimize(sum(objective_terms) if objective_terms else 0)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = body.timeLimitSeconds
    status = solver.Solve(model)

    if status == cp_model.INFEASIBLE:
        return SolveFeasibilityFail(ok=False, reason="INFEASIBLE")

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return SolveFeasibilityFail(ok=False, reason="TIMEOUT")

    choice: List[int] = []
    for i in range(num_tasks):
        picked: Optional[int] = None
        for k in range(len(x[i])):
            if solver.Value(x[i][k]) == 1:
                picked = k
                break
        if picked is None:
            return SolveFeasibilityFail(ok=False, reason="INVALID")
        choice.append(picked)

    return SolveFeasibilityOk(ok=True, choice=choice)
