# Rename the stale file-entry tool-table test
**Complexity: 1/10** — 0 production lines, 0 production files, 1 requirement (p=2.32)

## Goal

Give the test in `src/acp/tool-table.test.ts` titled "includes the file entry only when file read is granted" a title that matches what it checks, since `createAcpToolTable` includes the file entry for any file command grant, not only file read.

## Approach

Rename the test to "gives a file-read-only grant the read primer and omits the file entry when no file command is granted". Leave its body unchanged. The sibling test "selects the file tool for any file grant" already pins the any-grant behavior.

## Implementation steps

1. Rename the test title in `src/acp/tool-table.test.ts`.

## Tests

- The renamed test keeps its existing assertions and must still pass.

## Out of scope

- Any change to `createAcpToolTable` or to other tests.
- Specs and documentation: no behavior changes.
