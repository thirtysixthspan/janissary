#!/bin/bash
# Merge a PR and delete its remote branch.
# Usage: pr-merge.sh <BRANCH> <OWNER_REPO>
#
# Only call this once the PR is MERGEABLE (no conflicts) and all checks have
# passed. A squash merge is used and the remote branch is deleted on success.

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

"$GH_CMD" pr merge "$BRANCH" -R "$OWNER_REPO" --squash --delete-branch 2>&1
