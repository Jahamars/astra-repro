from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
import asyncpg

from database import get_conn
from models.schemas import (
    BuilderResultSubmit,
    DiffResultOut,
    RunCreate,
    RunDetail,
    RunOut,
)
from services.comparer import ComparerService, classify_diff, DiffSeverity

router = APIRouter(prefix="/runs", tags=["runs"])

_RUN_COLS = """
    vr.id, vr.package_version_id, vr.environment_id, vr.snapshot_id,
    vr.status, vr.hash_declared_at_run, vr.hash_rebuilt, vr.hashes_match,
    vr.source_date_epoch, vr.build_path, vr.queued_at, vr.started_at,
    vr.finished_at, vr.build_duration_seconds, vr.failure_reason, vr.triggered_by,
    p.name AS package_name, pv.version, pv.arch
"""

_RUN_JOIN = """
    FROM verification_runs vr
    JOIN package_versions pv ON pv.id = vr.package_version_id
    JOIN packages p           ON p.id  = pv.package_id
"""


async def _fetch_run_out(conn: asyncpg.Connection, run_id: str) -> RunOut | None:
    row = await conn.fetchrow(
        f"SELECT {_RUN_COLS} {_RUN_JOIN} WHERE vr.id = $1",
        run_id,
    )
    return RunOut(**dict(row)) if row else None


@router.post("", response_model=RunOut, status_code=201)
async def create_run(
    body: RunCreate,
    conn: asyncpg.Connection = Depends(get_conn),
):
    existing = await conn.fetchrow(
        """
        SELECT id FROM verification_runs
        WHERE package_version_id = $1 AND status IN ('PENDING', 'BUILDING')
        LIMIT 1
        """,
        body.package_version_id,
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Active run {existing['id']} already exists for this version",
        )

    pv = await conn.fetchrow(
        """
        SELECT pv.id, pv.hash_declared, pv.version, pv.arch, p.name AS package_name
        FROM package_versions pv
        JOIN packages p ON p.id = pv.package_id
        WHERE pv.id = $1
        """,
        body.package_version_id,
    )
    if pv is None:
        raise HTTPException(status_code=404, detail="Package version not found")

    row = await conn.fetchrow(
        """
        INSERT INTO verification_runs
            (package_version_id, environment_id, snapshot_id, hash_declared_at_run, triggered_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
            id, package_version_id, environment_id, snapshot_id,
            status, hash_declared_at_run, hash_rebuilt, hashes_match,
            source_date_epoch, build_path, queued_at, started_at, finished_at,
            build_duration_seconds, failure_reason, triggered_by
        """,
        body.package_version_id,
        body.environment_id,
        body.snapshot_id,
        pv["hash_declared"],
        body.triggered_by,
    )

    return RunOut(
        **dict(row),
        package_name=pv["package_name"],
        version=pv["version"],
        arch=pv["arch"],
    )


@router.get("/pending", response_model=RunOut | None)
async def get_next_pending(conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow(
        f"""
        SELECT {_RUN_COLS} {_RUN_JOIN}
        WHERE vr.status = 'PENDING'
        ORDER BY vr.queued_at ASC
        LIMIT 1
        FOR UPDATE OF vr SKIP LOCKED
        """
    )
    return RunOut(**dict(row)) if row else None


@router.put("/{run_id}/start", response_model=RunOut)
async def start_run(
    run_id: UUID,
    conn: asyncpg.Connection = Depends(get_conn),
):
    row = await conn.fetchrow(
        """
        UPDATE verification_runs SET status = 'BUILDING', started_at = NOW()
        WHERE id = $1 AND status = 'PENDING'
        RETURNING
            id, package_version_id, environment_id, snapshot_id,
            status, hash_declared_at_run, hash_rebuilt, hashes_match,
            source_date_epoch, build_path, queued_at, started_at, finished_at,
            build_duration_seconds, failure_reason, triggered_by
        """,
        str(run_id),
    )
    if row is None:
        raise HTTPException(status_code=409, detail="Run not found or not PENDING")

    pv = await conn.fetchrow(
        """
        SELECT p.name AS package_name, pv.version, pv.arch
        FROM package_versions pv JOIN packages p ON p.id = pv.package_id
        WHERE pv.id = $1
        """,
        row["package_version_id"],
    )
    return RunOut(**dict(row), **dict(pv))


@router.post("/{run_id}/result", response_model=dict)
async def submit_result(
    run_id: UUID,
    body: BuilderResultSubmit,
    conn: asyncpg.Connection = Depends(get_conn),
):
    try:
        return await ComparerService(conn).process_builder_result(str(run_id), body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{run_id}/diffs", response_model=dict)
async def submit_diffs(
    run_id: UUID,
    diffs: list[dict],
    conn: asyncpg.Connection = Depends(get_conn),
):
    run = await conn.fetchrow(
        "SELECT id, status FROM verification_runs WHERE id = $1", str(run_id)
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    if run["status"] not in ("NOT_REPRODUCIBLE", "NOT_REPRODUCIBLE_CRITICAL"):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot add diffs to run with status '{run['status']}'",
        )

    classified = []
    has_critical = False
    for d in diffs:
        cause, severity = classify_diff(d.get("file_path"), d.get("section_name"))
        if severity == DiffSeverity.CRITICAL:
            has_critical = True
        classified.append((
            str(run_id),
            d.get("file_path"),
            d.get("section_name"),
            cause.value,
            severity.value,
            d.get("description"),
            d.get("diffoscope_output"),
        ))

    new_status = "NOT_REPRODUCIBLE_CRITICAL" if has_critical else "NOT_REPRODUCIBLE"

    async with conn.transaction():
        await conn.execute("DELETE FROM diff_results WHERE run_id = $1", str(run_id))
        await conn.executemany(
            """
            INSERT INTO diff_results
                (run_id, file_path, section_name, cause, severity, description, diffoscope_output)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            classified,
        )
        await conn.execute(
            "UPDATE verification_runs SET status = $1 WHERE id = $2",
            new_status, str(run_id),
        )

    return {"run_id": str(run_id), "status": new_status, "diffs_saved": len(classified)}


@router.get("/{run_id}", response_model=RunDetail)
async def get_run(
    run_id: UUID,
    conn: asyncpg.Connection = Depends(get_conn),
):
    row = await conn.fetchrow(
        f"""
        SELECT {_RUN_COLS}, vr.build_log
        {_RUN_JOIN}
        WHERE vr.id = $1
        """,
        str(run_id),
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")

    diffs = await conn.fetch(
        """
        SELECT id, run_id, file_path, section_name, cause, severity, description, created_at
        FROM diff_results WHERE run_id = $1
        ORDER BY severity DESC, id
        """,
        str(run_id),
    )
    return RunDetail(**dict(row), diffs=[DiffResultOut(**dict(d)) for d in diffs])


@router.get("/{run_id}/diffs", response_model=list[DiffResultOut])
async def get_run_diffs(
    run_id: UUID,
    conn: asyncpg.Connection = Depends(get_conn),
):
    rows = await conn.fetch(
        """
        SELECT id, run_id, file_path, section_name, cause, severity, description, created_at
        FROM diff_results WHERE run_id = $1
        ORDER BY severity DESC, id
        """,
        str(run_id),
    )
    return [DiffResultOut(**dict(r)) for r in rows]
