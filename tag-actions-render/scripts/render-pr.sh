#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

WORKFLOW="temp-render.yml"
SECRET="RENDER_PASS"
LABEL="temp-render"

delete_secret() {
  local code=$? names
  if ! names="$(gh secret list --json name --jq '.[].name')"; then
    printf "ERROR: could not check %s, delete it now with: gh secret delete %s\n" "$SECRET" "$SECRET" >&2
    exit 1
  fi
  if grep -qx "$SECRET" <<< "$names" && ! gh secret delete "$SECRET"; then
    printf "ERROR: could not delete %s, delete it now with: gh secret delete %s\n" "$SECRET" "$SECRET" >&2
    exit 1
  fi
  log "secret $SECRET deleted"
  exit "$code"
}

find_run() {
  local tries id
  tries=30
  while [ "$tries" -gt 0 ]; do
    id="$(gh run list --workflow "$WORKFLOW" --event workflow_dispatch --limit 20 \
      --json databaseId,displayTitle --jq ".[] | select(.displayTitle | endswith(\" $1\")) | .databaseId")"
    if [ -n "$id" ]; then
      printf "%s\n" "$id"
      return 0
    fi
    sleep 2
    tries=$((tries - 1))
  done
  return 1
}

[ $# -eq 1 ] && [[ "$1" =~ ^[0-9]+$ ]] || fail "usage: render-pr.sh <pull-request-number>"
PR="$1"
require gh
require openssl

pass="$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-24)"
nonce="$(openssl rand -hex 8)"

trap delete_secret EXIT
printf "%s" "$pass" | gh secret set "$SECRET"
gh pr edit "$PR" --add-label "$LABEL" >/dev/null
gh workflow run "$WORKFLOW" -f pr="$PR" -f nonce="$nonce"
log "run requested for PR #$PR"

run_id="$(find_run "$nonce")" || fail "run for PR #$PR did not show up"
log "waiting for run $run_id"
gh run watch "$run_id" --exit-status >/dev/null || fail "run $run_id failed, see: gh run view $run_id --log-failed"

repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
owner="$(printf "%s" "${repo%%/*}" | tr '[:upper:]' '[:lower:]')"
log "page:     https://$owner.github.io/${repo#*/}/previews/pr-$PR/"
log "user:     pr-$PR"
log "password: $pass"
