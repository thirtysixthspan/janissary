<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep tilde-fenced examples out of agent command execution.

Existing Issue: Command extraction ignores only triple-backtick fences, so a final `janissary ...` or permitted `question ...` line inside a Markdown tilde-fenced block is treated as executable. Severity: 6/10

Existing Risk: 6/10 - A task response that presents an approved command as a `~~~` code example can trigger that command even though the agent is showing it as text rather than requesting execution.

Proposal Risk: 2/10 - Recognizing both supported Markdown fence markers and their closing lengths keeps fenced examples inert; only malformed or unsupported fence syntax would remain ambiguous.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1672 "ignore tilde-fenced examples during agent command extraction". Update `extractAgentCommand` in `src/agent/command-tools.ts` to track Markdown fenced blocks opened with either backticks or tildes, including the opening marker character and minimum run length, and inspect candidate command lines only outside those blocks. Keep the final-nonempty-line rule and existing inline-backtick handling. Extend `src/agent/command-tools.test.ts` with tilde-fenced final `janissary` and permitted bare `question` examples, plus a case proving a later real command outside the fence is still extracted. The existing backtick fence, earlier-line, and question-grant cases in that test file must continue to pass.
