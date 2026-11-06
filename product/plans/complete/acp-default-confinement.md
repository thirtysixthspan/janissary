# Confine every ACP session to its working directory

Complexity: 5/10

## Goal

Give ordinary shell and monitor ACP sessions the same filesystem confinement as workspace ACP sessions.

## Approach and implementation steps

1. Extend sandbox spawn options with an optional private scratch directory; retain the existing sibling scratch default for workspace callers. Use that directory consistently for temporary files and credential environment construction.
2. Have ACP default its confinement root to its working directory. Allocate ordinary-session scratch under the project's ignored runtime directory, reject symlinked runtime directories, seed the existing OAuth bridge there, and clean up on process exit or spawn error. Retain workspace-owned scratch and credentials. Existing sandbox availability and configuration rules continue to apply.
3. Cover default confinement, workspace preservation, scratch placement, credential permissions/cleanup, and absence of a saved login in tests. Run check-diff after each step.
4. Update ACP/sandbox/workspace specs and applicable existing documentation, promote the plan, remove the resolved issue, and ship through the merge workflow.

## Tests

Assert every ACP launch supplies a confinement root; ordinary sessions use private in-project scratch even without OAuth; sandbox parameters and temporary environment use the explicit scratch path; existing workspace credentials remain shared; reject symlinked runtime storage; retain cleanup tests.

## Out of scope

Adding a new operating-system sandbox, changing global sandbox availability/configuration, redesigning harness carve-outs, or changing other backlog entries.
