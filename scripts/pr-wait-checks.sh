#!/bin/bash
# Wait for all of a PR's checks to complete, then report pass/fail.
# Usage: pr-wait-checks.sh <BRANCH> <OWNER_REPO>
# Exit:  0 = all checks passed (or the PR has no checks at all)
#        1 = at least one check failed
#
# `gh pr checks --watch` blocks until every check finishes and exits non-zero
# on failure. A PR with no checks configured makes gh exit non-zero with a
# "no checks reported" message; that is not a failure, so we treat it as pass.

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <BRANCH> <OWNER_REPO>"
  exit 2
fi

BRANCH="$1"
OWNER_REPO="$2"

# Find gh command
GH_CMD="gh"
if ! command -v "$GH_CMD" &> /dev/null; then
  GH_CMD="/usr/local/opt/gh/bin/gh"
fi

OUTPUT=$("$GH_CMD" pr checks "$BRANCH" -R "$OWNER_REPO" --watch 2>&1)
STATUS=$?

echo "$OUTPUT"

if [[ $STATUS -eq 0 ]]; then
  echo "PR checks: passed"
  exit 0
fi

if echo "$OUTPUT" | grep -qi "no checks reported"; then
  echo "PR checks: none configured — treating as passed"
  exit 0
fi

echo "PR checks: failed"
exit 1
