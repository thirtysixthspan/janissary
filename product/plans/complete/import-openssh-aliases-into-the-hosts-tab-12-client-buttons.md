# Add Import and Export buttons to the Hosts tab
**Complexity: 5/10** — ~9 added lines in 1 production file, 16 requirements and 14 test scenarios (p=5.40)

## Goal

Put two icon-only buttons in the Hosts tab metadata bar that fire the import and export intents in one click. They sit with the existing header actions, show even with no saved hosts, and add no dialog, chord, or CSS. It is the twelfth piece of `import-openssh-aliases-into-the-hosts-tab.md` (named by file name so the reference survives that plan's promotion) and fires the intents registered by `import-openssh-aliases-into-the-hosts-tab-11-intent-registration.md`.

## Requirements

1. An Import button and an Export button sit in the Hosts tab metadata bar after New host and before the Split control ("Icons after New host").
2. The Import button uses the `faFileImport` icon and the Export button uses `faFileExport` (UI design 1).
3. The buttons are titled and named `Import from ssh config` and `Export to ssh config` (UI design 1).
4. Both buttons show when the saved-host list is empty (UI design 1).
5. A click runs the operation at once, with no dialog or confirmation ("the import is all or none, without dialog", "the export is all or none, without dialog").
6. Focus stays on the clicked button after the operation starts (UI design 2).
7. Ordinary button keys activate each button (UI design 2).
8. A key pressed on a focused Import or Export button belongs to that button rather than the list (UI design 2).
9. There is no busy or disabled state on either button (UI design 3).
10. The outcome arrives as one notification in the feed, attributed to the Hosts tab (UI design 3).
11. Imported rows appear as the catalog publishes, with no further action in the client (UI design 3).
12. No new keyboard chord is added for either button ("Named per row, no chord").
13. Cmd+N or Ctrl+N still opens the new-host form while the list is focused (UI design 4).
14. The buttons use the existing `.host-list-header .plugin-actions button` style, with no new CSS (UI design 5).
15. Each button fires its `import` or `export` intent with `fireIntent` (source plan Implementation step 7).
16. `HostList.tsx` stays under the 200-line limit (source plan Implementation step 7).

## Design decisions

Depends on `import-openssh-aliases-into-the-hosts-tab-11-intent-registration.md` being implemented before this subplan: that plan registers `import` and `export` with `payload: isRefreshIntent`, so the entries exist at this subplan's commit and accept only an empty payload `{}`. `import-openssh-aliases-into-the-hosts-tab-13-spec-update.md` describes the result and lands later.

- The two buttons go into the existing span in `web/src/plugins/hosts/HostList.tsx:116` `<span className="plugin-actions">`, after the New host button at `:120` `<button type="button" title="New host" aria-label="New host" onClick={() => setEditing('new')}>` and before the Split control at `:123` `{capabilities.splitAction}`. No new wrapper and no new CSS rule; the header style already covers every button in that span (Assumptions 1 and 2).
- Each button is icon-only with `title` and `aria-label` set to the exact names in Requirement 3, so assistive technology and the tooltip agree. The icons come from `@fortawesome/free-solid-svg-icons`, which already supplies both (Assumption 3).
- Each handler fires its own intent through `fireIntent` with an empty payload `{}`, in the same fire-and-forget shape as the `refresh` handler at `web/src/plugins/hosts/HostList.tsx:61` `const refresh = () => { fireIntent({ intent }, 'refresh', {}); };`. No file operand is sent: subplan 11's entries are guarded by `isRefreshIntent`, which accepts only `{}`. There is no dialog state, no pending state, and no client-side result handling; the server reports the outcome as a Hosts-tab notification through `readNotify` and publishes imported rows as the catalog changes (`src/plugins/hosts/activate.ts:48` `function readNotify(`, Assumption 5).
- The list's `onKeyDown` keeps its current guard at `web/src/plugins/hosts/HostList.tsx:65` `if (event.target !== event.currentTarget) return;`, which ignores events whose target is not the list container, so a key on a focused button never reaches list navigation and the Cmd+N chord does not fire from a button (Requirement 8). No new chord is added.
- The file is 174 lines today, of which 163 count toward `max-lines` because blank lines and comments are skipped (Assumption 6). Two one-line handlers and two three-line buttons add about eight counted lines, leaving roughly 171, under the 200 limit. If implementation passes 180 counted lines, extract the header into a sibling component in the same feature directory rather than compacting.
- Tests extend `web/src/plugins/hosts/HostList.test.tsx`, whose `capabilities()` helper at `:16` already records every intent call; no new test harness is needed. The existing `holds refresh and split together in the metadata header` case at `:105` asserts the exact children of `.plugin-actions` at `:112`, so its expected order must be updated to include the two new buttons; no other existing case changes.

## Preserved behavior

1. Cmd+N or Ctrl+N opens the new-host form while the list is focused. The new buttons must not take that chord or add another. Pinned by `web/src/plugins/hosts/HostList.test.tsx` › `opens a new host form on %s while the list has focus`.
2. The empty list keeps its metadata header and its Refresh button. The new buttons must not hide the header or Refresh when there are no saved hosts. Pinned by `web/src/plugins/hosts/HostList.test.tsx` › `reports an empty list without headings but keeps the metadata actions available`, which asserts Refresh is present with no rows.

## Assumptions

1. The metadata bar holds the header actions in one span: `web/src/plugins/hosts/HostList.tsx:115` `<PluginActionsHeader className="plugin-meta host-list-header">` and `:116` `<span className="plugin-actions">`.
2. The header button style already exists: `web/src/plugins/hosts/hosts.css:6` `.host-list-header .plugin-actions button {`.
3. Both icons are exported by the installed icon package: `node_modules/@fortawesome/free-solid-svg-icons/index.d.ts:610` `export const faFileImport: IconDefinition;` and `:1877` `export const faFileExport: IconDefinition;`.
4. Fire-and-forget metadata-bar intents already exist: `web/src/plugins/hosts/HostList.tsx:61` `const refresh = () => { fireIntent({ intent }, 'refresh', {}); };`.
5. The server owns the outcome and reports it as a Hosts-tab notification: `src/plugins/hosts/activate.ts:38` `function publish(` publishes catalog changes and `src/plugins/hosts/activate.ts:48` `function readNotify(` attributes notifications, with `src/plugins/hosts/activate.ts:50` `? (message) => capabilities.notifyUser(message, { tab: INSTANCE_KEY })` for owned reports.
6. The client file is inside the limit today at 174 lines, of which 163 count toward `max-lines`, and `max-lines` is 200 with blank lines and comments skipped: `eslint.config.mjs:62` `'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }]`.

## Existing functionality

1. The `fireIntent` helper used by Refresh: `web/src/plugins/hosts/HostList.tsx:61` `const refresh = () => { fireIntent({ intent }, 'refresh', {}); };`.
2. The metadata bar's icon buttons and their order: `web/src/plugins/hosts/HostList.tsx:120` `<button type="button" title="New host" aria-label="New host" onClick={() => setEditing('new')}>`.
3. The shared header button style: `web/src/plugins/hosts/hosts.css:6` `.host-list-header .plugin-actions button {`.
4. The list key handler that leaves focused controls alone: `web/src/plugins/hosts/HostList.tsx:65` `if (event.target !== event.currentTarget) return;`.
5. The `import` and `export` entries registered by `import-openssh-aliases-into-the-hosts-tab-11-intent-registration.md` beside `refresh` in the table at `src/plugins/hosts/activate.ts:140` `intent: defineIntents('hosts', isHostsPayload, {`, with `payload: isRefreshIntent`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`; that command is both the build command and the proof that the checkpoint is green. This subplan changes two files, `web/src/plugins/hosts/HostList.tsx` and `web/src/plugins/hosts/HostList.test.tsx`. It depends on `import-openssh-aliases-into-the-hosts-tab-11-intent-registration.md` being implemented first; the `import` and `export` intents therefore already exist when this subplan lands, and nothing is deferred to a later subplan.

1. In `web/src/plugins/hosts/HostList.tsx`, import `faFileImport` and `faFileExport` from `@fortawesome/free-solid-svg-icons`, add two `fireIntent` handlers beside `refresh`, and add the two buttons in the metadata span between New host and `capabilities.splitAction`. Fire `import` and `export` with an empty payload and no operand, and do not read or handle any result: the server notifies and publishes. Set `title` and `aria-label` to the exact names in Requirement 3, leave focus behavior to the native button, and add no state and no CSS. Keep the file under 200 counted lines. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Extend `web/src/plugins/hosts/HostList.test.tsx` with the cases listed under Tests and update the existing `holds refresh and split together in the metadata header` case at `:105` so its expected action order becomes Refresh, New host, Import from ssh config, Export to ssh config, Split. Leave every other existing case unchanged. Build and check with `$janissary/scripts/run.mjs check-diff` and confirm both the new cases and all existing HostList cases pass.

## UI design

1. Placement: two icon-only buttons in the Hosts tab metadata bar, after New host and before Split, using `faFileImport` and `faFileExport`, titled and named `Import from ssh config` and `Export to ssh config`, shown in the empty state.
2. Interaction: one click fires the intent immediately. No dialog, confirmation, preview, or per-host choice. Focus stays on the button and ordinary button keys activate it; a key on a focused button does not reach the list.
3. States: no busy, disabled, or pending state. The outcome arrives as one notification attributed to the Hosts tab and imported rows appear as the catalog publishes.
4. Key bindings: no new chord. Cmd+N and Ctrl+N keep their current behavior.
5. Visual consistency: the existing `.host-list-header .plugin-actions button` style in `hosts.css`, with no new CSS.

## Tests

In `web/src/plugins/hosts/HostList.test.tsx`, using the existing `capabilities()` helper at `:16`, whose `intent` mock records every call; no new test harness:

- Both buttons sit between New host and Split in the metadata header, in that order, with Split supplied by the test fixture; update the existing `holds refresh and split together in the metadata header` case's expected action order to match (Requirement 1).
- Each button is found by its accessible name and renders the expected icon, with the rendered `data-icon` reading `file-import` and `file-export` (Requirements 2 and 3).
- Both buttons are present with an empty list, alongside Refresh, New host, and Split (Requirement 4, preserved behavior 2).
- Clicking Import fires only `('import', {})` and clicking Export fires only `('export', {})` through the mocked `intent` — the empty payload subplan 11's `isRefreshIntent` guard requires — with no second intent, no dialog, and no row opening (Requirements 5, 11 and 15).
- Focus stays on the clicked button, an Enter or Space key on it fires the intent, and a key on it does not move list selection (Requirements 6 to 8).
- No disabled or busy attribute appears before or after the click (Requirement 9).
- The Cmd+N and Ctrl+N cases and the focused-button chord case pass unchanged (Requirements 12 and 13, preserved behavior 1).

## Out of scope

- No new dialog, preview, confirmation, per-host selection, or busy indicator.
- No new keyboard chord and no new CSS rule.
- No server-side parsing or file access (subplans 1 through 6) and no intent registration or outcome reporting (subplans 10 and 11).
- No change to the payload schema or the plugin manifest.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass with only these two files changed.

Then, against the running app started in a scratch home, open `hosts` with no saved hosts and confirm the two new buttons sit between New host and Split and are visible. Put one importable alias in that home's `~/.ssh/config`, click Import, and confirm no dialog opens, focus stays on the button, one notification attributed to the Hosts tab reports the import, and the new row appears as the catalog publishes. Press Cmd+N with the list focused and confirm the new-host form still opens. A failure looks like a missing button in the empty state, an opened dialog, a changed list selection from a button key, a transcript note instead of a Hosts-tab notification, or a chord that no longer works.
