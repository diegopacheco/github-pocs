#!/bin/bash

cd "$(dirname "$0")"
fail=0

check() {
  if [ "$2" == "$3" ]; then echo "PASS $1"; else echo "FAIL $1 expected [$3] got [$2]"; fail=1; fi
}

check "add sums two numbers" "$(./cli.sh add 2 3)" "5"
check "sub keeps operand order so 2-3 is negative" "$(./cli.sh sub 2 3)" "-1"
check "unknown operation fails instead of guessing" "$(./cli.sh mul 2 3 >/dev/null; echo $?)" "1"

exit $fail
