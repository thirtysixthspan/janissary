#!/bin/bash
# Run the check gate for the merge step.
#
# Hard checks fail the gate: type errors, lint errors, failing tests, CSS
# errors. Advisory quality checks (complexity, duplication, dead code) are run
# for visibility but only WARN — they never fail the gate, matching the
# warn-level lint rules. So the gate does not fail on warnings.

set -o pipefail

# Hard gates — any failure fails the gate.
HARD=(typecheck lint test lint:css)
# Advisory gates — reported but never fail the gate.
ADVISORY=(quality duplication knip)

status=0

for step in "${HARD[@]}"; do
  echo "==> npm run $step"
  if ! npm run "$step"; then
    echo "GATE FAILED: npm run $step" >&2
    status=1
  fi
done

for step in "${ADVISORY[@]}"; do
  echo "==> npm run $step (advisory — warnings do not fail the gate)"
  if ! npm run "$step"; then
    echo "WARNING: npm run $step reported issues (not failing the gate)"
  fi
done

if [[ $status -ne 0 ]]; then
  echo "Check gate: FAILED (hard errors above)" >&2
else
  echo "Check gate: passed (advisory warnings, if any, do not fail the gate)"
fi
exit $status
