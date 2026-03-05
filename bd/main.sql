CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE TYPE verification_status AS ENUM (
    'PENDING',
    'BUILDING',
    'VERIFIED',
    'NOT_REPRODUCIBLE',
    'NOT_REPRODUCIBLE_CRITICAL',
    'UNVERIFIABLE',
    'BUILD_FAILED'
);
CREATE TYPE diff_cause AS ENUM (
    'TIMESTAMP',
    'BUILD_PATH',
    'FILE_ORDER',
    'UID_GID',
    'CODE_SECTION',
    'DATA_SECTION',
    'DEBUG_SECTION',
    'SCRIPT',
    'UNKNOWN'
);
CREATE TYPE diff_severity AS ENUM (
    'NOISE',
    'MODERATE',
    'CRITICAL'
);
CREATE TABLE mirror (
    id                  SERIAL       PRIMARY KEY,
    name                VARCHAR(128) NOT NULL DEFAULT 'local-astra-mirror',
    base_url            TEXT         NOT NULL,
    distribution        VARCHAR(64)  NOT NULL,
    component           VARCHAR(64)  NOT NULL DEFAULT 'main',
    gpg_key_fingerprint VARCHAR(64),
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE TABLE mirror_sync_log (
    id                  SERIAL       PRIMARY KEY,
    mirror_id           INTEGER      NOT NULL REFERENCES mirror(id),
    synced_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    packages_total      INTEGER,
    packages_new        INTEGER      DEFAULT 0,
    packages_updated    INTEGER      DEFAULT 0,
    gpg_valid           BOOLEAN      NOT NULL DEFAULT FALSE,
    packages_file_hash  CHAR(64),
    error_message       TEXT
);
CREATE TABLE packages (
    id              SERIAL       PRIMARY KEY,
    name            VARCHAR(256) NOT NULL UNIQUE,
    source_name     VARCHAR(256),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_packages_name_trgm
    ON packages USING GIN (name gin_trgm_ops);
CREATE TABLE package_versions (
    id                      SERIAL       PRIMARY KEY,
    package_id              INTEGER      NOT NULL REFERENCES packages(id),
    version                 VARCHAR(128) NOT NULL,
    arch                    VARCHAR(16)  NOT NULL,
    filename                TEXT         NOT NULL,
    size_bytes              BIGINT,
    hash_declared           CHAR(64)     NOT NULL,
    depends                 TEXT,
    section                 VARCHAR(64),
    priority                VARCHAR(32),
    first_seen_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_seen_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    discovered_in_sync_id   INTEGER      REFERENCES mirror_sync_log(id),
    UNIQUE (package_id, version, arch)
);
CREATE INDEX idx_pkg_versions_package_id
    ON package_versions (package_id);
CREATE INDEX idx_pkg_versions_hash_declared
    ON package_versions (hash_declared);
CREATE TABLE package_list_snapshots (
    id              SERIAL       PRIMARY KEY,
    git_commit_sha  CHAR(40)     NOT NULL,
    git_ref         VARCHAR(256) NOT NULL,
    file_path       VARCHAR(512) NOT NULL,
    raw_content     TEXT         NOT NULL,
    package_names   JSONB        NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (git_commit_sha, file_path)
);
CREATE TABLE build_environments (
    id                  SERIAL       PRIMARY KEY,
    name                VARCHAR(128) NOT NULL UNIQUE,
    base_image          TEXT,
    gcc_version         VARCHAR(32),
    dpkg_version        VARCHAR(32),
    libc_version        VARCHAR(32),
    installed_packages  JSONB,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE TABLE verification_runs (
    id                      UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_version_id      INTEGER      NOT NULL REFERENCES package_versions(id),
    environment_id          INTEGER      REFERENCES build_environments(id),
    snapshot_id             INTEGER      REFERENCES package_list_snapshots(id),
    status                  verification_status NOT NULL DEFAULT 'PENDING',
    hash_declared_at_run    CHAR(64)     NOT NULL,
    hash_rebuilt            CHAR(64),
    hashes_match            BOOLEAN GENERATED ALWAYS AS (
                                CASE
                                    WHEN hash_rebuilt IS NULL THEN NULL
                                    ELSE hash_declared_at_run = hash_rebuilt
                                END
                            ) STORED,
    source_date_epoch       BIGINT,
    build_path              TEXT,
    queued_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at              TIMESTAMPTZ,
    finished_at             TIMESTAMPTZ,
    build_duration_seconds  INTEGER GENERATED ALWAYS AS (
                                CASE
                                    WHEN started_at IS NULL OR finished_at IS NULL
                                    THEN NULL
                                    ELSE EXTRACT(EPOCH FROM (finished_at - started_at))::INTEGER
                                END
                            ) STORED,
    build_log               TEXT,
    failure_reason          TEXT,
    triggered_by            VARCHAR(32)  NOT NULL DEFAULT 'scheduler'
);
CREATE INDEX idx_runs_package_version_id
    ON verification_runs (package_version_id);
CREATE INDEX idx_runs_status
    ON verification_runs (status);
CREATE INDEX idx_runs_finished_at
    ON verification_runs (finished_at DESC NULLS LAST);
CREATE INDEX idx_runs_hashes_match
    ON verification_runs (hashes_match)
    WHERE hashes_match IS NOT NULL;
CREATE INDEX idx_runs_snapshot_id
    ON verification_runs (snapshot_id)
    WHERE snapshot_id IS NOT NULL;
CREATE TABLE diff_results (
    id                  SERIAL        PRIMARY KEY,
    run_id              UUID          NOT NULL
                            REFERENCES verification_runs(id)
                            ON DELETE CASCADE,
    file_path           TEXT,
    section_name        VARCHAR(64),
    cause               diff_cause    NOT NULL DEFAULT 'UNKNOWN',
    severity            diff_severity NOT NULL DEFAULT 'NOISE',
    description         TEXT,
    diffoscope_output   TEXT,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_diff_run_id    ON diff_results (run_id);
CREATE INDEX idx_diff_severity  ON diff_results (severity);
CREATE INDEX idx_diff_cause     ON diff_results (cause);
CREATE VIEW v_latest_run_per_version AS
SELECT DISTINCT ON (pv.id)
    p.name                      AS package_name,
    p.source_name,
    pv.id                       AS package_version_id,
    pv.version,
    pv.arch,
    pv.hash_declared,
    vr.id                       AS run_id,
    vr.status,
    vr.hash_rebuilt,
    vr.hashes_match,
    vr.queued_at,
    vr.finished_at,
    vr.build_duration_seconds,
    vr.triggered_by
FROM package_versions pv
JOIN packages p
    ON p.id = pv.package_id
LEFT JOIN verification_runs vr
    ON vr.package_version_id = pv.id
ORDER BY
    pv.id,
    vr.finished_at DESC NULLS LAST;
CREATE VIEW v_status_stats AS
SELECT
    status,
    COUNT(*)                                            AS total,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM (
    SELECT DISTINCT ON (package_version_id)
        status
    FROM verification_runs
    WHERE finished_at IS NOT NULL
    ORDER BY package_version_id, finished_at DESC NULLS LAST
) latest
GROUP BY status
ORDER BY total DESC;
CREATE VIEW v_critical_issues AS
SELECT
    p.name          AS package_name,
    pv.version,
    pv.arch,
    vr.id           AS run_id,
    vr.finished_at,
    dr.id           AS diff_id,
    dr.file_path,
    dr.section_name,
    dr.cause,
    dr.severity,
    dr.description
FROM diff_results dr
JOIN verification_runs vr ON vr.id  = dr.run_id
JOIN package_versions pv  ON pv.id  = vr.package_version_id
JOIN packages p           ON p.id   = pv.package_id
WHERE dr.severity IN ('CRITICAL', 'MODERATE')
ORDER BY dr.severity DESC, vr.finished_at DESC;
CREATE VIEW v_package_history AS
SELECT
    p.name          AS package_name,
    pv.version,
    pv.arch,
    vr.id           AS run_id,
    vr.status,
    vr.hashes_match,
    vr.hash_declared_at_run,
    vr.hash_rebuilt,
    vr.queued_at,
    vr.started_at,
    vr.finished_at,
    vr.build_duration_seconds,
    vr.triggered_by,
    vr.failure_reason,
    pls.git_commit_sha,
    pls.git_ref
FROM verification_runs vr
JOIN package_versions pv        ON pv.id  = vr.package_version_id
JOIN packages p                 ON p.id   = pv.package_id
LEFT JOIN package_list_snapshots pls ON pls.id = vr.snapshot_id
ORDER BY p.name, pv.version, vr.queued_at DESC;
CREATE VIEW v_snapshot_runs AS
SELECT
    pls.id              AS snapshot_id,
    pls.git_commit_sha,
    pls.git_ref,
    pls.created_at      AS snapshot_created_at,
    COUNT(vr.id)        AS total_runs,
    COUNT(vr.id) FILTER (WHERE vr.status = 'VERIFIED')                  AS verified,
    COUNT(vr.id) FILTER (WHERE vr.status = 'NOT_REPRODUCIBLE')          AS not_reproducible,
    COUNT(vr.id) FILTER (WHERE vr.status = 'NOT_REPRODUCIBLE_CRITICAL') AS critical,
    COUNT(vr.id) FILTER (WHERE vr.status = 'BUILD_FAILED')              AS failed,
    COUNT(vr.id) FILTER (WHERE vr.status = 'PENDING')                   AS pending,
    COUNT(vr.id) FILTER (WHERE vr.status = 'BUILDING')                  AS building
FROM package_list_snapshots pls
LEFT JOIN verification_runs vr ON vr.snapshot_id = pls.id
GROUP BY pls.id, pls.git_commit_sha, pls.git_ref, pls.created_at
ORDER BY pls.created_at DESC;
INSERT INTO mirror (name, base_url, distribution, component)
VALUES (
    'local-astra-mirror',
    'http://localhost/astra',
    '1.7_x86-64',
    'main'
);
INSERT INTO build_environments (name, base_image)
VALUES (
    'astra-1.7-amd64-default',
    'astralinux/alse:1.7'
);
