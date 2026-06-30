#!/bin/bash
# Report uncommitted changes and commits ahead of master.
# Exit: 0 = there is something to ship, 1 = nothing to ship.

PORCELAIN=$(git status --porcelain 2>&1)
AHEAD=$(git log --oneline origin/master..HEAD 2>/dev/null)

echo "$PORCELAIN"
echo "---"
echo "$AHEAD"

if [[ -z "$PORCELAIN" && -z "$AHEAD" ]]; then
  echo "No changes to open a PR for"
  exit 1
fi
