from fastapi import APIRouter, Depends, HTTPException, Query
import asyncpg

from database import get_conn
from models.schemas import (
    PackageOut,
    PackageVersionCreate,
    PackageVersionOut,
    RunOut,
)

router = APIRouter(prefix="/packages", tags=["packages"])


@router.get("", response_model=list[dict])
async def list_packages(
    search: str | None = Query(default=None, description="Поиск по имени"),
    status: str | None = Query(default=None, description="Фильтр по статусу"),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    where_parts = []
    params = []
    idx = 1

    if search:
        where_parts.append(f"package_name ILIKE ${idx}")
        params.append(f"%{search}%")
        idx += 1

    if status:
        where_parts.append(f"status = ${idx}")
        params.append(status)
        idx += 1

    where_sql = ("WHERE " + " AND ".join(where_parts)) if where_parts else ""

    params += [limit, offset]

    rows = await conn.fetch(
        f"""
        SELECT *
        FROM v_latest_run_per_version
        {where_sql}
        ORDER BY package_name, version
        LIMIT ${idx} OFFSET ${idx + 1}
        """,
        *params,
    )

    return [dict(r) for r in rows]



@router.post("/versions", response_model=PackageVersionOut, status_code=201)
async def upsert_package_version(
    body: PackageVersionCreate,
    conn: asyncpg.Connection = Depends(get_conn),
):
    async with conn.transaction():
        pkg = await conn.fetchrow(
            """
            INSERT INTO packages (name, source_name)
            VALUES ($1, $2)
            ON CONFLICT (name) DO UPDATE
                SET source_name = EXCLUDED.source_name
            RETURNING id, name, source_name, created_at
            """,
            body.source_name or body.version.split("/")[-1],
            body.source_name,
        )

        version_row = await conn.fetchrow(
            """
            INSERT INTO package_versions
                (package_id, version, arch, filename, size_bytes,
                 hash_declared, depends, section, priority,
                 discovered_in_sync_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (package_id, version, arch) DO UPDATE SET
                hash_declared         = EXCLUDED.hash_declared,
                filename              = EXCLUDED.filename,
                size_bytes            = EXCLUDED.size_bytes,
                depends               = EXCLUDED.depends,
                last_seen_at          = NOW()
            RETURNING
                id, package_id, version, arch, filename, size_bytes,
                hash_declared, depends, section, priority,
                first_seen_at, last_seen_at
            """,
            pkg["id"],
            body.version,
            body.arch,
            body.filename,
            body.size_bytes,
            body.hash_declared,
            body.depends,
            body.section,
            body.priority,
            body.discovered_in_sync_id,
        )

    return PackageVersionOut(
        **dict(version_row),
        package_name=pkg["name"],
    )


@router.get("/{name}", response_model=dict)
async def get_package(
    name: str,
    conn: asyncpg.Connection = Depends(get_conn),
):
    rows = await conn.fetch(
        """
        SELECT *
        FROM v_latest_run_per_version
        WHERE package_name = $1
        ORDER BY version DESC
        """,
        name,
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"Package '{name}' not found")

    return {
        "package_name": name,
        "versions": [dict(r) for r in rows],
    }


@router.get("/{name}/history", response_model=list[dict])
async def get_package_history(
    name: str,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    rows = await conn.fetch(
        """
        SELECT *
        FROM v_package_history
        WHERE package_name = $1
        ORDER BY queued_at DESC
        LIMIT $2 OFFSET $3
        """,
        name,
        limit,
        offset,
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"Package '{name}' not found")

    return [dict(r) for r in rows]
