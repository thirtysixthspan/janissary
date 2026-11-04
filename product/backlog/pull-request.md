<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the spec's capped tool-step report through the settled shell reply and the connection tab, because the removed response panel was its only visible surface.

Existing Issue: The ACP loop still appends `(stopped after N tool steps)` to the invoking tab's log, but the web shell renders only the one settled background reply, the connection tab renders only recorded activity, and the record feed never receives that entry, so the cap has no user-facing surface after the panel removal even though the ACP spec still says it reports. Severity: 4/10

Existing Risk: 5/10 - A prompt that reaches the eight-step cap returns an apparently complete but truncated answer, so a reader cannot tell the result was cut short or whether to retry a narrower request.

Proposal Risk: 1/10 - The notice becomes part of the single settled reply and the recorded answer; the only residual risk is a deliberate product decision that the cap should not be reported, which would instead require correcting the spec and user docs.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "restore the capped tool-step notice in the settled reply". In `src/acp/run-prompt.ts`, compose the settlement reply as the existing `lastAnswer` plus a trailing `(stopped after <maxSteps> tool steps)` paragraph when `finished` receives `reason === 'capped'`, pass that composed text to `settleAcpPrompt`, and remove the separate `appendAcp` cap entry so the same notice does not appear twice. Keep `answerCoreRecord` saving the composed text so the connection tab's final answer carries it, and keep every other settlement path unchanged. Add coverage in `src/acp/plugin-session.test.ts` and `src/commands/acp.test.ts` that a capped prompt produces exactly one background reply whose output contains the notice and no second reply, and that the record's answer contains it. Update `product/specs/acp.md` and `documentation/user-documentation/advanced-agents/acp-agent.md` to name the settled shell reply as the surface; if the product instead chooses not to report the cap, change the code to remove the notice consistently and update those documents to say so. Existing answer, refusal, usage, error, close, and cancellation tests must keep passing unchanged.


* Restore or retire the Ctrl+T tool-step collapse shortcut, which no longer controls a visible ACP surface after the response panel's removal.

Existing Issue: `web/src/useWindowKeys.ts` still intercepts Ctrl+T and sends `toggleCollapse`, but the only renderer of the collapsed ACP entries was the removed response panel; the connection tab uses its own `<details>` rather than `Tab.toolStepsExpanded`, and the only remaining `bufferLines` renderer is the notifications tab, whose entries are not ACP steps, so the key toggles an invisible flag and also prevents Ctrl+T from reaching the shell. Severity: 4/10

Existing Risk: 4/10 - A documented shortcut does nothing and steals a common shell editing chord, while `help/keys.md`, `product/specs/keyboard-navigation.md`, and `product/specs/transcript.md` still describe a collapse the interface no longer shows.

Proposal Risk: 1/10 - The dead interception is removed or re-targeted and the documentation agrees with what is rendered; no ACP result or record data changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "retire or re-target the dead Ctrl+T collapse shortcut". Remove the Ctrl+T branch in `web/src/useWindowKeys.ts` (`ctrlLetterShortcut`) and the `toggleCollapse` client RPC if no remaining client renders collapsed ACP entries; remove the now-unused `toolStepsExpanded` projection in `src/tab/view.ts`, the toggle in `src/tab/operations.ts`, and the field in `src/tab/types.ts` only after confirming the notifications tab's `Transcript` remains unaffected. Alternatively, if the shortcut is retained, send the tab's collapse state through the connections plugin payload and make `web/src/plugins/connections/ConnectionHistory.tsx` render its thought and tool entries from it. Update `help/keys.md`, `product/specs/keyboard-navigation.md`, `product/specs/transcript.md`, and the API v3 sentence in `product/specs/tab-plugins.md` to match. Add a client test that Ctrl+T is not swallowed in a shell when no collapse surface exists, or that the connection details toggle if re-targeted; keep `src/tab/view.test.ts` and `src/tab/transcript/events.test.ts` coverage passing.


* Limit the editor connections window's close control to editor-persona rows, so a running agent row cannot send a persona close.

Existing Issue: `web/src/editor/EditorConnectionsPanel.tsx` passes `onCloseRow` to `StatusPanels` for every row, and `web/src/editor/useEditorConnections.ts` turns `row.text` into a `closeEditorConnection` persona; a running agent row has no editor persona, so its close button does nothing or, when the editor tab has a core ACP session, can close that unrelated session. Severity: 4/10

Existing Risk: 4/10 - A user clicking the only close control on the new agent row can terminate an unrelated ACP connection or get silent inaction, and the agent run's intended Terminate path is in its record tab instead.

Proposal Risk: 1/10 - The control is limited to rows that actually have an editor persona; the agent row still opens through its record id and keeps its record-tab Terminate.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "limit the editor window's close control to persona rows". Add an optional row predicate to `web/src/shared/status-windows/StatusPanels.tsx` (for example `canCloseRow?: (row: ConnectionView) => boolean`) and render the close button only when both `onCloseRow` and the predicate pass; have `web/src/editor/EditorConnectionsPanel.tsx` pass `canCloseRow={(row) => row.acpRef?.scope === 'editor'}`. Also guard `useEditorConnections.closeRow` with the same scope check so a future caller cannot send a persona close for a record row. Update `web/src/editor/EditorConnectionsPanel.test.tsx` to assert the record-id agent row has no close button while a persona row still does, and keep `StatusPanels.test.tsx` covering the close-button isolation. No server or plugin payload change is needed; the record tab's Terminate remains the agent run's control.


* Correct the tab-plugin changelog's v2 history: `openConnection` and the reply `line` are v3 additions, and the client capability count is 27, not 28.

Existing Issue: `documentation/developer-documentation/tab-plugins.md` places `openConnection` and the optional `line` in the v2 paragraph and adds a v2 bullet claiming twenty-eight client capabilities, while the same page's v3 section and the shipped `TabPluginClientCapabilities` contain twenty-seven members; `product/specs/tab-plugins.md`'s API v2 section repeats the same misattribution. Severity: 4/10

Existing Risk: 5/10 - A plugin author targeting v2 implements or expects a capability and reply field that did not exist in that contract, and the contradictory v2/v3 counts make the deprecation and compatibility guidance untrustworthy.

Proposal Risk: 1/10 - The history and current counts agree with the code; no runtime behavior changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "fix the v2/v3 tab-plugin API history and counts". In `documentation/developer-documentation/tab-plugins.md`, move the `openConnection(row)` and background-reply `line` sentences out of the v2 paragraph and remove the "Twenty-eight client capabilities" bullet; restore the v2 section to its historical contract: twenty-seven client members, `launchShellHere()` present, and no `openConnection` or `line`. Add those two additions to the v3 changelog and migration bullet. In `product/specs/tab-plugins.md`, move the same two sentences from the API version 2 section to API version 3 and leave v2 describing only its historical additions. Extend `src/plugins/documentation.test.ts` to assert that the v2 section does not mention `openConnection` or `line` and that only the v3 section carries the current forty-eight server / twenty-seven client counts, then run the documentation test. No source behavior changes.


* Surface a refused record-tab Cancel, Close session, Terminate, or Delete action instead of silently ignoring a stale status or owner.

Existing Issue: The record-tab controls send id-only intents, and `src/plugins/connections-topic-actions.ts` silently ignores a status or owner mismatch for cancel, closeSession, terminate, and delete, so the inline `role="alert"` promised for a refused control action never appears unless the intent itself rejects; the UI cannot cause that rejection for a valid id. Severity: 3/10

Existing Risk: 3/10 - A control can appear to do nothing when the record moved on, leaving the reader unable to tell whether the action failed or the control was stale; the plan and connection-tab spec promise an error surface that is effectively unreachable.

Proposal Risk: 1/10 - The topic returns a domain error only for lifecycle refusals, the plugin rejects it, and the existing controller alert displays it; no record state changes on failure, and successful actions keep their asynchronous settlement.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "surface refused record-tab lifecycle actions". In `src/plugins/connections-topic-actions.ts`, return a concise error string for a cancel or closeSession on a record whose status is not eligible, for an owner tab that no longer carries the record, for a terminate whose linked run is no longer live, and for a delete of an open or missing record; keep the existing no-op behavior for live-row open/close stale targets and for open-record lookups. In `src/plugins/connections/activate.ts`, have `recordAction` propagate the returned string through `capabilities.rejectRequest`, and leave `load`/`loadOlder` returning undefined. Cover the refusal paths in `src/plugins/connections-topic.test.ts`, `src/plugins/connections/activate.test.ts`, and `web/src/plugins/connections/ConnectionTab.test.tsx`, asserting the record is unchanged and the alert shows the message. Update `product/specs/connections-tab.md` to distinguish a refused lifecycle control from a stale live-row target; keep current no-op semantics for the latter.
