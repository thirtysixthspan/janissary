# Suppress unread badge on docked tabs (notifications sidebar)

**Complexity: 2/10** — one guard clause added to an existing helper, plus tests confirming the badge no longer sticks on a docked tab.

## Goal

The notifications tab (and any other dockable tab) should never show the sparkle (✨) unread badge while docked into a sidebar. Docked tabs are permanently visible chrome — the sidebar's own internal tab-switcher lets the user glance at them without ever calling the server's `setActiveTab`, so today the badge is set by `markUnread` on every new notification line and is never cleared, because `setActiveTab` explicitly refuses to activate a docked tab (`src/tab/manager.ts:176`). The result: once a docked notifications tab receives any content, it shows a permanent, stuck unread badge even while the user is actively looking at it in the sidebar.

## Approach

Treat a docked tab the same way `setActiveTab` already treats it: never eligible for the unread flag. The single `markUnread(label)` funnel (`src/tab/manager.ts:145`) is the one place every content-delivery path (`append`, `finishRunning`, shell `onDone`) routes through, so adding a `tab.dock` guard there closes the gap for all callers at once, matching the existing "a docked tab is never the active tab" invariant in `setActiveTab`.

No client change is needed — `TabItem` already renders the badge purely from `tab.hasUnread`; once the server stops ever setting that flag for a docked tab, the badge simply never appears.

## Implementation steps

1. **`src/tab/manager.ts:145` `markUnread`** — add a dock check alongside the existing active-tab check:
   ```ts
   markUnread(label: string): void {
     const tab = this.tabs.find((t) => t.label === label);
     if (!tab || tab.dock || label === this.activeLabel()) return;
     tab.hasUnread = true;
   }
   ```

## Tests

- **`src/tab/manager.test.ts`** — add a `describe('TabManager markUnread')` block:
  - `append` to a docked, non-active tab does not set `hasUnread` (dock it via `setDock`, then call `append`, assert `hasUnread` is falsy).
  - `append` to a non-docked, non-active tab still sets `hasUnread` (guards against a regression that removes the existing behavior).

Run `./scripts/run.mjs check-diff` after writing tests; all must pass.

## Spec updates

- **`product/specs/tabs.md`** — the "Unread badge" section (`:53`-`:61`) currently says the badge appears on any inactive tab with new content, with no mention of docked tabs. Add a line noting a docked tab (visible in a sidebar) never shows the badge, since it is never eligible to become the active tab.

## Docs

- Check `help.md` and `documentation/user-documentation/` for any existing description of the unread badge or docking. Update only if a description already exists there and now reads as inaccurate.

## Out of scope

- Any client-side rendering change — the fix is entirely server-side in `markUnread`.
- Clearing `hasUnread` retroactively when a tab is docked (a tab's `hasUnread` is already false at the moment it is first docked in the only path that docks a tab with content, per `notifications-tab.ts`'s open-then-dock sequence; `applyDock` already clears it on undock).
- Any change to the sidebar's own internal tab-switcher (`Sidebar.tsx`'s `selectedView`) — it stays purely client-side view state.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, typechecks affected projects, runs related server tests.
- Manual: open the notifications tab docked into a sidebar (`notifications --dock left`), trigger a background notification-worthy event, and confirm no sparkle badge appears on the docked tab.
