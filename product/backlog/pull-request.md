<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's claim that a failing git lookup always means nothing counts as ignored, since a lookup cut off by the 30-second deadline now ends the search with no matches and the timeout line (description-only change).

Existing Issue: The description says that outside a git repository, or when git fails, nothing counts as ignored and only the fixed skip list applies, while the ignored-set loader now reports a deadline cut-off and the workspace entry then prints `(no matches)` followed by `(search stopped after 30 seconds; narrow the pattern or --path)` without walking, and the description never says the 30 seconds include the git lookup. Severity: 2/10

Existing Risk: 2/10 - A reader verifying a slow repository expects an unpruned listing on git failure and instead sees an empty timed-out result, and may file the documented deadline behavior as a regression.

Proposal Risk: 1/10 - The description then matches the code and the ACP spec's File glob section; a mismatch would recur only if the fallback changes again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "state the deadline-cut git lookup outcome in the PR description". This proposal changes ONLY the pull request description; no code, test, spec, or help edit. In the description's implementation paragraph, qualify "or when git fails, nothing counts as ignored" with the exception that a lookup stopped by the deadline ends the search with `(no matches)` and the timeout line rather than listing ignored paths, and in the timeout sentence of the What section say the 30 seconds include asking git for the ignored set. Match the wording of the corresponding sentence in `product/specs/acp.md` `### File glob`, and confirm it against `loadIgnoredPaths` in `src/file-glob/ignored.ts` and `globWorkspace` in `src/file-glob/glob.ts`.


* Mention in the pull request description that the caller-side agent runner also refuses file glob lines, so the description reflects the defense-in-depth refusal the caller-runner repair added (description-only change).

Existing Issue: The description credits only `gateAgentCommand` with refusing an agent run's glob, while the branch also makes the caller-side runner `runGrantedAgentCommand` refuse every `file glob` line with `Agent: command not permitted: <command>.`, so that a glob a remote far side sends back as a caller command is refused rather than run in the caller tab. Severity: 2/10

Existing Risk: 2/10 - A reviewer weighing the agent boundary from the description believes one gate guards it, and a later refactor that removes the second refusal as redundant would pass review on the description's word.

Proposal Risk: 1/10 - The description names both refusals; the second could still be removed later, but its colocated test pins it.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "mention the caller-side runner's file glob refusal in the PR description". This proposal changes ONLY the pull request description; no code, test, spec, or help edit. In the decisions paragraph, after the sentence about `gateAgentCommand`, add that `runGrantedAgentCommand` in `src/agent/command-tools.ts` refuses the same glob lines with the same text, mirroring its mutation refusal, so a glob line arriving on the caller side from a remote run is refused too, and that `file globs x` is not a glob line. Match the wording of the corresponding sentence in `product/specs/agent-command.md`; `src/agent/command-tools.test.ts` already pins the behavior.
