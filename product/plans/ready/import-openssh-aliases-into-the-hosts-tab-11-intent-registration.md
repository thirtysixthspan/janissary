# Register the import and export intents
**Complexity: 6/10** — ~40 added lines, 18 requirements and 13 scenarios across 2 production files (p=5.93)

## Goal

Add `import` and `export` to the Hosts plugin's intent table and wire their handlers to the shared local-operation runner delivered by `import-openssh-aliases-into-the-hosts-tab-10-command-runtime.md`. Both intents take an empty payload, run on `~/.ssh/config`, publish on a catalog change, report as one notification attributed to the Hosts tab, and return `null`. It is the eleventh piece of `import-openssh-aliases-into-the-hosts-tab.md`, named by file name so the reference survives that plan's promotion.

## Requirements

1. The `import` intent takes an empty payload guarded by `isRefreshIntent`, as `refresh` does (source plan Implementation step 6: "They take an empty payload, guarded by `isRefreshIntent` as `refresh` is").
2. The `export` intent takes the same empty-payload guard (source plan Implementation step 6).
3. The `import` intent runs against `~/.ssh/config` (source plan Implementation step 6: "run on `~/.ssh/config`").
4. The `export` intent runs against `~/.ssh/config` (source plan Implementation step 6).
5. An `import` intent publishes the written catalog when the catalog changed (source plan Implementation step 6: "publish on a catalog change").
6. An `export` intent never publishes, because export leaves the catalog unchanged (subplan 10 Design decisions: "Export never publishes because it does not change the catalog").
7. Each intent reports its outcome through `readNotify(capabilities, true)` (source plan Implementation step 6: "reports through `readNotify(capabilities, true)`").
8. Each intent returns `null` like `deleteRow` (source plan Implementation step 6: "Each returns `null`").
9. A non-empty payload for either new intent is refused with `invalid <intent> payload` before the runner is called (`src/plugins/define-intents.ts:49` `if (!entry.payload(request.payload)) {`; source plan "They take an empty payload").
10. Neither intent opens or focuses a tab ("the dialog the verbs used to open is gone"; source plan UI design 3).
11. Imported rows appear through the existing publish path, as after `hosts add` (source plan Requirement 21).
12. One notification carries the whole outcome ("One summary line"; source plan UI design 3).
13. Fired from a remote tab, both intents refuse with `hosts import and hosts export work only in local tabs.` before any file is touched ("Refuse in remote tabs"; subplan 10 Requirement 3).
14. With no origin tab, both intents refuse with `The Hosts tab has no origin.` before any file is touched (`src/plugins/hosts/activate.ts:44` `capabilities.rejectRequest('The Hosts tab has no origin.')`).
15. The payload shape and its schema version are unchanged (source plan Implementation step 6: "The payload shape and its schema version are unchanged").
16. No in-flight guard is added; a repeated click is allowed (source plan Design decisions: "A repeated click while an operation runs is not guarded").
17. The command path keeps parsing first in `runCommand` and answering in the transcript; these intents do not change it (subplan 10 Requirement 9).
18. No new keyboard chord is introduced by these entries ("Named per row, no chord"; source plan UI design 4).

## Design decisions

Depends on `import-openssh-aliases-into-the-hosts-tab-10-command-runtime.md` being implemented, not merely promoted: `src/plugins/hosts/ssh-intents.ts` must already hold the shared runner and `src/plugins/hosts/catalog-commands.ts` must already carry subplan 9's `import` and `export` parse variants, or step 1 cannot compile. Subplans 5 to 8 supply the resolver, file access, and operations behind that runner. `import-openssh-aliases-into-the-hosts-tab-12-client-buttons.md` fires these intents and lands after this one.

- Only `src/plugins/hosts/ssh-intents.ts` and `src/plugins/hosts/activate.ts` change in production code. The two table entries sit beside `refresh`, `open`, `save`, and `delete` at `src/plugins/hosts/activate.ts:140` `intent: defineIntents('hosts', isHostsPayload, {`, using the published `isRefreshIntent` guard (Assumptions 1 to 3).
- Each handler calls the runner with its own `import` or `export` variant and an empty operand, the capabilities, `readNotify(capabilities, true)`, and the caller's publish callback. The runner's empty-operand default selects `~/.ssh/config` (subplan 10 Requirement 1), so neither handler resolves a path, reads `originTab()`, or opens a file itself. In this reporting mode both success and failure go through the injected `notify`, never through the command path's `note` and `rejectRequest` (subplan 10 Design decisions).
- The runner owns the origin reads: it refuses a remote tab first, and a null origin uses the same `The Hosts tab has no origin.` message as `originRoot` at `src/plugins/hosts/activate.ts:44`. The handlers add no second origin check (Assumption 7).
- The intent handlers return `null` like `deleteRow`, because an intent with nothing to report returns `null` and falling off the end would produce an invalid result (Assumptions 4 and 5).
- No new payload field, no schema bump, and no new manifest declaration: `src/plugins/hosts/manifest.ts:15` `capabilities: [` already lists `originTab`, `notifyUser`, `note`, `updateTab`, and `rejectRequest` (Assumption 9).
- `activate.ts` has 133 code lines today; two table entries and one import stay well below the 200-line `max-lines` limit at `eslint.config.mjs:62`, so the table stays in `activate.ts` and no extraction is needed (Assumption 8).

## Preserved behavior

1. Creating, editing, and renaming through the host form writes one sorted catalog. The new intents must not add a second catalog-write path or change the `save` intent's duplicate, missing-host, or rename handling. Pinned by `src/plugins/hosts/activate.test.ts` › `renames a host by case alone in one write`.
2. An intent that reports by notification and returns `null` keeps its shape: `deleteRow` notifies with `{ tab: 'hosts' }`, leaves the payload unchanged, and returns `null`. The new handlers must not change that attribution, return value, or payload handling. Pinned by `src/plugins/hosts/activate.test.ts` › `reports a stale deletion on the Hosts tab and keeps the current payload`.
3. `defineIntents` refuses an unknown intent and a non-empty `refresh` payload. Registering two more entries must not change those refusal messages or dispatch a different intent. Pinned by `src/plugins/hosts/activate.test.ts` › `rejects an unknown intent and a malformed intent payload`.

## Assumptions

1. The intent table is declared in one place: `src/plugins/hosts/activate.ts:140` `intent: defineIntents('hosts', isHostsPayload, {`.
2. The empty-payload guard accepts only `{}`: `src/value-guards.ts:30` `export function isEmptyIntent(value: unknown): value is Record<string, never> {`, aliased at `src/value-guards.ts:34` `export const isRefreshIntent = isEmptyIntent;` and re-exported to plugins at `src/plugins/api.ts:470` `isRefreshIntent`.
3. `refresh` is the empty-payload precedent: `src/plugins/hosts/activate.ts:141` `refresh: { payload: isRefreshIntent, run: refresh },`.
4. `deleteRow` is the notification precedent: `src/plugins/hosts/activate.ts:103` `capabilities.notifyUser(outcome.error, { tab: INSTANCE_KEY });`.
5. `deleteRow` is the `null`-return precedent: `src/plugins/hosts/activate.ts:96` `function deleteRow(`, returning `null` at `src/plugins/hosts/activate.ts:107` `return null;`.
6. Hosts-tab notifications are attributed by one helper: `src/plugins/hosts/activate.ts:48` `function readNotify(capabilities: TabPluginServerCapabilities, owned: boolean): (message: string) => void {`.
7. A null origin has one refusal message: `src/plugins/hosts/activate.ts:44` `capabilities.rejectRequest('The Hosts tab has no origin.')`.
8. `max-lines` is 200 with blank lines and comments skipped: `eslint.config.mjs:62` `'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }]`.
9. The manifest already declares the capabilities the intents need: `src/plugins/hosts/manifest.ts:17` `'notifyUser',`, alongside `note`, `updateTab`, and `rejectRequest` at `src/plugins/hosts/manifest.ts:18` to `:22`.

## Existing functionality

1. The `defineIntents` table where the entries are registered: `src/plugins/hosts/activate.ts:140` `intent: defineIntents('hosts', isHostsPayload, {`.
2. The empty-payload guard used by `refresh`: `src/plugins/hosts/activate.ts:141` `refresh: { payload: isRefreshIntent, run: refresh },`.
3. The `deleteRow` notification-and-`null` precedent: `src/plugins/hosts/activate.ts:96` `function deleteRow(`.
4. The notification-attribution helper: `src/plugins/hosts/activate.ts:48` `function readNotify(`.
5. The publish helper the command path injects: `src/plugins/hosts/activate.ts:38` `function publish(`.
6. The null-origin refusal shared with `refresh`, `save`, and `deleteRow`: `src/plugins/hosts/activate.ts:42` `function originRoot(`.
7. The `defineIntents` payload gate that refuses a non-empty payload: `src/plugins/define-intents.ts:49` `if (!entry.payload(request.payload)) {`.
8. The shared local-operation runner delivered by `import-openssh-aliases-into-the-hosts-tab-10-command-runtime.md`, Implementation step 1: `src/plugins/hosts/ssh-intents.ts`.
9. The parsed `import` and `export` variants with their `operand` string, delivered by `import-openssh-aliases-into-the-hosts-tab-9-command-verbs.md`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`; that command is both the build command and the proof that the checkpoint is green. This subplan edits two production files, `src/plugins/hosts/ssh-intents.ts` (delivered by subplan 10) and `src/plugins/hosts/activate.ts`, plus `src/plugins/hosts/activate.test.ts`. It compiles and tests green only after subplans 5 to 10 are implemented, not merely promoted: the runner, resolver, both operations, and the two `CatalogParse` variants must be in the tree. Nothing is deferred to subplan 12.

1. In `src/plugins/hosts/ssh-intents.ts`, add the two intent handlers beside the runner. Each passes its own `import` or `export` variant with an empty operand, the capabilities, `readNotify(capabilities, true)`, and the caller's publish callback into the runner in the intent reporting mode described in Design decisions, then returns `null`. Leave the runner's remote and null-origin refusals as the only origin logic; add no path resolution, file access, or command reporting here. Import project modules with the `.js` extension rule at `eslint.config.mjs:135` and never import `activate.ts`, which would close a cycle at `eslint.config.mjs:139`. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. In `src/plugins/hosts/activate.ts`, import the two handlers and register `import` and `export` as two entries beside `refresh` in the `defineIntents` table with `payload: isRefreshIntent`. Leave `runCommand`, `runCatalogCommand`, `publish`, `readNotify`, and every existing entry unchanged, and keep the file under 200 code lines. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. Extend `src/plugins/hosts/activate.test.ts` with the cases listed under Tests, leaving every existing case unchanged. Build and check with `$janissary/scripts/run.mjs check-diff` and confirm the whole server test project passes, including all three preserved-behavior pins.
4. Read the diff of `src/plugins/hosts/activate.ts` once to confirm `runCommand` and the existing entries are byte-for-byte unchanged, then run `$janissary/scripts/run.mjs check-diff` again and leave the tree green.

## User interface

1. The notification feed is the only surface this subplan changes: each intent emits one notification attributed to the Hosts tab, with no dialog, no tab focus change, and no new control. No button fires either intent until `import-openssh-aliases-into-the-hosts-tab-12-client-buttons.md` (source plan UI design 3).

## Tests

In `src/plugins/hosts/activate.test.ts`, which is exempt from `max-lines` at `eslint.config.mjs:117`:

- An `import` intent with `{}` runs against the scratch home's `~/.ssh/config`, publishes the written catalog exactly once, notifies with options `{ tab: 'hosts' }`, and returns `null` (Requirements 3, 5, 7, 8, 11).
- An `export` intent with `{}` notifies with `{ tab: 'hosts' }` and returns `null`, without publishing or changing the payload (Requirements 4, 6, 7, 8).
- A failed import and a failed export each notify instead of rejecting the request and leave the payload and the hosts file unchanged (Requirements 7, 12).
- A non-empty payload for either new intent is refused with `invalid import payload` or `invalid export payload`, with no catalog read or write (Requirement 9, preserved behavior 3).
- A remote origin refuses both intents with `hosts import and hosts export work only in local tabs.` and no file is read or written (Requirement 13).
- A null origin refuses both intents with `The Hosts tab has no origin.` before any file is touched (Requirement 14).
- Neither success path calls `note`, `openOrFocusTab`, or `rejectRequest` (Requirements 10, 12, 17).
- An unknown intent and the existing `refresh`, `open`, `save`, and `delete` cases pass unchanged (preserved behaviors 1 to 3; Requirement 18).

## Out of scope

- No command grammar change and no command dispatch change; subplans 9 and 10 own both, and `runCommand` stays exactly as subplan 10 delivered it.
- No client buttons, no dialog, no new payload field, no schema bump, no new manifest capability, and no new chord.
- No new file access, path resolution, or parsing logic; the runner and the operations already own those.
- No file operand on these intents: `isRefreshIntent` accepts only `{}`, so quoted-operand grammar belongs to the command path in subplan 9, not to these entries.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass with only these three files changed.

No control fires either intent until subplan 12, so exercise the shared behavior end to end through the command path and verify the intent wiring by a focused test run and a read of the table:

1. With the app running in a scratch home, run `hosts import` in a local Hosts tab with a scratch `~/.ssh/config` holding `Host web1` and confirm the transcript notes the summary, no tab opens, and an already open Hosts tab gains the row. Then run `hosts export` and confirm the managed section is rewritten. This proves the resolution, operations, and publish path the intents call. A failure looks like the usage line for a valid command, an opened tab, or no row in the open tab.
2. Run `npx vitest run --project server src/plugins/hosts/activate.test.ts` and read the new intent cases: each must notify with `{ tab: 'hosts' }`, return `null`, and leave `note` and `openOrFocusTab` untouched. A failure looks like a transcript note, an unattributed notification, or a non-`null` result.
3. Read `src/plugins/hosts/activate.ts` and confirm `import` and `export` sit beside `refresh` with `payload: isRefreshIntent` and that `runCommand` is unchanged from subplan 10. A failure looks like a missing entry, a non-empty payload guard, or a changed command branch.
