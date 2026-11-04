<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Surface the connection list's refused Close on an open ACP record row, which still completes silently.

Existing Issue: The list's Close control on an open ACP record row sends a `close` intent that `openOrClose` turns into a `closeSession` topic action, but `src/plugins/connections/activate.ts` discards the returned refusal, so an owner mismatch or status change ends the intent successfully and the inline `role="alert"` never appears. Severity: 4/10

Existing Risk: 4/10 - A reader clicks Close on a row that has moved on and sees no response, leaving the record and its tab in an ambiguous state and making the lifecycle-refusal surface look broken.

Proposal Risk: 1/10 - The same topic refusal is forwarded through `rejectRequest`; successful closes and the intentionally silent live-row open/close topic actions are unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "surface the connection list's refused Close on an open ACP record row". In `src/plugins/connections/activate.ts`, make the `close` branch of `openOrClose` capture the string returned by the `closeSession` topic action and pass a non-undefined value to `capabilities.rejectRequest`, or delegate that branch to the existing `recordAction('close-session', row.id, capabilities)` helper. Keep the live-row `open`/`close` branches as fire-and-forget calls and keep the `invalid close payload` rejection for a row no longer present. Add a case to `src/plugins/connections/activate.test.ts` where the current row is an open ACP record and `topicAction` returns `The owning tab no longer holds this record.`, asserting the intent throws that message and `rejectRequest` receives it; add or extend a `web/src/plugins/connections/ConnectionList.test.tsx` case that the Close control on an open ACP record row renders the refusal in `role="alert"`. Do not change the record-tab Cancel/Close session/Terminate paths, the list Delete path, or the intentional no-op `actOnLive` topic behavior.


* Correct the pull request description's stale branch statistics and its claim that the canonical plan is the branch's only plan.

Existing Issue: The description says the branch carries 93 commits and 232 changed files from `139aaf43` and that `product/plans/complete/connections-tabs.md` is the branch's only plan, while the reviewed head has 99 commits and 284 changed files and five repair plans beside the canonical plan. Severity: 3/10

Existing Risk: 4/10 - A reviewer scoping the change from the description underestimates the branch and never sees the five repair plans whose behavior and verification the later commits rely on.

Proposal Risk: 1/10 - Only the pull request body changes; the description then matches the branch and lists the repair plans the review is judging.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "refresh the pull request description's branch statistics and plan inventory". Recompute the counts from `139aaf43` to the current head (the head reviewed here was 99 commits and 284 changed files) or replace the exact numbers with a count-free statement, and replace the "only plan for this feature" sentence in "Source plan and subplans" with links to `product/plans/complete/acp-capped-tool-step-notice.md`, `product/plans/complete/retire-ctrl-t-collapse.md`, `product/plans/complete/editor-connections-persona-only-close.md`, `product/plans/complete/correct-tab-plugin-api-history-and-counts.md`, and `product/plans/complete/surface-refused-record-tab-lifecycle-actions.md` beside the canonical plan. Keep the rest of the description unchanged. Verify with `git rev-list --count 139aaf43..HEAD`, `git diff --name-only 139aaf43...HEAD | wc -l`, and `ls product/plans/complete/` after the edit; no source, test, or plan changes.


* Correct the connection spec's claim that every non-persona row in an editor connections window opens a record tab.

Existing Issue: `product/specs/connection.md` now says "Any other row in that window, including a running agent row, carries no close control there: pressing it opens its record tab", but monitor, browser, terminal, and SQLite rows carry no durable record or tab-scoped ACP reference and `StatusPanels.rowCanOpen` leaves them without an open action. Severity: 3/10

Existing Risk: 3/10 - The spec is the project's source of truth for connection surfaces, so a later change can add record-opening to rows that have no record or treat monitor rows as if they opened a tab, contradicting the canonical plan's snapshot-only rule.

Proposal Risk: 1/10 - The sentence narrows to the row the fix actually changed; the behavior and tests stay as they are.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "correct the editor connections window's record-opening spec sentence". In `product/specs/connection.md`, replace the "Any other row in that window..." sentence with the narrower statement that a running agent row carries no close control and pressing it opens its record tab, while monitor rows remain snapshot-only and browser, terminal, and SQLite rows remain non-openable. Keep the earlier paragraph's durable-record, tab-scoped ACP, and monitor/editor-persona rules unchanged. Verify the wording against `web/src/shared/status-windows/StatusPanels.tsx` (`rowCanOpen`) and `web/src/editor/useEditorConnections.ts` (`openRow`); no code, test, or other spec changes.


* Remove the stale Ctrl+T references and interception the retirement left in the shared transcript card.

Existing Issue: `web/src/shared/transcript/TerminalCard.tsx` still describes Ctrl+T as an app-level collapse chord in two comments, its `cardKeyFilter` still rejects every Ctrl key so an inline terminal card never receives Ctrl+T, and `web/src/theme.css` still labels the ACP line style as expanded-and-click-to-recollapse. Severity: 2/10

Existing Risk: 2/10 - A later reader looks for a collapse action that no longer exists, and an inline terminal program cannot receive Ctrl+T even though no window handler consumes it.

Proposal Risk: 1/10 - The card keeps every remaining window chord bubbling; a focused test pins Ctrl+T passing through while Ctrl+Arrow and Shift+Arrow still bubble.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "finish the Ctrl+T retirement in the shared transcript card". In `web/src/shared/transcript/TerminalCard.tsx`, update the two comments to describe only the chords the window still handles and let bare Ctrl+T pass the key filter while keeping the existing Ctrl/Shift chords bubbling. In `web/src/theme.css`, remove the stale expanded-and-re-collapse wording and the pointer affordance that imply an ACP transcript click still collapses something, or state that the style is for a read-only ACP line. Extend `web/src/shared/transcript/TerminalCard.test.tsx` to assert Ctrl+T passes the filter, Ctrl+Arrow and Shift+Arrow remain blocked, and plain keys still pass. Leave the shared transcript renderer's inert `collapsed` branch, `flattenBuffer`'s collapse helper, the notifications feed, and the connection-tab `<details>` rendering unchanged.
