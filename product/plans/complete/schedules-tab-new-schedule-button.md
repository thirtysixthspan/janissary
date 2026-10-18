# Schedules tab: + button opens the New schedule dialog

**Complexity: 3/10** — web-only. One optional client capability, one button in the tab's metadata row, and a send of the bare `schedule` command that the server already answers by opening the dialog. No protocol or server change.

The schedules tab lists every scheduled command, but creating one from that tab means leaving it for a shell or harness tab and typing `schedule`. Add a + button to the tab's metadata row that opens the same **New schedule** dialog that typing bare `schedule` opens.

## Design decisions

- **Click behavior**: clicking the button sends the bare `schedule` command through the normal `command` path, exactly as if it had been typed. The server already answers that with the dialog (`src/commands/schedule.ts:47`), so the dialog, its validation, and its submit path are reused without change. The plugin tab does not get a new server RPC.
- **Why a client capability and not an intent**: a plugin's server side never sees the schedule manager, and a plugin's `intent` runs on the server. A capability that sends the command from the client matches how `launchShellHere` and `openDiffHere` already reach host behavior from a plugin body.
- **Placement**: the button sits in the tab's metadata row, rendered through `PluginActionsHeader` with the `plugin-actions` span the sessions list uses. Docked, the same element portals into the sidebar's slim header, so the button stays available in both renderings.
- **Icon and wording**: `newTabIcon` (a plus glyph) with `title` and `aria-label` both "New schedule". The icon's export name says "tab", but it is the host's plus glyph, and the metadata rows already use it for "new" buttons.
- **Always enabled**: the button does not depend on payload. An empty list still gets it, because creating the first schedule is the reason to press it.
- **Target default**: the dialog defaults to the active eligible tab. While the schedules tab itself is active, it is not eligible, so the dialog falls back to the first eligible tab, or to the project target when no tab can hold a schedule. That is the dialog's existing rule (`initialScheduleTarget`), and this change does not alter it.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Bare `schedule` opens the dialog | `src/commands/schedule.ts:47`, `src/schedule/manager.ts:39` | The click sends this command; nothing server-side changes |
| Dialog and its submit path | `web/src/ScheduleLaunchDialog/ScheduleDialog.tsx`, `useScheduleLaunchActions.ts` | Rendered by `AppMain` whenever the server reports a launch view |
| Tab-scoped plugin capability pattern | `launchShellHere` and `openDiffHere` in `web/src/plugins/api.ts:358-359` | The new capability is the same shape, built from the same `client` |
| Metadata row with a plugin actions slot | `PluginActionsHeader` in `web/src/plugins/PluginActionsHeader.tsx`, used by `web/src/plugins/sessions/SessionList.tsx` | The schedules header switches to it, as the sessions list already does |
| Plus glyph | `newTabIcon` in `web/src/shared/icons.ts`, published through `web/src/plugins/api.ts:95` | Used for the button |
| Command-path sends from a plugin surface | `web/src/file-navigator/useFileNavigatorIntents.ts:7` | Confirms a bare command from a plugin tab is a supported send |

## Proposed changes

**Plugin capability.** In `web/src/plugins/api.ts`, add an optional `openScheduleLaunch?(): void;` to `TabPluginClientCapabilities`, beside `openDiffHere`, with a comment in the file's style: the New schedule dialog, opened the way typing bare `schedule` opens it. Implement it in `createPluginClientCapabilities` as `client.send({ method: 'command', params: { text: 'schedule' } })`. It is optional, like the other tab-scoped openers, so fixtures that build the object need no change. The `command` method is already in the `TabMessage` union and the client-params schema, so no protocol file changes.

**Schedules tab.** In `web/src/plugins/schedules/SchedulesTab.tsx`, replace the `schedules-header` / `schedules-actions` block with `PluginActionsHeader className="schedules-header"` holding `<span className="plugin-actions">`. Inside the span, render a `<button type="button">` with `title="New schedule"`, `aria-label="New schedule"`, a `FontAwesomeIcon` of `newTabIcon`, and `onClick` calling `capabilities.openScheduleLaunch?.()`, followed by `{capabilities.splitAction}`. Keep the header above the list in both the full and docked renderings, and keep the empty-state message below it. Import `PluginActionsHeader`, `newTabIcon`, and `FontAwesomeIcon` the way sessions and the other tabs import them.

**Styles.** In `web/src/plugins/schedules/schedules.css`, drop the `.schedules-actions` rule, which only wrapped the split action, and style the header's buttons the way the sessions header does (`.session-list-header .plugin-actions button` in `web/src/plugins/sessions/sessions.css`): a transparent, borderless, muted button that brightens on hover. Keep `.schedules-header` for its border and padding. The stylesheet test (`web/src/plugins/schedules/schedules-style.test.ts`) keeps passing; add an assertion that the header's button rule exists.

**Spec.** In `product/specs/scheduling.md`:

- In the "Scheduling tab" section, add the + button to the list of direct actions, and say what it does: it opens the same New schedule dialog as bare `schedule`, in both the full and docked renderings.
- Replace "Creating, editing, or clearing a schedule stays on the `schedule` command in the owning tab." with wording that keeps the editing and clearing rule and names the + button as the creation path from this tab.
- In the "New schedule dialog" section, note that the dialog can also be opened from the schedules tab's + button, and that it defaults as described above when the schedules tab is the active tab.

**User documentation.** In `documentation/user-documentation/automation/scheduling.md`:

- Replace "The tab is view-only — it has no command bar." with a sentence that says the tab has no command bar and that its only control for creating a schedule is the + button, which opens the dialog below.
- In "Scheduling from a dialog", say that the dialog also opens from the + button in the schedules tab's header, and that typing bare `schedule` still works.
- Replace the closing "The dialog only creates new timers — manage existing ones with `schedule list` / `cancel` / `clear`, or the schedules tab above." so it still holds: the dialog creates timers, and existing timers are managed with the commands or from the schedules tab.

**Help.** In `help.md`, the `schedules` row says "the aggregated, view-only tab". Drop "view-only" and add that its + button opens the New schedule dialog. Keep the row otherwise as written.

## Tests

- `web/src/plugins/api.test.ts`: a test beside the `openDiffHere` one that calls `capabilities.openScheduleLaunch?.()` and expects `send` to have been called with `{ method: 'command', params: { text: 'schedule' } }`.
- `web/src/plugins/schedules/SchedulesTab.test.tsx`:
  - The + button renders with the accessible name "New schedule" when the list is empty and when it has rows.
  - Clicking it calls `capabilities.openScheduleLaunch` once and sends no intent.
  - It is present in the docked (`dock: 'left'`) rendering too.
  - The host's split action still renders next to it, and the existing "no clear control" test still holds.
- `web/src/plugins/schedules/schedules-style.test.ts`: the header's button rule is present in the stylesheet, and `.schedules-actions` is gone.

Every test case above is written in the existing test files' style: `render` plus `fireEvent`, the `makeCapabilities` helper extended with an `openScheduleLaunch` spy, and assertions on the mock.

## Out of scope

- No new server RPC or intent, and no change to the dialog, its fields, or its submit path.
- No change to the target-default rule. A smarter default that remembers the last eligible tab from before the schedules tab was focused would be a separate change.
- No keyboard shortcut for the button.
- No change to the terminal UI, which still prints `Usage:` for a bare `schedule`.
- No clear control, and no editing from the tab.

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff` after each step. Manual check: open `schedules`, click the + button, and confirm the New schedule dialog opens with a tab target preselected. Submit a schedule and confirm it appears in the list. Dock the tab with `schedules left` and confirm the button still shows in the sidebar header.
