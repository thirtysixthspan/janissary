<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the failed target read that the SSH export operation currently ignores, so an oversized or unreadable config is no longer replaced with an empty managed section

Existing Issue: `exportSshHosts` in `src/plugins/hosts/export-ssh.ts` ignores the optional `problem` returned by `readSshConfigFile` and always proceeds with `read.text`, which is empty for every read failure, so an existing SSH config that is too large or could not be read is overwritten with only the newly serialized managed section. Severity: 9/10

Existing Risk: 9/10 - Exporting to an existing config larger than the read limit silently destroys every manual host block in it, breaking SSH access to those hosts while reporting success, with no recovery path for the lost entries.

Proposal Risk: 2/10 - The operation refuses any target read problem other than `no such file` before writing, so the only changed behavior is a clear refusal on a path that previously destroyed data, while the missing-target and usable-target paths stay unchanged under their existing tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "refuse SSH export when the target config cannot be read". In `src/plugins/hosts/export-ssh.ts`, guard the result of `readSshConfigFile(targetPath)` immediately after it returns: when `read.problem` is set and is not `no such file`, return `{ ok: false, error: ... }` naming the display path and the problem word, mirroring the read guard already in `src/plugins/hosts/import-ssh.ts`; only `no such file` continues with empty text as a new file. Keep the unusable-catalog check ahead of the read so the forwarded notify behavior does not move. In `src/plugins/hosts/export-ssh.test.ts`, add a colocated case that writes a config over the read-size limit with manual host blocks present, calls `exportSshHosts` without mocking the read, and asserts both the refusal and that the target is byte-for-byte unchanged; the size-limit case for `readSshConfigFile` in `src/plugins/hosts/ssh-config-file.test.ts` and the existing write-failure case in this file cover the neighboring paths and must keep passing.
