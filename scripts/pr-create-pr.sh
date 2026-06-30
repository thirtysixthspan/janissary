#!/bin/bash
# Create a PR on GitHub
# Usage: pr-create-pr.sh <OWNER_REPO> <BRANCH> <TITLE> [BODY_FILE]
# BODY_FILE: path to a file containing the PR body (avoids shell quoting issues)

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <OWNER_REPO> <BRANCH> <TITLE> [BODY_FILE]"
  exit 1
fi

OWNER_REPO="$1"
BRANCH="$2"
TITLE="$3"
BODY_FILE="${4:-}"

# Find gh command
GH_CMD="gh"
if ! command -v "$GH_CMD" &> /dev/null; then
  GH_CMD="/usr/local/opt/gh/bin/gh"
fi

if [[ -z "$BODY_FILE" ]]; then
  "$GH_CMD" pr create -R "$OWNER_REPO" --base master --head "$BRANCH" \
    --title "$TITLE" 2>&1
else
  "$GH_CMD" pr create -R "$OWNER_REPO" --base master --head "$BRANCH" \
    --title "$TITLE" \
    --body-file "$BODY_FILE" 2>&1
fi
