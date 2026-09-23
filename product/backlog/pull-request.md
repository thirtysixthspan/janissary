<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Place toasts below floating status panels as the plan promises.

Existing Issue: `.toast-stack` starts at a fixed 40px from the viewport top with a higher stacking level than `.status-panels`, whose connection and schedule rows can extend below that point, so a toast covers those panels. Severity: 5/10

Existing Risk: 5/10 - Active connection controls or schedule details can be obscured by a toast at the moment the user needs them, contradicting the promised corner layout.

Proposal Risk: 2/10 - A measured offset or shared layout slot can shift the toast when panels change height, but may leave extra corner space during transitions.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1169: position toasts below status panels". Coordinate `web/src/toasts/ToastStack.tsx`, `web/src/AppShell.tsx`, the active `StatusPanels` rendering path under `web/src/shared/status-windows/`, and `web/src/theme.css` so the stack's top edge follows the actual bottom of visible connection and schedule panels as well as the connection indicator, instead of assuming a 40px height. Cover a panel with several rows and both panels visible in a layout test or browser check, while retaining the existing fixed upper-right placement and toast timing tests.


* Remove pending toasts when the user opens the notifications feed manually.

Existing Issue: The `notifications` command can make the feed visible while earlier toasts remain on screen, because only burst escalation, toast-click reveal, and clear emit the toast-clear event. Severity: 5/10

Existing Risk: 5/10 - The same notification appears in the feed and corner at once, and a hovered or focused toast can remain there indefinitely after the user has opened the feed.

Proposal Risk: 2/10 - Clearing on a tab merely docked but still hidden behind another sidebar view would remove the user's only visible cue unless actual client visibility is used.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1169: clear toasts when the feed becomes visible". Once sidebar selection is reflected in visibility, make the toast owner in `web/src/toasts/useToasts.ts` or the corresponding server reveal path clear outstanding toasts on every real transition to a visible notifications feed, including the bare and docked `notifications` command and sidebar selection. Preserve toasts when a center feed remains hidden or a docked feed is not selected. Add cases around `web/src/toasts/ToastStack.test.tsx` and the notifications command integration tests for manual open, hidden placement, and hover-held toasts, keeping burst and click reveal behavior intact.
