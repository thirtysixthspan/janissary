# Distinguish durable-record marker tooltips in the shell-tab spec

**Complexity: 1/10** — a spec-only prose edit: no production files, behavioral requirements, tests, or new units (p=1.58)

PR 2064 backlog item: *"Correct the shell-tab spec's blanket marker tooltip claim, which still states the role-based name format for the newly added durable-record markers."*

## Goal

The "The marker and link are decorations" paragraph of `product/specs/shell-tab.md`'s Core ACP connections section states one blanket tooltip and accessible-name rule, `Open acp:<role>:<tab name>`, for every ACP marker. That is true only of role-target (`ask`/`tell`) markers. Since durable-record (`subagent`) markers were added, a record-target running marker and its settled link are named by the record, for example `Open subagent:research`, independent of any shell rename. The paragraph as written contradicts the decoration contract the code ships and the ShellTab tests already pin.

## Approach

Revise only that paragraph so the tooltip and accessible-name rule distinguishes the two target kinds. Keep the role-target wording intact: `Open acp:<role>:<tab name>`, following the active role record through model fallback, and using the shell's current title or label before that role has a record. Add that a durable-record target's running marker and settled link use `Open <record name>`, named by the record and remaining independent of any shell rename. Leave the preceding subagent paragraph's started/completion placement wording untouched. No production code, tests, help, or user documentation change.

## Implementation steps

1. Edit `product/specs/shell-tab.md`, the "The marker and link are decorations" paragraph in Core ACP connections: replace the single blanket tooltip/accessible-name sentence with a two-kind rule, preserving the existing role fallback sentences and all surrounding decoration prose byte-for-byte.
2. Confirm the preceding subagent paragraph, the one beginning "An accepted `subagent` prompt is echoed", is unchanged.

## Tests

No new tests. The fix is documentation-only. The existing assertions in `web/src/plugins/shell/ShellTab.test.tsx` already pin the behavior the corrected spec describes: role markers are found by `Open acp:ask:shell1` and `Open acp:tell:shell1`, and the subagent record marker carries `Open subagent:research` as both `title` and `aria-label`, while running and after settling. These tests must keep passing untouched.

## Out of scope

Production behavior changes; edits to `thinking-marker-decoration.ts`, `useShellReplyWriters.ts`, or `ShellTab.test.tsx`; changes to the PR description; any other backlog entry.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the edit. Untouched WS/RPC tests in `src/index.test.ts` may fail with EPERM in this sandbox; that is environmental, not a regression.
