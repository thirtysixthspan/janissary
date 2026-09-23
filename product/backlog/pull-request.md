<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove pending toasts when the user opens the notifications feed manually.

Existing Issue: The `notifications` command can make the feed visible while earlier toasts remain on screen, because only burst escalation, toast-click reveal, and clear emit the toast-clear event. Severity: 5/10

Existing Risk: 5/10 - The same notification appears in the feed and corner at once, and a hovered or focused toast can remain there indefinitely after the user has opened the feed.

Proposal Risk: 2/10 - Clearing on a tab merely docked but still hidden behind another sidebar view would remove the user's only visible cue unless actual client visibility is used.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1169: clear toasts when the feed becomes visible". Once sidebar selection is reflected in visibility, make the toast owner in `web/src/toasts/useToasts.ts` or the corresponding server reveal path clear outstanding toasts on every real transition to a visible notifications feed, including the bare and docked `notifications` command and sidebar selection. Preserve toasts when a center feed remains hidden or a docked feed is not selected. Add cases around `web/src/toasts/ToastStack.test.tsx` and the notifications command integration tests for manual open, hidden placement, and hover-held toasts, keeping burst and click reveal behavior intact.
