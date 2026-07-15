#!/bin/bash
# Run the check gate for the merge step.
#
# Hard checks fail the gate: type errors, lint errors, failing tests, CSS
# errors. That's the whole gate — no advisory quality checks (complexity,
# duplication, dead code) run here; those are for the human end-of-work gate
# (`npm run check:full`), not this automated merge step.

set -o pipefail

# Hard gates — any failure fails the gate.
HARD=(typecheck lint test lint:css)

status=0

for step in "${HARD[@]}"; do
  echo "==> npm run $step"
  if ! npm run "$step"; then
    echo "GATE FAILED: npm run $step" >&2
    status=1
  fi
done

if [[ $status -ne 0 ]]; then
  echo "Check gate: FAILED (hard errors above)" >&2
else
  echo "Check gate: passed"
fi
exit $status
