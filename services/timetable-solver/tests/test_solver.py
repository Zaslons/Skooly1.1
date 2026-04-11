"""Minimal tests for CP-SAT feasibility endpoint."""

import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["TIMETABLE_SOLVER_SECRET"] = "test-secret"

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from main import app  # noqa: E402

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_solve_requires_auth():
    r = client.post(
        "/solve-feasibility",
        json={
            "numTasks": 1,
            "candidatesPerTask": [2],
            "conflicts": [],
        },
    )
    assert r.status_code == 401


def test_solve_two_tasks_feasible():
    r = client.post(
        "/solve-feasibility",
        json={
            "numTasks": 2,
            "candidatesPerTask": [2, 2],
            "conflicts": [],
        },
        headers={"Authorization": "Bearer test-secret"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert len(data["choice"]) == 2
    assert data["choice"][0] in (0, 1)
    assert data["choice"][1] in (0, 1)


def test_solve_infeasible():
    r = client.post(
        "/solve-feasibility",
        json={
            "numTasks": 2,
            "candidatesPerTask": [1, 1],
            "conflicts": [[0, 0, 1, 0]],
        },
        headers={"Authorization": "Bearer test-secret"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is False
    assert data["reason"] == "INFEASIBLE"


def test_solve_optimize_requires_auth():
    r = client.post(
        "/solve-optimize",
        json={
            "schemaVersion": 2,
            "numTasks": 1,
            "candidatesPerTask": [2],
            "conflicts": [],
        },
    )
    assert r.status_code == 401


def test_solve_optimize_prefers_lower_linear_cost():
    """Two feasible full assignments; objective picks unique minimum-sum assignment."""
    r = client.post(
        "/solve-optimize",
        json={
            "schemaVersion": 2,
            "numTasks": 2,
            "candidatesPerTask": [2, 2],
            "conflicts": [],
            # Unique optimum at [0,0]: cost 1+1=2; all other corners are >= 11.
            "linearCost": [[1, 10], [1, 10]],
        },
        headers={"Authorization": "Bearer test-secret"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["choice"] == [0, 0]


def test_solve_optimize_pairwise_prefers_avoiding_high_product():
    """Pairwise z penalizes (0,0)+(1,0); cheaper to pick other candidates."""
    r = client.post(
        "/solve-optimize",
        json={
            "schemaVersion": 2,
            "numTasks": 2,
            "candidatesPerTask": [2, 2],
            "conflicts": [],
            "linearCost": [[0, 0], [0, 0]],
            "pairwiseTerms": [{"i": 0, "k": 0, "j": 1, "l": 0, "coeff": 1000}],
        },
        headers={"Authorization": "Bearer test-secret"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["choice"] != [0, 0]


def test_solve_optimize_infeasible_hard_constraints():
    r = client.post(
        "/solve-optimize",
        json={
            "schemaVersion": 2,
            "numTasks": 2,
            "candidatesPerTask": [1, 1],
            "conflicts": [[0, 0, 1, 0]],
            "linearCost": [[0], [0]],
        },
        headers={"Authorization": "Bearer test-secret"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is False
    assert data["reason"] == "INFEASIBLE"
