#!/bin/bash

source "$(dirname "$0")/calc.sh"

case "$1" in
  add) add "$2" "$3" ;;
  sub) sub "$2" "$3" ;;
  *) echo "usage: cli.sh add|sub a b"; exit 1 ;;
esac
