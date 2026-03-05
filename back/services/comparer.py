from __future__ import annotations

import asyncpg

from models.schemas import (
    BuilderResultSubmit,
    DiffResultCreate,
    DiffCause,
    DiffSeverity,
    VerificationStatus,
)



_CRITICAL_SECTIONS = {".text", ".rodata", ".data", ".plt", ".got"}


_MODERATE_SECTIONS = {".data.rel.ro", ".dynamic", ".init", ".fini"}


_NOISE_CAUSES = {DiffCause.TIMESTAMP, DiffCause.BUILD_PATH, DiffCause.FILE_ORDER, DiffCause.UID_GID}


def _classify_diff(file_path: str | None, section_name: str | None) -> tuple[DiffCause, DiffSeverity]:
    
    sec = (section_name or "").lower()
    path = (file_path or "").lower()


    if any(s in path for s in ("preinst", "postinst", "prerm", "postrm", "debian/control")):
        return DiffCause.SCRIPT, DiffSeverity.CRITICAL


    if sec in _CRITICAL_SECTIONS:
        return DiffCause.CODE_SECTION, DiffSeverity.CRITICAL


    if sec in _MODERATE_SECTIONS:
        return DiffCause.DATA_SECTION, DiffSeverity.MODERATE


    if sec.startswith(".debug") or sec in (".gnu_debuglink", ".gnu_debugdata"):
        return DiffCause.DEBUG_SECTION, DiffSeverity.NOISE


    if sec in (".strtab", ".dynstr", ".shstrtab", ".debug_str"):
        return DiffCause.BUILD_PATH, DiffSeverity.NOISE


    if sec in ("mtime", "timestamp", "builddate") or "time" in sec:
        return DiffCause.TIMESTAMP, DiffSeverity.NOISE


    if sec in ("file_order", "order"):
        return DiffCause.FILE_ORDER, DiffSeverity.NOISE
    if sec in ("uid", "gid", "uid_gid"):
        return DiffCause.UID_GID, DiffSeverity.NOISE

    return DiffCause.UNKNOWN, DiffSeverity.NOISE


def _determine_status(
    hash_declared: str,
    hash_rebuilt: str | None,
    failure_reason: str | None,
    diffs: list[DiffResultCreate],
) -> VerificationStatus:
    """
          hash_rebuilt is None AND failure_reason → BUILD_FAILED
          hash_rebuilt is None                   → UNVERIFIABLE
          D == R                                 → VERIFIED
          D != R AND есть CRITICAL diff          → NOT_REPRODUCIBLE_CRITICAL
          D != R                                 → NOT_REPRODUCIBLE
    """
    if hash_rebuilt is None:
        if failure_reason:
            return VerificationStatus.BUILD_FAILED
        return VerificationStatus.UNVERIFIABLE

    if hash_declared == hash_rebuilt:
        return VerificationStatus.VERIFIED


    has_critical = any(d.severity == DiffSeverity.CRITICAL for d in diffs)
    if has_critical:
        return VerificationStatus.NOT_REPRODUCIBLE_CRITICAL

    return VerificationStatus.NOT_REPRODUCIBLE


class ComparerService:
    

    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    async def process_builder_result(
        self,
        run_id: str,
        result: BuilderResultSubmit,
        raw_diffs: list[dict] | None = None,
    ) -> dict:
        
        async with self.conn.transaction():

            run = await self.conn.fetchrow(
                """
                SELECT vr.id, vr.status, vr.hash_declared_at_run,
                       pv.version, p.name AS package_name
                FROM verification_runs vr
                JOIN package_versions pv ON pv.id = vr.package_version_id
                JOIN packages p ON p.id = pv.package_id
                WHERE vr.id = $1
                FOR UPDATE
                """,
                run_id,
            )

            if run is None:
                raise ValueError(f"Run {run_id} not found")

            if run["status"] not in ("PENDING", "BUILDING"):
                raise ValueError(
                    f"Run {run_id} is in status '{run['status']}', expected BUILDING"
                )


            classified_diffs: list[DiffResultCreate] = []

            if raw_diffs and result.hash_rebuilt:
                hash_declared = run["hash_declared_at_run"]


                if hash_declared != result.hash_rebuilt:
                    for diff in raw_diffs:
                        cause, severity = _classify_diff(
                            diff.get("file_path"),
                            diff.get("section_name"),
                        )
                        classified_diffs.append(
                            DiffResultCreate(
                                file_path=diff.get("file_path"),
                                section_name=diff.get("section_name"),
                                cause=cause,
                                severity=severity,
                                description=diff.get("description"),
                                diffoscope_output=diff.get("diffoscope_output"),
                            )
                        )


            status = _determine_status(
                hash_declared=run["hash_declared_at_run"],
                hash_rebuilt=result.hash_rebuilt,
                failure_reason=result.failure_reason,
                diffs=classified_diffs,
            )


            await self.conn.execute(
                """
                UPDATE verification_runs SET
                    status             = $1,
                    hash_rebuilt       = $2,
                    build_log          = $3,
                    failure_reason     = $4,
                    source_date_epoch  = $5,
                    build_path         = $6,
                    finished_at        = NOW()
                WHERE id = $7
                """,
                status.value,
                result.hash_rebuilt,
                result.build_log,
                result.failure_reason,
                result.source_date_epoch,
                result.build_path,
                run_id,
            )


            if classified_diffs:
                await self.conn.executemany(
                    """
                    INSERT INTO diff_results
                        (run_id, file_path, section_name, cause, severity, description, diffoscope_output)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """,
                    [
                        (
                            run_id,
                            d.file_path,
                            d.section_name,
                            d.cause.value,
                            d.severity.value,
                            d.description,
                            d.diffoscope_output,
                        )
                        for d in classified_diffs
                    ],
                )

        return {
            "run_id": run_id,
            "status": status.value,
            "hashes_match": result.hash_rebuilt == run["hash_declared_at_run"]
            if result.hash_rebuilt else None,
            "diffs_count": len(classified_diffs),
        }
