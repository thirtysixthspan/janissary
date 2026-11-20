<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's promise that disabling file list also refuses the file ls alias.

Existing Issue: The description and application-commands spec say disabling file list refuses both spellings and that ls is offered or hidden with the file list row, but resolveApplicationCommand in src/application-commands.ts carries no ls alias on the file list row, so typed dispatch and completion resolve file ls to the parent file builtin instead. Severity: 6/10

Existing Risk: 5/10 - A user who disables only file list can still run and see completion for file ls, so a supposedly disabled command stays reachable from the command bar while the ACP gate, which rewrites the alias through nativeCommandName, correctly refuses it.

Proposal Risk: 2/10 - One alias on the native row makes typed dispatch, completion, and the ACP gate consult the same setting, and no new settings row or grant is introduced, which is the alias shape the plan requires.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2115 "tie the file ls alias to the file list settings row". In src/application-commands.ts give the native file list row the alias ls so resolveApplicationCommand('file ls ...') resolves to file list and disabledApplicationCommand in src/native-commands/policy.ts checks that row's Enabled setting; this also makes completionPolicy in src/completion/command-policy.ts hide ls when file list is disabled and show it when enabled. Update the file list row assertion in src/application-commands.test.ts that currently expects no aliases, and add cases to src/native-commands/policy.test.ts and src/completion/file-read.test.ts proving that disabling file list refuses file ls, hides it from completion, and that disabling the parent file row refuses both spellings. Leave nativeCommandName in src/acp/native-commands.ts as the ACP-side alias so the two routes stay consistent.
