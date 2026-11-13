<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Explain in the file help page that expectedHash is the editor's internal content fingerprint, which file read does not print, so a user does not guess a value and get a misleading changed-on-disk refusal.

Existing Issue: help/file.md tells users file write takes an optional expectedHash and refuses the write when the file changed, but no command shows the value, which is the private contentHash fingerprint in src/editor/save-conflict.ts, so any value a user types is refused as This file changed on disk since it was loaded; the mutation-primer fix removed the field from the agent primer for exactly this reason. Severity: 2/10

Existing Risk: 3/10 - A user who tries the documented option gets a refusal that says the file changed when it did not, and may distrust the file or retry in ways that lose work.

Proposal Risk: 1/10 - The page states what the value is and when to omit it; a user who still supplies a guessed value has the explanation beside the refusal.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "explain in help/file.md that expectedHash is the editor's internal fingerprint". In the Writing and editing section of help/file.md, follow the expectedHash sentence with one saying the value is the editor's internal content fingerprint, that file read does not print it, and that a write without it simply creates or overwrites the file, so typed writes normally leave it out. Update the matching sentence in product/specs/acp.md (Typed file writes and edits) the same way. Change no code, and keep parseFileMutation accepting the field as the plan decides. Any help-page inventory test must keep passing.


* Rename the tool-table test that says the file entry is included only when file read is granted, since it now covers any file command grant.

Existing Issue: The test titled "includes the file entry only when file read is granted" in src/acp/tool-table.test.ts now filters out every file command, and createAcpToolTable includes the file entry for a write or edit grant alone, so the title states a rule the code no longer follows. Severity: 1/10

Existing Risk: 2/10 - A later reader trusts the title, adds a mutation-only grant expecting no file tool, and misreads a failure or writes code against the old rule.

Proposal Risk: 1/10 - Only a test title changes; if the behavior regressed, the sibling test "selects the file tool for any file grant" would still catch it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "rename the stale file-entry tool-table test title". In src/acp/tool-table.test.ts, rename "includes the file entry only when file read is granted" to something like "gives a file-read-only grant the read primer and omits the file entry when no file command is granted", leaving its body unchanged. The test "selects the file tool for any file grant" in the same file already pins the any-grant behavior.
