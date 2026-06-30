#!/bin/bash
# Stage all changes and commit with a single author and no co-authors.
# Usage: pr-commit.sh <subject> [body]
#
# The commit deliberately carries NO Co-Authored-By trailer. This overrides any
# default convention that appends a Claude co-author — the commit must have a
# single author. Use -c commit.gpgsign as configured by the repo.

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <subject> [body]"
  exit 1
fi

SUBJECT="$1"
BODY="${2:-}"

git add -A

if [[ -z "$BODY" ]]; then
  git commit -m "$SUBJECT"
else
  git commit -m "$SUBJECT" -m "$BODY"
fi
