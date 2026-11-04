<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

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
