#!/usr/bin/env bash
set -euo pipefail

REMOTE="${PAGES_REMOTE:-origin}"
BRANCH="${PAGES_BRANCH:-gh-pages}"
NOW="${PAGES_NOW:-$(date +%s)}"

usage() {
  echo "usage: pages.sh publish <name> <dir> | remove <name> | prune" >&2
  exit 2
}

check_name() {
  [[ "$1" =~ ^[a-z0-9-]+$ ]] || { echo "invalid preview name: $1" >&2; exit 2; }
}

load_site() {
  SITE="$(mktemp -d)"
  CURRENT_TREE=""
  if git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
    git fetch --quiet --depth 1 "$REMOTE" "refs/heads/$BRANCH"
    CURRENT_TREE="$(git rev-parse "FETCH_HEAD^{tree}")"
    git archive FETCH_HEAD | tar -x -C "$SITE"
  fi
  mkdir -p "$SITE/previews"
  touch "$SITE/.nojekyll"
  printf 'User-agent: *\nDisallow: /\n' > "$SITE/robots.txt"
  printf '<!DOCTYPE html><meta name="robots" content="noindex"><title>Temp Render</title>\n' > "$SITE/index.html"
}

prune_site() {
  local dir expires
  for dir in "$SITE"/previews/*/; do
    [ -d "$dir" ] || continue
    expires="$(cat "$dir/expires-at" 2>/dev/null || echo 0)"
    if ! [[ "$expires" =~ ^[0-9]+$ ]] || [ "$expires" -le "$NOW" ]; then
      rm -rf "$dir"
      echo "removed expired $(basename "$dir")"
    fi
  done
}

push_site() {
  local git_dir index tree commit
  git_dir="$(git rev-parse --absolute-git-dir)"
  index="$(mktemp)"
  rm -f "$index"
  tree="$(cd "$SITE" && GIT_DIR="$git_dir" GIT_WORK_TREE="$SITE" GIT_INDEX_FILE="$index" git add -A -f && GIT_DIR="$git_dir" GIT_INDEX_FILE="$index" git write-tree)"
  rm -rf "$SITE" "$index"
  if [ "$tree" = "$CURRENT_TREE" ]; then
    echo "no changes on $BRANCH"
    return
  fi
  commit="$(GIT_AUTHOR_NAME=temp-render GIT_AUTHOR_EMAIL=temp-render@users.noreply.github.com \
    GIT_COMMITTER_NAME=temp-render GIT_COMMITTER_EMAIL=temp-render@users.noreply.github.com \
    git commit-tree "$tree" -m "temp-render: $1")"
  git push --quiet --force "$REMOTE" "$commit:refs/heads/$BRANCH"
}

[ $# -ge 1 ] || usage

case "$1" in
  publish)
    [ $# -eq 3 ] || usage
    check_name "$2"
    [ -f "$3/index.html" ] && [ -f "$3/expires-at" ] || { echo "missing index.html or expires-at in $3" >&2; exit 1; }
    load_site
    rm -rf "$SITE/previews/$2"
    mkdir -p "$SITE/previews/$2"
    cp "$3/index.html" "$3/expires-at" "$SITE/previews/$2/"
    prune_site
    push_site "publish $2"
    echo "published $2"
    ;;
  remove)
    [ $# -eq 2 ] || usage
    check_name "$2"
    load_site
    rm -rf "$SITE/previews/$2"
    prune_site
    push_site "remove $2"
    echo "removed $2"
    ;;
  prune)
    load_site
    prune_site
    push_site "prune"
    ;;
  *)
    usage
    ;;
esac
