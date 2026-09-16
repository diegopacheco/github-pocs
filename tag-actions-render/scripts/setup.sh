#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

log "setup started"

require node
require python3
require git
require lsof

major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$major" -ge 22 ] || fail "node 22 or newer is required, found $(node -v)"

log "setup done, no dependencies to install"
