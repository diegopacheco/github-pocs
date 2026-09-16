#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

port="$(service_port viewer)"
port_up "$port" || fail "viewer is not running on $port, run ./scripts/start-all.sh first"

url="$(service_url viewer)"
log "opening $url"
open_url "$url"
