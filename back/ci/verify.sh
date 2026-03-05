#!/bin/sh
set -e

DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
    curl jq python3 dpkg-dev fakeroot

die() { echo "ERROR: $*" >&2; exit 1; }
json_str() { printf '%s' "$1" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))"; }

echo "=== $PKG_NAME ==="

INFO=$(apt-cache show "$PKG_NAME" 2>/dev/null)
VERSION=$(echo   "$INFO" | awk '/^Version:/{print $2; exit}')
ARCH=$(echo      "$INFO" | awk '/^Architecture:/{print $2; exit}')
FILENAME=$(echo  "$INFO" | awk '/^Filename:/{print $2; exit}')
HASH_REPO=$(echo "$INFO" | awk '/^SHA256:/{print $2; exit}')
SOURCE=$(echo    "$INFO" | awk '/^Source:/{print $2; exit}')
SOURCE=${SOURCE:-$PKG_NAME}

[ -n "$VERSION" ]   || die "package $PKG_NAME not found"
[ -n "$HASH_REPO" ] || die "no SHA256 for $PKG_NAME"

# Download and check mirror integrity
mkdir -p /tmp/dl && cd /tmp/dl && rm -f ./*.deb
apt-get download "$PKG_NAME" -qq 2>/dev/null || die "download failed"
DEB=$(ls *.deb 2>/dev/null | head -1)
[ -n "$DEB" ] || die "no .deb after download"
HASH_DOWNLOAD=$(sha256sum "$DEB" | awk '{print $1}')
[ "$HASH_REPO" = "$HASH_DOWNLOAD" ] && echo "mirror: OK" || echo "mirror: TAMPERED"

# Register package version in API
PV=$(curl -sf -X POST "$API_URL/packages/versions" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"$PKG_NAME\",\"source_name\":\"$SOURCE\",\"version\":\"$VERSION\",\"arch\":\"$ARCH\",\"filename\":\"$FILENAME\",\"hash_declared\":\"$HASH_REPO\",\"hash_download\":\"$HASH_DOWNLOAD\"}") \
    || die "POST /packages/versions failed"
PV_ID=$(echo "$PV" | jq -r '.id // empty')
[ -n "$PV_ID" ] || die "no PV_ID: $PV"

# Create run (409 = active run already exists, extract its id from detail)
RUN=$(curl -sf -X POST "$API_URL/runs" \
    -H 'Content-Type: application/json' \
    -d "{\"package_version_id\":$PV_ID,\"triggered_by\":\"gitlab-ci\"}" || true)
RUN_ID=$(echo "$RUN" | jq -r '.id // empty')
[ -n "$RUN_ID" ] || RUN_ID=$(echo "$RUN" | jq -r '.detail // ""' | grep -oE '[0-9a-f-]{36}' | head -1)
[ -n "$RUN_ID" ] || die "no RUN_ID: $RUN"

curl -sf -X PUT "$API_URL/runs/$RUN_ID/start" -H 'Content-Type: application/json' > /dev/null || true

# Enable deb-src — Debian 13 uses DEB822 format (.sources), not sources.list
cat > /etc/apt/sources.list.d/deb-src.sources << 'SRC'
Types: deb-src
URIs: http://deb.debian.org/debian
Suites: stable stable-updates
Components: main
Signed-By: /usr/share/keyrings/debian-archive-keyring.pgp
SRC
apt-get update -qq

# Build from source
HASH_BUILT="" FAILURE="" BUILD_LOG=""
rm -rf /tmp/build && mkdir -p /tmp/build && cd /tmp/build

if apt-get source "$PKG_NAME" -qq 2>/tmp/src.log; then
    SRC_DIR=$(find /tmp/build -maxdepth 1 -mindepth 1 -type d | head -1)
    if [ -n "$SRC_DIR" ]; then
        cd "$SRC_DIR"
        DEBIAN_FRONTEND=noninteractive apt-get build-dep -y . -qq 2>/dev/null || true
        BUILD_LOG=$(dpkg-buildpackage -b -uc -us 2>&1 || true)
        BUILT=$(find /tmp/build -maxdepth 1 -name "${PKG_NAME}_*.deb" | head -1)
        if [ -n "$BUILT" ]; then
            HASH_BUILT=$(sha256sum "$BUILT" | awk '{print $1}')
        else
            FAILURE="no .deb produced after build"
        fi
    else
        FAILURE="source directory not found"
    fi
else
    FAILURE="apt-get source failed: $(tail -3 /tmp/src.log | tr '\n' ' ')"
fi

# Submit result
H=$([ -n "$HASH_BUILT" ] && echo "\"$HASH_BUILT\"" || echo "null")
F=$([ -n "$FAILURE"    ] && json_str "$FAILURE"    || echo "null")
L=$(echo "$BUILD_LOG" | head -c 8000 | json_str "$(cat)")

RESULT=$(curl -sf -X POST "$API_URL/runs/$RUN_ID/result" \
    -H 'Content-Type: application/json' \
    -d "{\"hash_rebuilt\":$H,\"build_log\":$L,\"failure_reason\":$F,\"build_path\":\"/tmp/build\"}") \
    || die "POST /runs/$RUN_ID/result failed"

STATUS=$(echo "$RESULT" | jq -r '.status // "UNKNOWN"')

echo "declared : $HASH_REPO"
echo "download : $HASH_DOWNLOAD"
echo "built    : ${HASH_BUILT:--}"
echo "status   : $STATUS"

case "$STATUS" in
    NOT_REPRODUCIBLE|NOT_REPRODUCIBLE_CRITICAL) exit 1 ;;
    *) exit 0 ;;
esac
