<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Rename the tool-table test that says the file entry is included only when file read is granted, since it now covers any file command grant.

Existing Issue: The test titled "includes the file entry only when file read is granted" in src/acp/tool-table.test.ts now filters out every file command, and createAcpToolTable includes the file entry for a write or edit grant alone, so the title states a rule the code no longer follows. Severity: 1/10

Existing Risk: 2/10 - A later reader trusts the title, adds a mutation-only grant expecting no file tool, and misreads a failure or writes code against the old rule.

Proposal Risk: 1/10 - Only a test title changes; if the behavior regressed, the sibling test "selects the file tool for any file grant" would still catch it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "rename the stale file-entry tool-table test title". In src/acp/tool-table.test.ts, rename "includes the file entry only when file read is granted" to something like "gives a file-read-only grant the read primer and omits the file entry when no file command is granted", leaving its body unchanged. The test "selects the file tool for any file grant" in the same file already pins the any-grant behavior.
