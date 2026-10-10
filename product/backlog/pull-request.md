<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle labels and icon names that collide with inherited object properties.

Existing Issue: Summary and icon lookups use ordinary object indexing, so a valid tab label such as `__proto__` reads an inherited object as its absent summary, incarnation tracking cannot store that key normally, and an unknown icon named `constructor` is incorrectly treated as known. Severity: 6/10

Existing Risk: 6/10 - A supported explicit tab name can make React reject the summary child and disable the launcher, while inherited keys can also bypass stale-summary pruning and the promised icon fallback.

Proposal Risk: 2/10 - Dictionary storage must still survive JSON transport, and tests using parsed payloads can expose any difference between internal maps and the ordinary objects clients receive.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "make launcher dictionary keys safe for arbitrary labels and icon names". In `web/src/plugins/launcher/TabList.tsx` and `web/src/plugins/launcher/launcher-icons.ts`, distinguish own entries from inherited properties before returning a summary or icon. Make the incarnation dictionary in `src/plugins/launcher/payload.ts` and its writes and pruning in `src/plugins/launcher/activate.ts` safe for arbitrary string keys, using a Map or a dictionary without a prototype internally. Add client regressions for `__proto__`, `constructor`, and `toString` labels with no summary after a JSON round trip, icon fallback cases for the same names, and a server regression proving a summary under `__proto__` is pruned when its tab incarnation changes. Preserve the payload's JSON shape and the existing close/reopen coverage.


* Keep tab clicks functional after external focus changes and tier reordering.

Existing Issue: A tab row suppresses a click whenever its numeric index matches the last confirmed index, although confirmation survives same-length payload changes and does not indicate which tab the host currently has focused. Severity: 6/10

Existing Risk: 5/10 - Returning to a previously clicked needs-input row after focusing another tab, or clicking a different tab that moved into the old index, can silently fail to navigate.

Proposal Risk: 2/10 - Focus acknowledgement is asynchronous, so the click policy must tolerate a pending acknowledgement without confusing a displayed position with a stable tab identity.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "focus launcher tab rows after external focus and tier changes". Replace the index-based suppression in `web/src/plugins/launcher/LauncherTabRowView.tsx` with a policy based on the row's stable identity and the host's current active fact, or send the ordinary focus intent on each navigation click. Keep selection and keyboard handoff through the shared list hook. Extend `web/src/plugins/launcher/LauncherTab.test.tsx` with a needs-input row clicked, acknowledged active, then made inactive by an external focus update and clicked again at the same index; also cover a same-length tier reorder placing a different label at the previous confirmed index. Preserve Enter activation and server-owned unread dwell, and adapt the repeat-click test to acknowledge actual host focus before suppressing a repeat.


* Deliver the plan's visible replies for Configure results and rejected command intents.

Existing Issue: Configure returns a dispatch-result object that the client discards through a string-only check, while typed-command and rail-command promise rejections clear the reply instead of displaying their error. Severity: 5/10

Existing Risk: 4/10 - An edit refusal such as an oversized configuration file, or a rejected command request, leaves the launcher showing no explanation even though the host supplied one.

Proposal Risk: 2/10 - Shared reply handling must continue to omit text already rendered by the core ACP response surface and respect application-handled picker commands.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "show Configure dispatch results and rejected launcher commands". Route Configure in `web/src/plugins/launcher/LauncherTab.tsx` through the same typed dispatch-result reporting used by `web/src/plugins/launcher/useLauncherSubmit.ts`, and replace both silent rejection handlers with a visible error message. Preserve `coreResponse` suppression and application interception. Extend `web/src/plugins/launcher/LauncherTab.test.tsx` with Configure returning `{ dispatched: true, output }`, Configure returning an unclaimed result, and rejected typed and rail intents. Use the oversized-file refusal from `src/openers/editor.ts` as a real host outcome the reply area must display. This completes the reporting steps promised by `product/plans/complete/launcher-rail-shares-the-bar-path.md`.


* Complete the plan's faithful contract fixtures and command-id collision regression.

Existing Issue: Activation fixtures omit required activity revisions and send `tabLabel` instead of the published intent's `tab`, the activity fake returns null for an absent question, the activation ACP start fake omits the session identity, and the positional-id collision test contains no collision. Severity: 5/10

Existing Risk: 5/10 - Tests exercise impossible host values, a revision-only case computes NaN, and the intended session-reuse and generated-id collision regressions can pass without covering their production contracts.

Proposal Risk: 2/10 - Correcting fixtures may expose existing failures, but preserving their behavioral assertions makes those failures useful rather than hiding them with casts.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "finish faithful launcher fixtures and the generated-id collision regression". Supply numeric `revision` values for every `TabActivityEntry` in `src/plugins/launcher/activate.test.ts`, construct requests with the published `TabPluginIntent` field `tab`, and have `startAcp` and `promptAcpResult` report the same stable session. Assert priming occurs once across two flushes whose transcripts actually change. In `src/plugins/activity.test.ts`, make the no-question fake return undefined as `src/questions.ts` does, and assert an ordinary row does not need input. In `src/plugins/launcher/commands-file.test.ts`, place an explicit `command-1` id at index 0 and an unnamed entry at index 1 so the fixture genuinely collides, then assert the explicit id survives and both resulting ids are unique. Keep fixtures typed without forced casts that conceal these differences and run the appropriate diff-scoped checks in the implementation task.


* Honor zero and invalid transcript-tail limits in the new activity capability.

Existing Issue: The activity reader attaches a tail for every defined limit, and `slice(-0)` or `slice(-NaN)` selects the whole log rather than zero entries, contrary to the plan's positive-limit-only rule. Severity: 4/10

Existing Risk: 4/10 - A metadata consumer passing zero can unexpectedly receive transcript content, while non-finite limits can make the reader assemble an unnecessarily large intermediate string before its character cap is applied.

Proposal Risk: 1/10 - Existing positive integer reads remain unchanged, and explicit boundary tests can detect any unintended narrowing of the launcher's eight-entry read.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1627 "normalize activity transcript-tail limits before reading content". Normalize or validate `tailLines` once in `src/plugins/activity.ts` before slicing any log, accepting a documented positive finite entry count and omitting transcript content for zero, negative, or non-finite values. Retain the existing character budget and the omitted-limit display behavior. Add boundary cases to `src/plugins/activity.test.ts` for zero, negative values, NaN, Infinity, and valid counts of one and eight; assert invalid or zero reads carry no tail. Align the capability description in `src/plugins/api.ts` and `documentation/developer-documentation/tab-plugins.md` with the resulting rule.


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
