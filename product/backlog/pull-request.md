<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Refuse a file glob line on the agent run's caller-side runner as well, so the description's promise that an agent's glob never falls through to the caller's directory holds even when the far side of a remote run sends one.

Existing Issue: `gateAgentCommand` refuses an agent run's `file glob` before it is routed, but `runGrantedAgentCommand` in the caller-side runner still refuses only mutation lines, so a `file glob` arriving there (as an `acp-tool-request` from a remote far side, which the local runner executes without re-gating) with the `file` grant is dispatched in the caller tab and lists the caller's local files, the exact fall-through the plan and description say cannot happen. Severity: 3/10

Existing Risk: 3/10 - Only a modified or misbehaving far side can send it, and secret files stay filtered, but it would expose the names of files in the caller's local directory to a remote host that was promised only its own workspace.

Proposal Risk: 1/10 - The extra check only refuses a line that the gate already refuses on the honest path, so the residual risk is a future routing change that skips both checks, which the added test would catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "refuse file glob in runGrantedAgentCommand like file write and file edit". In `src/agent/command-tools.ts`, extend the existing `isFileMutationCommandLine(input)` refusal in `runGrantedAgentCommand` to also refuse `isFileGlobCommandLine(input)` (imported from `src/file-glob/command.ts`) with the same `Agent: command not permitted: <command>.` text, so the caller-side runner mirrors `gateAgentCommand` in `src/acp/tool-table.ts`. Add a test beside the existing mutation-refusal coverage for `runGrantedAgentCommand` (find it by searching `src/agent/` tests for `runGrantedAgentCommand`) asserting that `file glob **/*`, bare `file glob`, and `/file glob x` are refused with and without the `file` grant and that nothing is dispatched, while `file read` behavior is unchanged. No spec change is needed unless `product/specs/agent-command.md` names which component refuses the glob; if it does, keep that sentence accurate.


* Consult the git-ignored set by the real location under a linked `--path`, so git-ignored paths are still skipped by default when the search starts at an in-root symbolic link, closing a functionality gap.

Existing Issue: Under an in-root linked `--path` such as `lnk` pointing at `src`, the walker looks up each entry in the ignored set by its link-named root-relative path (`lnk/dist`), while git reports the ignored entry by its real path (`src/dist`), so git-ignored folders and files below a linked start are listed without `--hidden`. Severity: 3/10

Existing Risk: 2/10 - A linked `--path` is uncommon, but when used it floods the result with build output or other ignored files, wasting the limit and the agent's context while contradicting the documented default that git-ignored paths are skipped.

Proposal Risk: 1/10 - The lookup gains one extra set-membership test per entry under a linked start, and the remaining edge (an ignore rule that only matches the link name) would surface as a listed path, never as a hidden one.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "skip git-ignored paths by real location under a linked file glob --path". In `src/file-glob/walk.ts`, when `state.realPrefix` is defined, make `isPruned` (or its caller in `walkDirectory`) also treat an entry as ignored when `realPrefix` joined with its start-relative path is in `options.ignored`, keeping the link-named lookup for the non-linked case and leaving the `--hidden` bypass unchanged. Add a test in `src/file-glob/glob.test.ts` inside the `git-ignored paths` block that creates an in-root link to `src` and asserts `**/*.ts --path <link>` omits the ignored `src/gen/x.ts` without `--hidden` and lists it with `--hidden`, plus a walk-level case in `src/file-glob/walk.test.ts` passing `realStart`. The existing ignored-set walk tests in `src/file-glob/walk.test.ts` and the `lists through an in-root link under the link name` test in `src/file-glob/glob.test.ts` must keep passing untouched.
