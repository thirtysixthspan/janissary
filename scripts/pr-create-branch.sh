#!/bin/bash
# Create and switch to a feature branch. Uncommitted changes carry over.
# Usage: pr-create-branch.sh <branch>
#
# If already on <branch> this is a no-op; otherwise it runs `git checkout -b`.

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <branch>"
  exit 1
fi

BRANCH="$1"
CURRENT=$(git rev-parse --abbrev-ref HEAD)

if [[ "$BRANCH" == "$CURRENT" ]]; then
  echo "Already on $BRANCH"
  exit 0
fi

git checkout -b "$BRANCH"
