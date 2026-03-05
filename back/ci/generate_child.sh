#!/bin/sh
PACKAGES_FILE="$1"
API_URL="$2"
BUILDER_IMAGE="$3"

printf 'variables:\n  API_URL: "%s"\n  BUILDER_IMAGE: "%s"\nstages:\n  - verify\n\n' \
    "$API_URL" "$BUILDER_IMAGE"

while IFS= read -r pkg || [ -n "$pkg" ]; do
    [ -z "$pkg" ] && continue
    case "$pkg" in \#*) continue ;; esac
    safe=$(printf '%s' "$pkg" | tr -c 'a-zA-Z0-9' '_')
    printf 'verify_%s:\n  stage: verify\n  image: $BUILDER_IMAGE\n  tags: [kubernetes]\n  variables:\n    PKG_NAME: "%s"\n  script:\n    - sh verify.sh\n  allow_failure: true\n\n' \
        "$safe" "$pkg"
done < "$PACKAGES_FILE"
