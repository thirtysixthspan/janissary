<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the stale Ctrl+T references and interception the retirement left in the shared transcript card.

Existing Issue: `web/src/shared/transcript/TerminalCard.tsx` still describes Ctrl+T as an app-level collapse chord in two comments, its `cardKeyFilter` still rejects every Ctrl key so an inline terminal card never receives Ctrl+T, and `web/src/theme.css` still labels the ACP line style as expanded-and-click-to-recollapse. Severity: 2/10

Existing Risk: 2/10 - A later reader looks for a collapse action that no longer exists, and an inline terminal program cannot receive Ctrl+T even though no window handler consumes it.

Proposal Risk: 1/10 - The card keeps every remaining window chord bubbling; a focused test pins Ctrl+T passing through while Ctrl+Arrow and Shift+Arrow still bubble.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "finish the Ctrl+T retirement in the shared transcript card". In `web/src/shared/transcript/TerminalCard.tsx`, update the two comments to describe only the chords the window still handles and let bare Ctrl+T pass the key filter while keeping the existing Ctrl/Shift chords bubbling. In `web/src/theme.css`, remove the stale expanded-and-re-collapse wording and the pointer affordance that imply an ACP transcript click still collapses something, or state that the style is for a read-only ACP line. Extend `web/src/shared/transcript/TerminalCard.test.tsx` to assert Ctrl+T passes the filter, Ctrl+Arrow and Shift+Arrow remain blocked, and plain keys still pass. Leave the shared transcript renderer's inert `collapsed` branch, `flattenBuffer`'s collapse helper, the notifications feed, and the connection-tab `<details>` rendering unchanged.
