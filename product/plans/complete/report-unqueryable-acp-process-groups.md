# Report unqueryable ACP process groups

Complexity: 3/10

## Goal

Prevent local ACP shutdown from reporting success when process-group existence cannot be queried due to signal permission restrictions.

## Approach

Treat `EPERM` from the process-group existence probe as evidence that the group is present. Keep `ESRCH` as the only absence result, allowing the existing bounded SIGTERM/SIGKILL sequence to reject with its timeout error when the group remains inaccessible. Preserve the synchronous `kill()` API, shutdown timing, and agent cleanup warning behavior.

## Implementation steps

1. Update the process-group existence probe to distinguish `ESRCH` from `EPERM` correctly.
2. Add focused shutdown tests for an `EPERM` probe and an `ESRCH` probe.
3. Update the ACP behavior spec and remove this resolved entry from the PR backlog.

## Tests

- `src/acp/index.test.ts` proves `EPERM` cannot make shutdown resolve successfully and that `ESRCH` still reports an absent process group.
- The listed shutdown tests cover `EPERM` as an unconfirmed process group and `ESRCH` as an absent process group.

## Specs / docs

Update `product/specs/acp.md` to specify that inability to query process-group existence is reported as uncertain teardown and does not count as confirmed exit. Existing user documentation does not describe this internal cleanup behavior.

## Out of scope

Do not change shutdown timing, remote ACP cleanup, the synchronous kill API, cleanup-warning behavior, other ACP lifecycle policies, the PR description, or any other backlog entry.
