<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep long configured command rails scrollable alongside the tab list and command bar.

Existing Issue: The command rail uses `flex: 0 0 auto` with no height bound, so it neither shrinks nor gains a constrained scrolling viewport when a user's command list exceeds the sidebar height. Severity: 4/10

Existing Risk: 4/10 - A long launcher configuration consumes the available column height, collapses the tab list, and can push the command bar or later rail entries outside the visible sidebar.

Proposal Risk: 2/10 - Sharing a constrained height between the two lists must work at small window sizes as well as with the default rail.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "bound the command rail while keeping launcher navigation reachable". Adjust the launcher layout in `web/src/plugins/launcher/launcher.css` so the command rail can shrink and scroll within a bounded portion of the body while the tab list and command bar retain usable space. Preserve the host's sidebar sizing and the composed selection ref's scroll-into-view behavior. Verify a long custom rail in a constrained-height browser viewport, including reaching its last command, navigating a tab row, and typing in the bar; retain the default-rail client interaction coverage in `web/src/plugins/launcher/LauncherTab.test.tsx`. Document the long-list scrolling behavior in `product/specs/launcher.md`.


* Preserve the host's plugin namespace when identifying the launcher's own tabs.

Existing Issue: The new ownership predicate compares only `instanceKey`, while the host identifies a plugin tab by the pair of plugin id and instance key, so another plugin's valid key named `launcher` is classified as belonging to the launcher. Severity: 4/10

Existing Risk: 3/10 - A plugin contribution using that key silently disappears from the rail and its summary inputs, creating a hidden naming constraint on otherwise independent plugins.

Proposal Risk: 1/10 - Matching both ownership fields narrows the exclusion to the actual singleton, and cross-owner collision tests can expose any accidental exclusion of another plugin.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "identify launcher ownership by plugin id and instance key". Update `isLauncherOwn` in `src/plugins/launcher/shared.ts` to require both the launcher plugin id and `LAUNCHER_INSTANCE_KEY`, matching `pluginTabByInstanceKey` in `src/tab/lookup.ts`. Extend `src/plugins/launcher/shared.test.ts` with another plugin using the exact `launcher` instance key, and extend `src/plugins/launcher/activate.test.ts` to prove that undocked tab remains in both the payload and summary inputs. Preserve the existing exclusion of an actual launcher whose host-minted label is `launcher-2`, and align the ownership explanation in `product/plans/complete/launcher-names-its-own-tabs.md`.


* Align the final description and summarizer documentation with the implemented lifecycle and tool policy.

Existing Issue: The PR body still names `gateOpen` and a length-only cursor, the primary plan retains obsolete last-entry timestamp and ACP-permission-only enforcement claims, and the ACP spec says a typed `acp` command runs the full tool table despite the tab's sticky restriction. Severity: 4/10

Existing Risk: 4/10 - A contributor can rely on an obsolete change detector or security enforcement point and undo fixes already present in the implementation.

Proposal Risk: 1/10 - Documentation can still drift later, but matching the runtime fields and enforcement point to existing regression tests makes the current boundary reviewable.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "align final launcher documentation with incarnation-aware cursors and sticky tool restrictions". Update the live PR description to name `gateNeedsUser` and describe transcript revision plus length and tab incarnation as the summarizer's change and ownership facts. Reconcile contradictory paragraphs in `product/plans/complete/sidebar-launcher-tab.md`, including the obsolete claim that no runtime timestamp writer is needed and the claim that ACP-level permission denial alone makes the summarizer tool-less. State that `startAcp({ withoutTools: true })` records a tab-owned policy enforced by omitting the host tool table in `src/acp/manager.ts`. Correct `product/specs/acp.md` so a typed prompt on that restricted tab is also restricted until the tab closes. Keep runtime behavior unchanged and use the existing ACP policy, transcript-revision, and tab-incarnation tests as the documentation reference.
