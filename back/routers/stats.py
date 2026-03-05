import json

from fastapi import APIRouter, Depends, HTTPException, Query
import asyncpg

from database import get_conn
from models.schemas import (
    CriticalIssueOut,
    MirrorSyncCreate,
    MirrorSyncOut,
    SnapshotCreate,
    SnapshotOut,
    SnapshotStatsOut,
    StatsOut,
    StatusStat,
)

router = APIRouter(tags=["stats & infra"])


@router.get("/stats", response_model=StatsOut)
async def get_stats(conn: asyncpg.Connection = Depends(get_conn)):
    totals = await conn.fetchrow(
        """
        SELECT
            (SELECT COUNT(*) FROM packages)          AS total_packages,
            (SELECT COUNT(*) FROM package_versions)  AS total_versions,
            (SELECT COUNT(*) FROM verification_runs) AS total_runs
        """
    )
    status_rows = await conn.fetch("SELECT * FROM v_status_stats")
    return StatsOut(
        total_packages=totals["total_packages"],
        total_versions=totals["total_versions"],
        total_runs=totals["total_runs"],
        by_status=[
            StatusStat(status=r["status"], total=r["total"], percentage=float(r["percentage"]))
            for r in status_rows
        ],
    )


@router.get("/stats/issues", response_model=list[CriticalIssueOut])
async def get_critical_issues(
    severity: str | None = Query(default=None, description="CRITICAL | MODERATE"),
    limit: int = Query(default=50, le=200),
    conn: asyncpg.Connection = Depends(get_conn),
):
    if severity:
        rows = await conn.fetch(
            "SELECT * FROM v_critical_issues WHERE severity = $1 LIMIT $2",
            severity, limit,
        )
    else:
        rows = await conn.fetch("SELECT * FROM v_critical_issues LIMIT $1", limit)
    return [CriticalIssueOut(**dict(r)) for r in rows]


@router.get("/stats/snapshots", response_model=list[SnapshotStatsOut])
async def get_snapshot_stats(
    limit: int = Query(default=20, le=100),
    conn: asyncpg.Connection = Depends(get_conn),
):
    rows = await conn.fetch("SELECT * FROM v_snapshot_runs LIMIT $1", limit)
    return [SnapshotStatsOut(**dict(r)) for r in rows]


@router.get("/stats/mirror", response_model=dict)
async def get_mirror_stats(conn: asyncpg.Connection = Depends(get_conn)):
    row = await conn.fetchrow(
        """
        SELECT
            COUNT(*)                                        AS total_versions,
            COUNT(*) FILTER (WHERE mirror_ok = TRUE)       AS mirror_ok,
            COUNT(*) FILTER (WHERE mirror_ok = FALSE)      AS mirror_tampered,
            COUNT(*) FILTER (WHERE mirror_ok IS NULL)      AS mirror_unchecked
        FROM package_versions
        """
    )
    return dict(row)


@router.get("/mirror/syncs", response_model=list[MirrorSyncOut])
async def list_syncs(
    limit: int = Query(default=20, le=100),
    conn: asyncpg.Connection = Depends(get_conn),
):
    rows = await conn.fetch(
        "SELECT * FROM mirror_sync_log ORDER BY synced_at DESC LIMIT $1", limit
    )
    return [MirrorSyncOut(**dict(r)) for r in rows]


@router.post("/mirror/syncs", response_model=MirrorSyncOut, status_code=201)
async def create_sync(
    body: MirrorSyncCreate,
    conn: asyncpg.Connection = Depends(get_conn),
):
    mirror = await conn.fetchrow("SELECT id FROM mirror WHERE is_active = TRUE LIMIT 1")
    if mirror is None:
        raise HTTPException(status_code=404, detail="No active mirror configured")

    row = await conn.fetchrow(
        """
        INSERT INTO mirror_sync_log
            (mirror_id, packages_total, packages_new, packages_updated,
             gpg_valid, packages_file_hash, error_message)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        """,
        mirror["id"],
        body.packages_total,
        body.packages_new,
        body.packages_updated,
        body.gpg_valid,
        body.packages_file_hash,
        body.error_message,
    )
    return MirrorSyncOut(**dict(row))


@router.post("/snapshots", response_model=SnapshotOut, status_code=201)
async def create_snapshot(
    body: SnapshotCreate,
    conn: asyncpg.Connection = Depends(get_conn),
):
    existing = await conn.fetchrow(
        """
        SELECT id, git_commit_sha, git_ref, file_path, package_names, created_at
        FROM package_list_snapshots
        WHERE git_commit_sha = $1 AND file_path = $2
        """,
        body.git_commit_sha, body.file_path,
    )
    if existing:
        return SnapshotOut(**dict(existing), package_names=list(existing["package_names"]))

    row = await conn.fetchrow(
        """
        INSERT INTO package_list_snapshots
            (git_commit_sha, git_ref, file_path, raw_content, package_names)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        RETURNING id, git_commit_sha, git_ref, file_path, package_names, created_at
        """,
        body.git_commit_sha,
        body.git_ref,
        body.file_path,
        body.raw_content,
        json.dumps(body.package_names),
    )
    return SnapshotOut(**dict(row), package_names=list(row["package_names"]))


@router.get("/snapshots/{snapshot_id}/runs", response_model=list[dict])
async def get_snapshot_runs(
    snapshot_id: int,
    conn: asyncpg.Connection = Depends(get_conn),
):
    snap = await conn.fetchrow(
        "SELECT id FROM package_list_snapshots WHERE id = $1", snapshot_id
    )
    if snap is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    rows = await conn.fetch(
        """
        SELECT vr.id, vr.status, vr.hashes_match,
               vr.hash_declared_at_run, vr.hash_rebuilt,
               vr.queued_at, vr.finished_at, vr.build_duration_seconds,
               vr.failure_reason,
               p.name AS package_name, pv.version, pv.arch
        FROM verification_runs vr
        JOIN package_versions pv ON pv.id = vr.package_version_id
        JOIN packages p          ON p.id  = pv.package_id
        WHERE vr.snapshot_id = $1
        ORDER BY vr.queued_at
        """,
        snapshot_id,
    )
    return [dict(r) for r in rows]
