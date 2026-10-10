<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Reset launcher summary state on tab recreation and reject replies from obsolete tab incarnations.

Existing Issue: Launcher state and priming survive ordinary tab closure because dispose runs only on plugin shutdown or disablement, and replies are filtered against the pre-await live snapshot rather than current tab identities. Severity: 7/10

Existing Risk: 7/10 - A reopened launcher can reuse stale priming and summaries, and a late reply can describe a newly recycled label using a closed tab's output.

Proposal Risk: 2/10 - Per-incarnation identity checks discard obsolete work while allowing current summaries to continue normally.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "reset launcher summary state on tab recreation and reject replies from obsolete tab incarnations". In src/plugins/launcher/activate.ts, reset launcher and summarizer state when the singleton's creation factory actually runs, and use a generation token to reject work started by a previous launcher incarnation. Extend the host activity contract in src/plugins/activity.ts to expose a stable identity for each tab incarnation, then re-read live activity after awaited prompts before accepting summaries or cursors. Prune disappeared identities on topic delivery and exclude reused labels from old summaries. Add close-and-reopen and deferred-reply tests using the real TabPluginHost and TabManager lifecycle; the existing activation test calls dispose manually and therefore misses ordinary closure.


* Repair the new review fixtures so they exercise the published types and real lifecycle contracts.

Existing Issue: The new tests contain incomplete activity objects, unsupported view values, missing required prompt arguments, and simplified fakes that bypass singleton creation and ordinary tab closure. Severity: 6/10

Existing Risk: 6/10 - The intended regression suite can fail before asserting behavior or pass while the host integration remains broken.

Proposal Risk: 2/10 - Typed faithful fixtures and focused integration cases expose contract mismatches without changing production behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "repair the new review fixtures so they exercise the published types and real lifecycle contracts". Repair src/plugins/launcher/summarizer.test.ts so its TabActivityEntry helper supplies dotColor and active, its view values match the contract, every buildSummarizerPrompt call supplies a delimiter, and the asserted marker text matches the actual description. Repair the moved-topic fixture in src/plugins/launcher/activate.test.ts to deliver TabActivityEntry objects rather than LauncherTabRow projections lacking logLength. Replace forced capability casts where they hide these mismatches and add host-backed singleton and close tests. Add the plan's currently absent regression assertions for janus init idempotent launcher-file seeding, timestamp writers in src/tab/transcript/events.ts, and tabs.focus on a missing label, using the existing project-init, transcript, and topic test files. Run the appropriate diff-scoped checks during the separate implementation task; this review has identified these issues by reading only.


* Keep the new per-tab ACP tool restriction on the tab record to avoid additional lifecycle bookkeeping debt.

Existing Issue: AcpManager adds a label-keyed withoutTools set and separate closeTab and closeAll cleanup solely for state that belongs to TabRuntime, contrary to the repository's per-agent ownership rule. Severity: 5/10

Existing Risk: 4/10 - Future tab teardown or identity changes must keep another manager-owned label collection synchronized, making stale restrictions and inconsistent ownership easier to introduce.

Proposal Risk: 2/10 - A tab-owned restriction follows the tab's lifetime naturally, with lifecycle tests needed to preserve restrictions across connection resets.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "store the ACP tool restriction on the owning tab runtime". Add a narrowly named ACP tool-policy field to TabRuntime in src/tab/types.ts and have src/acp/manager.ts record and read it through the actual owning tab when start receives withoutTools. Remove the new label-keyed set and the cleanup overrides whose only purpose is maintaining it, retaining AcpSessionManager's connection teardown. Preserve the documented sticky policy across resetAcp and connection replacement, and ensure a recreated tab gets the ordinary policy even when its label is reused. Extend src/acp/manager.test.ts with real tab records for restriction persistence and replacement, and retain the real-loop contrast cases in src/acp/plugin-session.test.ts proving a restricted reply cannot execute tools while an ordinary reply can. Align product/plans/complete/acp-tool-less-plugin-sessions.md with tab-owned storage without changing the additive capability contract.
