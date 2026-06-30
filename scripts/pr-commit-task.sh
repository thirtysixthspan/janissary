#!/bin/bash
# Commit changes with AI-Task trailer
# Usage: pr-commit-task.sh <task-name> <commit-subject> [commit-body]

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <task-name> <subject> [body]"
  exit 1
fi

TASK_NAME="$1"
SUBJECT="$2"
BODY="${3:-}"

git add -A

if [[ -z "$BODY" ]]; then
  git commit -m "$SUBJECT" -m "AI-Task: $TASK_NAME"
else
  git commit -m "$SUBJECT" -m "$BODY" -m "AI-Task: $TASK_NAME"
fi
