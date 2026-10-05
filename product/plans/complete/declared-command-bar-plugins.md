# Declared command-bar plugins instead of hard-coded shell checks

**Complexity: 6/10** — additive on both sides of an existing contract: one optional declaration flag carried on the tab's wire view the way `chords` already is, and one capability shaped like `setUnread`. The work is spread over server declaration, view, capability, and four client sites, but every piece follows an established pattern and nothing changes the API integer.

## Goal

The core client no longer knows the shell plugin by id or by payload shape. Today `web/src/MountedViewLayers.tsx`, `web/src/pickers/usePickerOverlays.ts` and `web/src/pickers/useQueuePicker.ts` branch on `plugin?.id === 'shell'`, and `web/src/TabItem.tsx` imports the shell's payload guard to blink the tab dot from `commandRunning`. A second plugin with a command bar would silently get none of the picker, queue, or busy behavior, and a change to the shell payload would break the tab strip.

## Approach

Two contract additions, both additive within v1:

1. **`hostsCommandBar` declaration flag.** A plugin whose tab hosts the application command bar says so in its manifest. The host carries it on the tab's wire view as `plugin.hostsCommandBar: true` (omitted otherwise, like `chords`, so other plugin tabs cost no bytes), and the client reads that instead of the plugin id. The shell's manifest sets it.

   Validation: the queue popup that a command-bar tab takes lists and edits that tab's own command queue, which the plugin fills with `queueLine` and drains with `nextQueuedLine`. A declaration claiming the bar without asking for both would show a queue that nothing ever runs, so it is refused at activation with `hosts the command bar but does not request "<names>"`, the same way a `hostState` slice with no handler is refused.

2. **`setBusy(instanceKey, busy)` capability.** The tab strip's busy dot is host state. The plugin sets it on one of its own tabs, addressed by instance key like `setUnread`; an unknown key is a no-op. It is stored on the plugin tab record (`PluginTabRecord.busy`), not on the tab runtime: `runtime.busy` is the host's own command-in-flight gate that `send`, `queue`, and persisted agent state read, and a plugin lighting its dot must not change how the host routes input to the tab. The wire view's `busy` becomes `runtime busy || plugin busy`. The shell's `command-state` intent calls it beside its existing payload update, and `TabItem` drops the shell guard and reads `tab.busy` alone. The shell payload keeps `commandRunning`, which the shell body still reads for its own queue.

`buildTabView`'s `chordsFor` lookup is generalized to a declaration lookup so the chord claim and the command-bar flag are read from one place.

A small client helper, `hostsCommandBar(tab)` in `web/src/shared/command-bar/hosts-command-bar.ts`, replaces the three picker/layer checks so the rule lives once.

Rejected: putting the shell's busy state into `runtime.busy`. It would make `send` and `queue` treat a shell running a command as a busy agent tab and would persist it as `active`, which is a behavior change this entry does not ask for. Rejected: a client-side registry of command-bar plugin ids — it is a second copy of the declaration, which the chord claim already avoided by riding the wire view.

## Implementation steps

1. `src/plugins/api.ts`: add `hostsCommandBar?: boolean` to `TabPluginDeclaration` and `setBusy(instanceKey, busy)` to `TabPluginServerCapabilities`. `src/plugins/api-capabilities.ts`: add `setBusy` to the capability union and record.
2. `src/plugins/activate.ts`: refuse a `hostsCommandBar` declaration missing `queueLine` or `nextQueuedLine`.
3. `src/tab/types.ts`: add `busy?: boolean` to `PluginTabRecord`. `src/plugins/context.ts`: implement `setBusy`, emitting a state broadcast only when the value changes.
4. `src/protocol/plugin.ts`: add `hostsCommandBar?: true` to `PluginTabView`. `src/tab/view.ts`: replace `chordsFor` with a declaration lookup; emit `chords` and `hostsCommandBar` from it; fold `plugin.busy` into `busy`.
5. `src/plugins/shell/manifest.ts`: set `hostsCommandBar: true` and request `setBusy`. `src/plugins/shell/activate.ts`: call `setBusy` from `command-state`.
6. `web/src/shared/command-bar/hosts-command-bar.ts`: new helper. Use it in `web/src/MountedViewLayers.tsx`, `web/src/pickers/usePickerOverlays.ts`, `web/src/pickers/useQueuePicker.ts`. `web/src/TabItem.tsx`: drop the shell payload import and branch.
7. Docs: `documentation/developer-documentation/tab-plugins.md` (declaration table row, capability list entry and count, changelog line — the count and list are pinned by `src/plugins/documentation.test.ts`, so adding a capability requires them), `product/specs/tab-plugins.md` (declaration summary, `setBusy` paragraph, command-bar flag paragraph), `product/specs/shell-tab.md` if its dot sentence names the mechanism.

## Tests

- `src/plugins/declaration-validation.test.ts`: a `hostsCommandBar` declaration without the queue capabilities is disabled with the stated reason; with them it activates; the bundled shell manifest passes.
- `src/plugins/context.test.ts`: `setBusy` sets the flag on an owned tab, ignores an unknown instance key, and throws when undeclared (covered by the existing undeclared-capability pattern).
- `src/tab/view.test.ts`: a plugin tab whose declaration hosts the command bar carries `hostsCommandBar: true`, one that does not omits it; a plugin record's `busy` makes the view busy.
- `src/plugins/shell/activate.test.ts`: `command-state` calls `setBusy` with the reported running state.
- `web/src/TabStrip.test.tsx`: replace the payload-driven shell dot test with one asserting a shell payload's `commandRunning` alone no longer blinks the dot (the host's `busy` does).
- `web/src/pickers/useQueuePicker.test.tsx`, `web/src/MountedViewLayers.test.tsx`: shell fixtures declare `hostsCommandBar`; add a case that a plugin tab with the flag but another id gets the queue popup, and that a `shell`-id tab without the flag does not.
- `web/src/shared/command-bar/hosts-command-bar.test.ts`: the helper's truth table.

## Out of scope

- The dead `!pickerOverlays` branches in `MountedViewLayers` and the duplicate navigator (a separate backlog entry); their condition is only re-keyed here.
- Source-tab keying of pickers and scoping of the published command-bar state (separate entries).
- Server-side shell routing (`ownsTerminal`) — it is already keyed on a live terminal, not a plugin id.
