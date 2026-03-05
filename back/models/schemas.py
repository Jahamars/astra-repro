from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field






class VerificationStatus(str, Enum):
    PENDING                    = "PENDING"
    BUILDING                   = "BUILDING"
    VERIFIED                   = "VERIFIED"
    NOT_REPRODUCIBLE           = "NOT_REPRODUCIBLE"
    NOT_REPRODUCIBLE_CRITICAL  = "NOT_REPRODUCIBLE_CRITICAL"
    UNVERIFIABLE               = "UNVERIFIABLE"
    BUILD_FAILED               = "BUILD_FAILED"


class DiffCause(str, Enum):
    TIMESTAMP     = "TIMESTAMP"
    BUILD_PATH    = "BUILD_PATH"
    FILE_ORDER    = "FILE_ORDER"
    UID_GID       = "UID_GID"
    CODE_SECTION  = "CODE_SECTION"
    DATA_SECTION  = "DATA_SECTION"
    DEBUG_SECTION = "DEBUG_SECTION"
    SCRIPT        = "SCRIPT"
    UNKNOWN       = "UNKNOWN"


class DiffSeverity(str, Enum):
    NOISE    = "NOISE"
    MODERATE = "MODERATE"
    CRITICAL = "CRITICAL"






class MirrorOut(BaseModel):
    id: int
    name: str
    base_url: str
    distribution: str
    component: str
    gpg_key_fingerprint: str | None
    is_active: bool
    created_at: datetime






class MirrorSyncCreate(BaseModel):
    packages_total: int | None = None
    packages_new: int = 0
    packages_updated: int = 0
    gpg_valid: bool = False
    packages_file_hash: str | None = None
    error_message: str | None = None


class MirrorSyncOut(BaseModel):
    id: int
    mirror_id: int
    synced_at: datetime
    packages_total: int | None
    packages_new: int
    packages_updated: int
    gpg_valid: bool
    packages_file_hash: str | None
    error_message: str | None






class PackageOut(BaseModel):
    id: int
    name: str
    source_name: str | None
    created_at: datetime






class PackageVersionCreate(BaseModel):
    version: str
    arch: str
    filename: str
    size_bytes: int | None = None
    hash_declared: str = Field(..., min_length=64, max_length=64)
    depends: str | None = None
    section: str | None = None
    priority: str | None = None
    source_name: str | None = None
    discovered_in_sync_id: int | None = None


class PackageVersionOut(BaseModel):
    id: int
    package_id: int
    package_name: str
    version: str
    arch: str
    filename: str
    size_bytes: int | None
    hash_declared: str
    depends: str | None
    section: str | None
    priority: str | None
    first_seen_at: datetime
    last_seen_at: datetime






class SnapshotCreate(BaseModel):
    git_commit_sha: str = Field(..., min_length=40, max_length=40)
    git_ref: str
    file_path: str
    raw_content: str
    package_names: list[str]


class SnapshotOut(BaseModel):
    id: int
    git_commit_sha: str
    git_ref: str
    file_path: str
    package_names: list[str]
    created_at: datetime






class BuildEnvOut(BaseModel):
    id: int
    name: str
    base_image: str | None
    gcc_version: str | None
    dpkg_version: str | None
    libc_version: str | None
    installed_packages: dict[str, Any] | None
    created_at: datetime






class RunCreate(BaseModel):
    package_version_id: int
    environment_id: int | None = None
    snapshot_id: int | None = None
    triggered_by: str = "scheduler"


class BuilderResultSubmit(BaseModel):
    hash_rebuilt: str | None = Field(
        default=None,
        min_length=64,
        max_length=64,
        description="SHA256 NULL если сборка не удалась.",
    )
    build_log: str | None = None
    failure_reason: str | None = None
    source_date_epoch: int | None = None
    build_path: str | None = None


class RunOut(BaseModel):
    id: UUID
    package_version_id: int
    package_name: str
    version: str
    arch: str
    environment_id: int | None
    snapshot_id: int | None
    status: VerificationStatus
    hash_declared_at_run: str
    hash_rebuilt: str | None
    hashes_match: bool | None
    source_date_epoch: int | None
    build_path: str | None
    queued_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    build_duration_seconds: int | None
    failure_reason: str | None
    triggered_by: str


class RunDetail(RunOut):
    build_log: str | None
    diffs: list[DiffResultOut] = []






class DiffResultCreate(BaseModel):
    file_path: str | None = None
    section_name: str | None = None
    cause: DiffCause = DiffCause.UNKNOWN
    severity: DiffSeverity = DiffSeverity.NOISE
    description: str | None = None
    diffoscope_output: str | None = None


class DiffResultOut(BaseModel):
    id: int
    run_id: UUID
    file_path: str | None
    section_name: str | None
    cause: DiffCause
    severity: DiffSeverity
    description: str | None
    created_at: datetime






class StatusStat(BaseModel):
    status: VerificationStatus
    total: int
    percentage: float


class StatsOut(BaseModel):
    total_packages: int
    total_versions: int
    total_runs: int
    by_status: list[StatusStat]


class CriticalIssueOut(BaseModel):
    package_name: str
    version: str
    arch: str
    run_id: UUID
    finished_at: datetime | None
    diff_id: int
    file_path: str | None
    section_name: str | None
    cause: DiffCause
    severity: DiffSeverity
    description: str | None


class SnapshotStatsOut(BaseModel):
    snapshot_id: int
    git_commit_sha: str
    git_ref: str
    snapshot_created_at: datetime
    total_runs: int
    verified: int
    not_reproducible: int
    critical: int
    failed: int
    pending: int
    building: int



RunDetail.model_rebuild()
