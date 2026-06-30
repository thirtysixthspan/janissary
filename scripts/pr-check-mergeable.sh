#!/bin/bash
# Poll PR mergeable status (max 6 attempts with 2-second delays)
# Usage: pr-check-mergeable.sh <BRANCH> <OWNER_REPO>
# Outputs: MERGEABLE, CONFLICTING, or UNKNOWN

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <BRANCH> <OWNER_REPO>"
  exit 1
fi

BRANCH="$1"
OWNER_REPO="$2"

# Find gh command
GH_CMD="gh"
if ! command -v "$GH_CMD" &> /dev/null; then
  GH_CMD="/usr/local/opt/gh/bin/gh"
fi

STATE="UNKNOWN"
for i in {1..6}; do
  STATE=$($GH_CMD pr view "$BRANCH" -R "$OWNER_REPO" --json mergeable -q .mergeable 2>&1)
  [ "$STATE" != "UNKNOWN" ] && break
  if [ $i -lt 6 ]; then
    sleep 2
  fi
done

echo "$STATE"
