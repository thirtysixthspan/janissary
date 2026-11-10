<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the security gap where a missing bundled adapter can still resolve to an unpinned executable from PATH.

Existing Issue: When a bundled adapter is absent from the install's `node_modules/.bin`, `locateAcpCommand` returns its bare command name, which `connectAcp` passes through `sandboxSpawn` to `spawn`; the preserved `PATH` can therefore resolve a same-named server or interactive-shell executable despite the lookup's early return. Severity: 8/10

Existing Risk: 7/10 - A legacy or untrusted adapter can start a role session with different configuration and expose harness tools, defeating the feature's core restriction while the session appears to launch normally.

Proposal Risk: 1/10 - The installed adapter runs by absolute path, or the missing absolute path fails visibly and the role can use its existing model fallback; PATH decoys cannot execute.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1983 "make missing bundled ACP adapters fail closed through the actual spawn". In `src/acp/command-path.ts`, do not return a bare name when a `BUNDLED_ACP_ADAPTERS` command is missing from the install's `.bin`; return its absolute expected install-local path or an explicit unavailable result that `connectAcp` handles before spawning, so no PATH lookup can select a substitute. Update `src/acp/command-path.test.ts` to place a same-named executable on the server PATH and another on the interactive-shell PATH, then verify neither is executed when the install-local adapter is absent; exercise the spawn boundary rather than only asserting what `locateAcpCommand` returns. Preserve the existing behavior for bundled adapters present in `.bin` and for unbundled commands such as `opencode`. Reconcile the fail-closed plan and comments with the behavior the tests prove; in particular, the current assertion that returning a bare command makes spawn fail is not valid while `PATH` contains a candidate.
