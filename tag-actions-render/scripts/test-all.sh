#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

log "tests started"

require node
node --test "tests/*.test.js" || fail "tests failed"

bash -n ci/pages.sh ci/comment.sh || fail "ci scripts have syntax errors"

log "tests passed"
