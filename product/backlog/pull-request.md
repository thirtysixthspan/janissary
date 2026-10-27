<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's single transcript reply for malformed `files` commands.

Existing Issue: `src/commands/files.ts` appends an empty command entry before delegating every non-print parse result to `FileNavigatorManager.open`, which appends a second entry when parsing returns an error, so malformed input such as `files expand "src` produces a blank reply followed by the error instead of one command result. Severity: 4/10

Existing Risk: 4/10 - Users and scripts that inspect transcript output receive an extra blank response for malformed `files` commands, obscuring the actual error.

Proposal Risk: 1/10 - Handling the parser error before appending the ordinary open entry leaves a single accurate reply; ordinary opens and print commands retain their existing transcript behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "avoid duplicate transcript entries for files parse errors". In `src/commands/files.ts`, handle `parsed.kind === 'error'` before appending the empty open entry, appending the parser's error once with the command and invocation, then return; alternatively restructure parsing so `FileNavigatorManager.open` owns the only error append without also recording the empty entry. Preserve the existing single output entry for valid open commands and `files print`. Extend `src/commands/files.test.ts` to assert that a malformed view clause and a malformed `files print` request each produce exactly one transcript result containing the expected error, and that valid opens and prints still produce one entry.
