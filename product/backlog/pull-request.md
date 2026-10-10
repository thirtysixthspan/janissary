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


* Handle core ACP command replies by rendering the host's response surface in the launcher.

Existing Issue: The launcher discards dispatch results marked coreResponse but never renders useAcpResponse, so an acp command typed into its bar has no visible answer or streaming controls. Severity: 7/10

Existing Risk: 6/10 - A user can start a provider request from the launcher and receive neither its answer nor the response panel needed to stop or reset it.

Proposal Risk: 2/10 - Composing the existing host response surface exposes its controls, although automatic summarizer output sharing that ACP session needs an explicit presentation decision.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "render core ACP command replies in the launcher". In web/src/plugins/launcher/LauncherTab.tsx, consume useAcpResponse through the published client API and render the host-provided node in a scrollable area beside the existing reply and command bar, following web/src/plugins/shell/ShellTab.tsx. Keep web/src/plugins/launcher/useLauncherSubmit.ts from duplicating coreResponse text, and decide how automatic summarizer turns appear when the same session is shown rather than silently dropping user-requested responses. web/src/plugins/PluginBody.tsx supplies the response scope but does not render its node, and src/commands/acp.ts marks this command as a core response. Extend web/src/plugins/launcher/LauncherTab.test.tsx with a populated host response scope and a dispatched ACP line, asserting visible streaming output and host controls without a second textual reply; existing tests cover list rendering but not this command path. Update product/specs/launcher.md to describe the resulting response presentation.


* Handle automatically answered permission gates without falsely raising the needs-you tier.

Existing Issue: busyStatusHandler records every detected gate as gateOpen even when its approver is clearing it, and the activity reader interprets that raw screen fact as needsInput independently of the existing stuck decision. Severity: 5/10

Existing Risk: 5/10 - Normal auto-approved harness work repeatedly jumps into the highest-priority tier and tells the user to answer prompts the application is already answering.

Proposal Risk: 2/10 - Separating gate presence from required human attention preserves genuine blocked prompts, with capture-order tests needed to catch a missed transition when approval stands down.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "exclude automatically answered gates from the needs-you tier". In src/harness/busy-status.ts, derive and record whether a detected permission gate actually requires the user using the same approver absence or isStuck decision already passed to BusyTracker.observe, also respecting the parked resumer state. Either give that attention fact its own TabRuntime field in src/tab/types.ts or explicitly redefine the existing field and its comments, then use it in src/plugins/activity.ts while retaining pending questions as an independent needsInput source. Preserve the capture ordering in src/harness/capture/wire.ts, where approval runs before busy classification. Extend src/harness/busy-status.test.ts and src/plugins/activity.test.ts with a successfully auto-approved gate, an identical gate that makes the approver stand down, a gate without an approver, and a cleared gate, checking both row status and dirty emission. Keep existing busy and unread behavior unchanged and document the distinction in product/specs/launcher.md.


* Deliver the plan's single-click tab focusing instead of requiring confirmation on a second click.

Existing Issue: LauncherTabRowView routes tab clicks through openOnConfirm, so the first click on a different row only selects it despite the plan, spec, and PR description promising the same focus behavior as a tab-strip click. Severity: 5/10

Existing Risk: 5/10 - A user clicks a tab expecting to inspect its work but remains on the previous tab, and the intended unread dwell does not begin.

Proposal Risk: 2/10 - Immediate focus restores the promised navigation, with tests needed to prevent duplicate focus requests and preserve keyboard selection.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "focus launcher tab rows on the first click". In web/src/plugins/launcher/LauncherTabRowView.tsx, keep selection bookkeeping but activate on the first row click using the shared list-selection contract or an explicit focus callback. Leave the separately documented two-click command confirmation in web/src/plugins/launcher/CommandRail.tsx intact. Update the tab-click case in web/src/plugins/launcher/LauncherTab.test.tsx to assert one click sends exactly one focus-tab intent, and add keyboard activation and a closed-target regression case through src/plugins/topics.ts and the existing tab navigation tests. src/tab/navigation-commands.ts already owns the unread dwell and rejects missing or docked targets, so preserve that server route rather than clearing unread locally. Keep product/specs/launcher.md and the completed plan consistent with the resulting interaction.


* Correct the plan's whole-file fallback claim to match its shipped partial configuration validation.

Existing Issue: The completed launcher plan says a malformed entry falls back to the default command set and declines entry-scoped validation, while the implementation, its tests, and the functional spec keep usable entries from a mixed file. Severity: 3/10

Existing Risk: 4/10 - A later implementation based on the completed plan can replace valid user commands with defaults while believing it preserves the intended configuration contract.

Proposal Risk: 1/10 - A consistent recorded policy removes that ambiguity, with the existing mixed-entry test exposing accidental behavior changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "align the completed launcher's malformed-entry policy with partial validation". In product/plans/complete/sidebar-launcher-tab.md, distinguish unreadable files, invalid JSON, a wrong top-level shape, and files with no usable entries from mixed arrays whose usable rows survive. Clarify the out-of-scope item so the deferred versioned and merged configuration format does not also claim the shipped partial-validation policy was declined. Use readLauncherFile in src/plugins/launcher/commands-file.ts, the mixed-entry case in src/plugins/launcher/commands-file.test.ts, and product/specs/launcher.md as the existing behavior references; preserve that behavior and make the plan's test list describe it explicitly. Check the PR description's fallback wording for the same ambiguity during this separate implementation task and update it if needed. Verify the existing decoding tests and confirm neither malformed entries nor an empty array produce clickable invalid rows.


* Keep the new per-tab ACP tool restriction on the tab record to avoid additional lifecycle bookkeeping debt.

Existing Issue: AcpManager adds a label-keyed withoutTools set and separate closeTab and closeAll cleanup solely for state that belongs to TabRuntime, contrary to the repository's per-agent ownership rule. Severity: 5/10

Existing Risk: 4/10 - Future tab teardown or identity changes must keep another manager-owned label collection synchronized, making stale restrictions and inconsistent ownership easier to introduce.

Proposal Risk: 2/10 - A tab-owned restriction follows the tab's lifetime naturally, with lifecycle tests needed to preserve restrictions across connection resets.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "store the ACP tool restriction on the owning tab runtime". Add a narrowly named ACP tool-policy field to TabRuntime in src/tab/types.ts and have src/acp/manager.ts record and read it through the actual owning tab when start receives withoutTools. Remove the new label-keyed set and the cleanup overrides whose only purpose is maintaining it, retaining AcpSessionManager's connection teardown. Preserve the documented sticky policy across resetAcp and connection replacement, and ensure a recreated tab gets the ordinary policy even when its label is reused. Extend src/acp/manager.test.ts with real tab records for restriction persistence and replacement, and retain the real-loop contrast cases in src/acp/plugin-session.test.ts proving a restricted reply cannot execute tools while an ordinary reply can. Align product/plans/complete/acp-tool-less-plugin-sessions.md with tab-owned storage without changing the additive capability contract.
