<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's label-based lookup for the follow-up help transcript assertion.

Existing Issue: The startup predicate locates visible `janus` by label, but the follow-up Markdown predicate still inspects `event.tabs[0].bufferLines`, despite the completed plan requiring the follow-up transcript assertion to locate `janus` by label. Severity: 5/10

Existing Risk: 5/10 - If a notification tab precedes `janus` in a state update, help output in `janus` does not satisfy the index-zero predicate and the real WebSocket test times out even when the startup behavior is correct.

Proposal Risk: 2/10 - Matching the transcript state by the `janus` label removes this ordering dependency, while the existing end-to-end transcript check continues to verify Markdown output.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "find streamed help output by the janus tab label". In `src/index.test.ts`, update the follow-up `waitFor` predicate in `accepts a token-gated client and streams transcript state` to find the `janus` tab in each state and check that tab's `bufferLines` for Markdown, rather than assuming `tabs[0]` is `janus`. Keep the real token-gated WebSocket flow and existing transcript assertion. The preceding state selection and the `help` command already exercise the same stream; verify the change alongside the hidden-system and active-janus startup assertions in that case.
