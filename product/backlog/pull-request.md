<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Refuse lone-surrogate write content and edit strings before they are encoded to UTF-8, so local and remote mutations reject them instead of silently writing or matching U+FFFD.

Existing Issue: applyMutation in src/file-write/tab-write.ts encodes write content with Buffer.from(content, 'utf8') and remoteEditFile in src/file-navigator/remote/port-reads.ts does the same to oldString and newString, which replaces every lone surrogate with U+FFFD, so the !isWellFormed() refusal in writeToolTextFile never fires through any real caller and a remote edit replaces or matches U+FFFD where the same local edit is refused. Severity: 4/10

Existing Risk: 3/10 - An agent that emits a JSON escape such as \ud83d without its pair gets Wrote <path>. while the file silently gains replacement characters, and a remote edit can rewrite existing U+FFFD text that the local route would refuse, so the two routes disagree on the same command.

Proposal Risk: 1/10 - Both routes refuse ill-formed text the same way; the remaining difference is only the wording a direct port caller sees, which a test pins.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "refuse lone-surrogate content and edit strings before UTF-8 encoding". In applyMutation in src/file-write/tab-write.ts, before any port call, refuse a write whose content is not well formed (String.prototype.isWellFormed) and an edit whose newString is not well formed with mutationFailureLine('Not a text file', path), and an edit whose oldString is not well formed with the No matching text line, matching the helper rules in src/file-write/filesystem.ts encodeToolText and src/file-write/edit-text.ts checkEditReplacement and replaceExactText. Also make remoteEditFile, and remoteWriteFile under the tool policy, in src/file-navigator/remote/port-reads.ts refuse ill-formed strings before encoding, so a direct port caller gets the same result as the local port. Add tests in src/file-write/tab-write.test.ts showing a typed write with "\ud800" content and an edit with a lone-surrogate oldString or newString are refused with nothing written on a local tab and no frame sent on a remote tab, and a port-level case in src/file-navigator/remote/port.test.ts. src/file-write/filesystem.test.ts and src/file-write/edit.test.ts already cover the helper-level refusal and must keep passing.


* Keep a leading U+FEFF in remote edit strings by decoding edit-file's oldString and newString without stripping a BOM, so a remote edit matches the same text as a local one.

Existing Issue: decodeBase64Text in src/remote/filesystem/edit-file-operation.ts decodes with new TextDecoder('utf-8', { fatal: true }), whose default ignoreBOM false strips a leading U+FEFF, so an oldString or newString that begins with a byte order mark loses it on the far side while the local edit and the far side's file decode (ignoreBOM true) keep it. Severity: 4/10

Existing Risk: 4/10 - An edit meant to remove or change a file's leading BOM reports a successful replacement on a remote tab while leaving the BOM in place, or inserts text without the BOM the caller sent, so the remote result silently differs from the local result for the same command.

Proposal Risk: 1/10 - Both sides decode the same way; the remaining hazard is another decoder on the remote path defaulting to BOM stripping, which the new round-trip test would catch for this operation.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "keep a leading BOM in remote edit-file strings". In src/remote/filesystem/edit-file-operation.ts, change decodeBase64Text to use new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }), matching decodeEditableText in src/file-write/edit-text.ts and decodeToolText in src/file-write/port-adapter.ts. Add a case to src/remote/filesystem/operations.test.ts showing edit-file decodes a base64 oldString and newString that start with U+FEFF to strings that still start with it, and a case to src/remote/serve-file-navigator.test.ts showing a far-side edit with oldString "﻿hello" and newString "hello" on a file holding "﻿hello\n" leaves "hello\n" on disk. The existing edit-file argument tests (strict base64, invalid UTF-8) must keep passing unchanged.


* Stop echoing a whole file write or edit payload back to the agent in the tool loop's follow-up prompt, so a large write does not double its size in the agent's context.

Existing Issue: runAcpToolLoop in src/acp/loop.ts builds every follow-up prompt as "Output of `<command>`:" followed by the result, and a file write or file edit command carries its whole content or old and new strings (up to 5 MiB), so each mutation step sends the full payload back to the agent on top of the reply that already contained it. Severity: 4/10

Existing Risk: 5/10 - A tell agent writing a large file can push the next prompt past the provider's context or cost budget, ending the run with a provider error after the write has already committed, or crowd out the conversation it needs to finish the task.

Proposal Risk: 2/10 - The follow-up names the command briefly and the result line already carries the path, so the agent still knows what ran; the remaining risk is losing context an agent relied on, which tests of the follow-up text would expose.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "shorten file mutation commands in the tool loop follow-up prompt". In src/acp/loop.ts, build the follow-up's "Output of" line from a short label rather than the raw command when the command is a file write or file edit, for example file write <path> or file edit <path>; keep loop.ts generic by injecting a describeCommand option through AcpLoopDeps from src/acp/drive-loop.ts that uses isFileMutationCommandLine and parseFileMutation from src/file-write/command.ts, falling back to the bare subcommand when the JSON does not parse. Leave transcript entries, connection records and h.ranCommand unchanged, since the plan keeps recording the full command text by user decision. Add tests in src/acp/drive-loop.test.ts (or the loop's own test file) showing a write's follow-up prompt does not contain the content but does contain the path and the result line, and that reads and other tools still echo their command verbatim. Existing loop, drive-loop, run-prompt and serve-acp-loop tests cover the follow-up shape for other commands and must keep passing.


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
