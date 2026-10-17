<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's label-based startup assertions so notifications cannot leave the WebSocket test timing out.

Existing Issue: The startup wait still requires `janus` at `tabs[0]`, the new assertion requires exactly `['janus', 'system']` with `activeTab` zero, and the help-state wait still inspects `tabs[0]`, although startup notifications may precede `janus`. Severity: 8/10

Existing Risk: 6/10 - When startup emits a notifications tab first, this test still times out despite `janus` being visible and focused, leaving the reported CI failure unresolved.

Proposal Risk: 2/10 - Finding `janus` by label and comparing its index with `activeTab` removes the ordering hazard while retaining checks for the hidden managed system shell and streamed help output.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "replace startup-state array-position assumptions with label-based assertions". In `src/index.test.ts`, update the initial state wait to find a state containing a visible `janus` tab, then locate that tab by label and assert that `activeTab` equals its index; assert that the `system` tab exists with `hidden: true` and `systemShell: true` without requiring an exact tab list or order. Update the follow-up Markdown wait to find the `janus` tab by label before checking its `bufferLines`. Keep the real token-gated WebSocket flow and timeout values. Restrict timeout diagnostics to event types, RPC reply status, and state summaries (`label`, `hidden`, `systemShell`, and `activeTab`); do not include the full RPC `result`. Verify the focused startup test and diff-scoped checks, then confirm the PR remains open.
