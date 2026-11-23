# Mark a shell tab not recording from the moment it opens under logEnabled false

**Complexity: 3/10** — ~12 added lines across 5 files, 5 requirements, 4 test scenarios (p=4.78)

## Goal

A shell tab opened while `"logEnabled": false` is set must read `not recording` from its first broadcast, as harness and ssh tabs already do. Today the shell tab is marked only when its terminal is adopted and recorded, so a typed `shell` still provisioning its workspace clone, or a remote shell placeholder, draws the plain `recording` flag until zsh starts. That contradicts the recording-retention plan's rule that "A tab opened under `logEnabled` false stays off for its whole life", and it misleads the one user who turned recording off.

## Requirements

1. "Mark a shell tab as not recording from the moment it opens": a tab of a plugin whose declaration asks for `recordsTerminal`, opened while `logEnabled` is false, carries `recordingOff` once it is in the tab list, before any state is published for it.
2. "a shell still provisioning its clone under logEnabled false reads "not recording"": the mark is set even when the plugin's factory started no terminal, as `provisioningShell` does.
3. A plugin whose declaration does not ask for `recordsTerminal` never gets `recordingOff`, under any `logEnabled` value.
4. With `logEnabled` false, `TerminalRuntimeManager.registerShellObservers` still installs no shell runtime for the terminal ("only withhold the runtime").
5. `registerShellObservers` no longer writes `recordingOff`, so the opener is the shell tab's one writer of that fact ("leaving the tab marking to the opener").

## Design decisions

- The mark is set in `openPluginTab`'s mint callback in `src/tab/openers.ts`, beside the existing `minted.remote` and workspace assignments, because that callback runs after `addPluginTab` mints the tab and before `activate` emits the dirty state (Assumption 1).
- The declaration lookup `TabManager.recordTerminal` performs today moves into a concrete `recordsTerminals(pluginId)` method on `TabOpeningState` in `src/tab/opening-state.ts`, exposed through `OpenTarget`, and `recordTerminal` calls it. This keeps one reader of the `recordsTerminal` claim and does not grow `src/tab/manager.ts`, which sits at its line ceiling (Assumption 3).
- The opener reads `getConfig().logEnabled` itself, the way `spawnTab` and `SshManager` do for their kinds (Existing functionality 2), so each tab kind has exactly one writer of `recordingOff`.
- `updatePluginTab` sets no mark: the tab it updates was opened through `openPluginTab`, which already marked it (Assumption 2).

## Preserved behavior

1. A plugin tab's `recordingOff` is mirrored onto its view only when set. It must not be sent as `false` or dropped from a marked tab. Pinned by `src/tab/view.test.ts` "mirrors recordingOff onto the harness view and the plugin view".
2. A plugin whose declaration did not ask for recording has no runtime registered and no transcript installed. Its terminal must not be handed to `registerShellObservers`. Pinned by `src/tab/manager.test.ts` "records nothing for a plugin whose declaration did not ask for it".
3. With `logEnabled` false no shell transcript is installed, while the terminal is still handed to the runtime manager. The transcript writer must not be installed. Pinned by `src/tab/manager.test.ts` "writes no shell transcript when logEnabled is false".
4. With `logEnabled` true the shell runtime and its recorder are installed and the tab is not marked. A recorder must not be withheld. Pinned by `src/terminal-runtime/manager.test.ts` "installs a shell runtime when logEnabled is true".

## Assumptions

1. The mint callback runs after the tab is in the list and before state is published: `src/tab/openers.ts:44` `function activate(` applies the result, runs `afterApply`, then emits `messageBus.emit('state', { type: 'dirty' })`.
2. Every plugin tab, including the launch shell, typed shells, and remote shells, is created through `openPluginTab`: `src/tab/openers.ts:140` is the only caller of `addPluginTab`.
3. `src/tab/manager.ts` is at 199 counted lines of the 200-line `max-lines` limit, while `src/tab/opening-state.ts` is at 58.
4. A provisioning shell starts no terminal in its factory: `src/plugins/shell/launch-tab.ts:54` returns `provisioningShell({ instanceKey, cwd: start.cwd, root, workspace, hookNonce })`.
5. A plugin that declares `recordsTerminal` must also ask to start terminals: `src/plugins/activate.ts:49` `if (!declaration.recordsTerminal || declaration.spawnTerminal) return;`.

## Existing functionality

1. The declaration lookup for the recording claim: `src/tab/manager.ts:244` `this.managers.plugins.declarations .find((declaration) => declaration.id === pluginId)?.recordsTerminal === true`.
2. The creation-time mark for a harness tab: `src/harness/tab-spawn.ts:40` `if (!getConfig().logEnabled) tab.recordingOff = true;`.
3. The view mirror of the mark: `src/tab/view.ts:62` `...(tab.recordingOff === true && { recordingOff: true })`.
4. The shell recording gate that withholds the runtime: `src/terminal-runtime/manager.ts:37` `registerShellObservers(id: string, label: string): void {`.

## Implementation steps

1. **Move the declaration lookup and mark at open.** In `src/tab/opening-state.ts`, add a concrete `recordsTerminals(pluginId: string): boolean` method on `TabOpeningState` that answers from `this.managers.plugins.declarations`. In `src/tab/manager.ts`, make `recordTerminal` call `this.recordsTerminals(pluginId)` in place of its inline lookup, and update its comment to say the opener marks the tab while the runtime manager withholds the runtime. In `src/tab/openers.ts`, add `recordsTerminals(pluginId: string): boolean` to `OpenTarget`, import `getConfig` from `../config.js`, and in the `openPluginTab` mint callback set `minted.recordingOff = true` when `getConfig().logEnabled` is false and `target.recordsTerminals(pluginId)` is true, before the adopt and record loops and regardless of whether any terminal was started. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Leave only the runtime gate in the runtime manager.** In `src/terminal-runtime/manager.ts`, make `registerShellObservers` return without installing a runtime when `logEnabled` is false, and no longer look up or mark the tab. Update its comment to say the opener marks the tab. Update the `Tab.recordingOff` comment in `src/tab/types.ts` to say a harness or ssh tab is marked by its spawner and a recorded plugin tab by `openPluginTab`. Build command: `$janissary/scripts/run.mjs check-diff`.
3. **Tests and spec.** Add and adjust the tests listed below, and update `product/specs/harness-recording.md` § The recording flag so the whole-life sentence names a shell tab still having its clone made or its connection opened, and add the same from-open wording to the `logEnabled` sentence in `product/specs/shell-tab.md` § Session recording. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No UI component changes. The existing plain, inert `not recording` flag in the shell tab's metadata row now appears from the tab's first broadcast instead of only once zsh starts, because the server sends `recordingOff` earlier.

## Tests

- `src/tab/manager.test.ts`: add "marks a recorded plugin's tab not recording from the moment it opens when logEnabled is false", whose factory starts no terminal, asserting the tab carries `recordingOff` (Requirements 1, 2).
- `src/tab/manager.test.ts`: add "never marks a plugin tab not recording when its declaration did not ask to record", under `logEnabled` false, asserting `recordingOff` is undefined (Requirement 3).
- `src/tab/manager.test.ts`: add "leaves a recorded plugin's tab unmarked when logEnabled is true", asserting `recordingOff` is undefined (Requirement 1's boundary).
- `src/terminal-runtime/manager.test.ts`: rename "installs no shell runtime and marks the tab not recording when logEnabled is false" to "installs no shell runtime and leaves the tab unmarked when logEnabled is false", asserting no runtime under the PTY id and `recordingOff` undefined on the tab (Requirements 4, 5).

## Out of scope

- Harness and ssh tabs, which are already marked at creation.
- The restored-ssh bridge tab, left unmarked by the recording-retention plan.
- Client code: `recordingOff` already flows to the shell metadata row.
- The other entries in `product/backlog/pull-request.md`.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Set `"logEnabled": false` in `.janissary/config.json`, launch the app, and type `shell` in a tab so a workspace clone is provisioned. While the tab still shows its provisioning state, hover the film icon in its metadata row: the tooltip reads `not recording` and the icon is plain and cannot be pressed. Once zsh starts the flag still reads `not recording`. Failure looks like a tooltip reading `recording` during provisioning, or a green flag at any time.
