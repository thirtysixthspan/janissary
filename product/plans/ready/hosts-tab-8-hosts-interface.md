# Render and operate the Hosts tab

**Complexity: 7/10** — ~245 added lines, 5 production files edited and 24 test scenarios (p=6.69)

## Goal

Work unit 8 of [Hosts Tab](../complete/hosts-tab.md). Extend the basic list from [Register the Hosts plugin and implement its server commands and intents](../ready/hosts-tab-7-hosts-plugin.md). The integrated verification also depends on [Show the saved launch name in the Sessions Host column](../ready/hosts-tab-6-session-names.md).

## Implementation

- **Empty state (user decision).** With no saved hosts, or with the file in effect unusable, the tab shows only `No saved hosts`, with no table headings, matching the sessions tab's `No remote sessions`. The plus button still works.

- **Header (feature text).** The tab has a metadata bar like the sessions tab, with Refresh and Split icon buttons, plus a plus icon button that opens a create-new-host-configuration modal.
- **Table look and feel (feature text).** The hosts table is styled like, and has the same keyboard and mouse interactions as, the sessions tab table.

- Keep the existing default export and payload guard in `web/src/plugins/hosts/index.tsx`. Put the full list, row actions, form, key decisions and styles in focused files in that directory. Use the layout and behavior in `web/src/plugins/sessions/SessionList.tsx:20` (`SessionList`) as the precedent. Consume `PluginActionsHeader`, `ConfirmDialog`, `useListSelection` and `nextListSelection` from the client API. Add an export for `ModalDialog` in `web/src/plugins/api.ts`.

The hosts tab is a non-dockable plugin tab in the centre tab area, titled **hosts**; `hosts` opens it or focuses the one already open. Its table and interactions mirror the sessions tab (`web/src/plugins/sessions/SessionList.tsx`, `sessions-keys.ts`, `sessions.css`).

- **Header (feature text, user decision).** A full-width metadata bar like the sessions tab's, with icon buttons together at the right edge: `Refresh` (rotate icon), `New host` (plus icon), and the host-rendered Split control. There is no dock control.
- **Table (user decision).** Columns Name, User, Destination, Path, then an unlabeled fixed-width actions column. Headings and cells are left-aligned with 12px horizontal padding, like the sessions table. Destination shows `host[:port]`; a blank user or path leaves an empty cell. Rows are sorted by name, case-insensitively.
- **Row actions (user decision).** Right-aligned icon-only buttons, styled like `SessionRowActions`: a pencil labelled `Edit host <name>` and a trash labelled `Delete host <name>`, muted at rest and bright on hover. Pressing one does not move the selection or open the row.
- **Opening a row (feature text, from precedent).** One click makes a row current, a second click on the current row opens it, and Enter opens the current row; opening launches the ssh tab for that host. Up and Down move without wrapping; Home and End jump to the ends (`nextListSelection`, `sessionClickSelection` behavior). The list takes focus when the tab becomes active, and re-reads the files when the tab regains focus. Escape on the list does nothing.
- **Keyboard (user decision).** `Cmd+N` / `Ctrl+N` on the list opens the New host modal — the same list-local binding the conversation list uses, so it collides with nothing in `help/keys.md`; it is added there. Edit and delete have no keys.
- **Modal (user decision).** The shared `ModalDialog`, titled `New host` or `Edit host <name>`. Four labelled inputs — `Name`, `User`, `Destination`, `Path` — with placeholders `optional` for User and Path and `host[:port]` for Destination; buttons `Save` and `Cancel`. Edit prefills every field. Focus lands on Name; Tab moves through the fields and then the buttons; Enter in any field saves; Escape or Cancel closes without saving. A validation or save error appears inline above the buttons and the modal stays open; Save is disabled while a save is in flight. On success the modal closes and focus returns to the list, on the saved row.
- **Delete (user decision).** The shared `ConfirmDialog` titled `Delete host <name>?` with a `Delete` button, disabled while the delete is in flight. A refused or failed delete closes the dialog, leaves the row, and posts the error line to the notifications feed attributed to the hosts tab.
- **States (user decision).** Empty or unusable: only `No saved hosts`, no headings; the plus button stays enabled and a save is refused inline. There is no loading state: the rows arrive with the tab. Long cells ellipsize; the row tooltip shows the full `[user@]host[:port]` on one line and the path on the next.
- **Code placement (from guidelines).** Client code lives in the plugin's own directory, `web/src/plugins/hosts/`: a pure key module and thin components (list, row actions, modal). The modal's four field values, its in-flight flag, and its error string are plain `useState` inside the modal component — no separate hook — because the component makes no decision with them: validation happens on the server. Under the client plugin boundary lint it imports only `../api`, `../shared.css`, and `@shared/plugins/hosts/shared` — never the sessions plugin's files; the sessions click rule is three lines and is restated in the hosts key module rather than imported. The host list, the file in effect, and every validation verdict are server state per `ai/guidelines/architecture-principles.md` §1: the client renders the rows the server sends, emits `save`, `delete`, `refresh`, and `open` intents, and shows the error string a `save` intent returns.

### Selection and intent handling

- Use the server's row order. Track the confirmed click by case-folded name so a refresh or same-size reorder cannot turn a prior click into an open on a different row. Use `useListSelection` for the highlighted index and scroll behavior. Keyboard navigation clears the click confirmation. Match the active transition in `SessionList`: focus on activation and refresh on return. Key handling belongs to the list surface. Buttons and dialogs handle their own keys and clicks.
- Use the list-local shortcut test from `web/src/plugins/conversations/ConversationList.tsx:32` (`metaKey` or `ctrlKey` and no additional modifier). Handle submit once through the form, keep browser tab order within the modal, and use explicit focus and Escape handling because the shared `ModalDialog` only renders the shell.
- Send the draft strings and optional original name using the save intent from unit 7. Read the returned saved name and show a rejected intent's message inline, following `web/src/plugins/roles/useRoleCreation.ts:7` (`useRoleCreation`). After success, close the form and focus the list. Select by the returned name when the authoritative row arrives, whether its payload update arrives before or after the intent response. Ignore a late response from a cancelled form so it cannot close a newly opened form.
- Use the unit 7 delete intent. Add an optional pending-confirm prop through `web/src/shared/ConfirmDialog.tsx` and `ConfirmDialogShell.tsx` so the Delete button is physically disabled while awaiting the result. Pass that state to `useConfirmDialogKeys` and guard every confirm path against a duplicate request. Existing callers keep their defaults. Close the confirmation on success or failure. The server sends the failure notice and keeps the row.

## Tests

Extend the colocated Hosts client tests for ordered rows, empty headings, full tooltip, Refresh, return-to-tab refresh and Split. Cover arrow boundaries, Home, End, Enter, Escape, first and second clicks, same-size payload reorder, shortcut modifiers and row-action isolation. Test field order and defaults, edit prefill, Escape and Cancel, one submit per pending save, inline errors and focus on the saved row in both response orders. Test that pending delete blocks clicks and key repeats and closes after success or failure. Keep the registry and payload guard coverage from unit 7. Update `product/specs/hosts-tab.md`, add `help/hosts.md` and update `help/keys.md`.

## Out of scope

Docking, reachability and alternate row launch actions.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Create a host with a port and path, open with two clicks, edit and delete, then verify `hosts list` and Sessions Host.
