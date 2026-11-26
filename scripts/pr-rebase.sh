#!/bin/bash
# Rebase the current branch onto master and force-push when clean.
# Usage: pr-rebase.sh <GH_REMOTE> [BRANCH] [--check-diff]
#
# After a clean rebase it re-verifies with the full check gate (pr-check-gate.sh).
# --check-diff runs check-diff --base <GH_REMOTE>/master in its place, which
# checks only the branch's own changes since master.
#
# Exit: 0 = rebased cleanly, checks green, branch force-pushed
#       1 = a hard error (fetch failed, or checks red after rebase)
#       2 = conflicts need manual resolution — resolve the listed files'
#           markers (preserve BOTH sides), then re-run this script to continue
#
# It automates the mechanical parts of ai/merge-change-to-master.md Step 7.
# Conflict-marker resolution itself needs judgment and stays manual; this
# script is safe to re-run and will continue an in-progress rebase.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CHECK_DIFF=0
POSITIONAL=()
for arg in "$@"; do
  if [[ "$arg" == "--check-diff" ]]; then
    CHECK_DIFF=1
  else
    POSITIONAL+=("$arg")
  fi
done

GH_REMOTE="${POSITIONAL[0]:-origin}"
BRANCH="${POSITIONAL[1]:-$(git rev-parse --abbrev-ref HEAD)}"

rebase_in_progress() {
  local d
  d=$(git rev-parse --git-path rebase-merge 2>/dev/null); [[ -d "$d" ]] && return 0
  d=$(git rev-parse --git-path rebase-apply 2>/dev/null); [[ -d "$d" ]] && return 0
  return 1
}

if rebase_in_progress; then
  UNMERGED=$(git diff --name-only --diff-filter=U)
  if [[ -n "$UNMERGED" ]]; then
    echo "Unresolved conflicts remain. Resolve the markers, then re-run this script:"
    echo "$UNMERGED"
    exit 2
  fi
  echo "Continuing in-progress rebase..."
  git add -A
  GIT_EDITOR=true git rebase --continue
else
  echo "Fetching $GH_REMOTE/master..."
  git fetch "$GH_REMOTE" master || exit 1
  echo "Rebasing onto $GH_REMOTE/master..."
  git rebase "$GH_REMOTE/master"
fi

if rebase_in_progress; then
  echo "Conflicts. Resolve these files (preserve both sides), then re-run this script:"
  git diff --name-only --diff-filter=U
  exit 2
fi

if [[ $CHECK_DIFF -eq 1 ]]; then
  echo "Rebase clean — re-verifying with check-diff against $GH_REMOTE/master..."
  if ! node "$SCRIPT_DIR/check-diff.mjs" --base "$GH_REMOTE/master"; then
    echo "check-diff is red after rebase — fix the fallout before pushing." >&2
    exit 1
  fi
else
  echo "Rebase clean — re-verifying with the check gate..."
  if ! "$SCRIPT_DIR/pr-check-gate.sh"; then
    echo "Check gate is red after rebase — fix the fallout before pushing." >&2
    exit 1
  fi
fi

echo "Force-pushing $BRANCH..."
git push --force-with-lease "$GH_REMOTE" "$BRANCH"
