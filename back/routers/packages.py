from fastapi import APIRouter, Depends, HTTPException, Query
import asyncpg

from database import get_conn
from models.schemas import PackageVersionCreate, PackageVersionOut

router = APIRouter(prefix="/packages", tags=["packages"])


@router.get("", response_model=list[dict])
async def list_packages(
    search: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    where, params = [], []

    if search:
        where.append(f"package_name ILIKE ${len(params) + 1}")
        params.append(f"%{search}%")

    if status:
        where.append(f"status = ${len(params) + 1}")
        params.append(status)

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    params += [limit, offset]

    rows = await conn.fetch(
        f"""
        SELECT * FROM v_latest_run_per_version
        {where_sql}
        ORDER BY package_name, version
        LIMIT ${len(params) - 1} OFFSET ${len(params)}
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
            ON CONFLICT (name) DO UPDATE SET
                source_name = COALESCE(EXCLUDED.source_name, packages.source_name)
            RETURNING id, name, source_name
            """,
            body.name,
            body.source_name,
        )

        pv = await conn.fetchrow(
            """
            INSERT INTO package_versions
                (package_id, version, arch, filename, size_bytes,
                 hash_declared, hash_download, depends, section, priority,
                 discovered_in_sync_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (package_id, version, arch) DO UPDATE SET
                hash_declared         = EXCLUDED.hash_declared,
                hash_download         = COALESCE(EXCLUDED.hash_download, package_versions.hash_download),
                filename              = EXCLUDED.filename,
                size_bytes            = COALESCE(EXCLUDED.size_bytes, package_versions.size_bytes),
                depends               = COALESCE(EXCLUDED.depends, package_versions.depends),
                last_seen_at          = NOW()
            RETURNING
                id, package_id, version, arch, filename, size_bytes,
                hash_declared, hash_download, mirror_ok, depends, section, priority,
                first_seen_at, last_seen_at
            """,
            pkg["id"],
            body.version,
            body.arch,
            body.filename,
            body.size_bytes,
            body.hash_declared,
            body.hash_download,
            body.depends,
            body.section,
            body.priority,
            body.discovered_in_sync_id,
        )

    return PackageVersionOut(
        **dict(pv),
        package_name=pkg["name"],
        source_name=pkg["source_name"],
    )


@router.get("/{name}", response_model=dict)
async def get_package(
    name: str,
    conn: asyncpg.Connection = Depends(get_conn),
):
    rows = await conn.fetch(
        """
        SELECT * FROM v_latest_run_per_version
        WHERE package_name = $1
        ORDER BY version DESC
        """,
        name,
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"Package '{name}' not found")

    return {"package_name": name, "versions": [dict(r) for r in rows]}


@router.get("/{name}/history", response_model=list[dict])
async def get_package_history(
    name: str,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0),
    conn: asyncpg.Connection = Depends(get_conn),
):
    rows = await conn.fetch(
        """
        SELECT * FROM v_package_history
        WHERE package_name = $1
        ORDER BY queued_at DESC
        LIMIT $2 OFFSET $3
        """,
        name, limit, offset,
    )
    if not rows:
        raise HTTPException(status_code=404, detail=f"Package '{name}' not found")

    return [dict(r) for r in rows]
