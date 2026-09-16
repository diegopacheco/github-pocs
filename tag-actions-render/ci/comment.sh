#!/usr/bin/env bash
set -euo pipefail

MARKER="<!-- temp-render -->"

[ $# -eq 1 ] || { echo "usage: comment.sh <body-file>" >&2; exit 2; }
: "${GITHUB_REPOSITORY:?}" "${PR_NUMBER:?}" "${GH_TOKEN:?}"

body="$MARKER
$(cat "$1")"

comment_id="$(gh api --paginate "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" \
  --jq ".[] | select(.user.login == \"github-actions[bot]\" and (.body | startswith(\"$MARKER\"))) | .id" | head -n 1)"

if [ -n "$comment_id" ]; then
  gh api --silent -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$comment_id" -f body="$body"
  echo "updated comment $comment_id"
else
  gh api --silent -X POST "repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" -f body="$body"
  echo "created comment"
fi
