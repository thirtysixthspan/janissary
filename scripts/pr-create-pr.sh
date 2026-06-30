#!/bin/bash
# Create a PR on GitHub
# Usage: pr-create-pr.sh <OWNER_REPO> <BRANCH> <TITLE> [BODY]

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <OWNER_REPO> <BRANCH> <TITLE> [BODY]"
  exit 1
fi

OWNER_REPO="$1"
BRANCH="$2"
TITLE="$3"
BODY="${4:-}"

# Find gh command
GH_CMD="gh"
if ! command -v "$GH_CMD" &> /dev/null; then
  GH_CMD="/usr/local/opt/gh/bin/gh"
fi

if [[ -z "$BODY" ]]; then
  $GH_CMD pr create -R "$OWNER_REPO" --base master --head "$BRANCH" \
    --title "$TITLE" 2>&1
else
  $GH_CMD pr create -R "$OWNER_REPO" --base master --head "$BRANCH" \
    --title "$TITLE" \
    --body "$BODY" 2>&1
fi
