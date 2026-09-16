#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

log "starting"

port="$(service_port viewer)"

if ! port_up "$port"; then
  pass="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-24)"
  rm -rf "$SITE"
  find samples -type f \( -name '*.md' -o -name '*.html' \) -print0 > "$RUN/files"
  node src/build.js --root . --out "$SITE/$PREVIEW_PATH" --user local --pass "$pass" --hours 24 --title "Local samples" --files-from "$RUN/files" \
    || fail "build failed"
  printf "user=local\npass=%s\n" "$pass" > "$RUN/credentials"
  start_bg viewer "$SITE" python3 -m http.server "$port" --bind 127.0.0.1
  wait_port_up "$port" 60 || fail "viewer did not open port $port, see $LOGS/viewer.log"
else
  log "viewer already running"
fi

"$SCRIPTS/status.sh"

log "credentials"
cat "$RUN/credentials"

log "links"
for name in $(service_names); do
  printf "%-14s %s\n" "$name" "$(service_url "$name")"
done
