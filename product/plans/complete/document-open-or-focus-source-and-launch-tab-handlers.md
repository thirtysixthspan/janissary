# Document openOrFocusTab's answering-tab source and launchTab's handler restriction

**Complexity: 2/10** — documentation, a doc comment, one reworded error message and one test. Behavior does not change. The only risk is wording that overstates what the host does, so each claim below was checked against `src/plugins/context.ts`, `src/plugins/invoke.ts` and `src/plugins/host.ts` first.

This pull request changed two plugin-contract behaviors without listing them in the developer reference:

- `openOrFocusTab` now uses the answering tab as the source of the tab it opens (`context.ts`: `answering ?? origin.label`). An intent answered for one of the plugin's own tabs therefore places the new tab in that tab's group and opens it even after the tab that created the answering tab has closed. The reference still says only "focuses or creates a plugin tab", and `product/specs/tab-plugins.md` describes the placement in shell terms only ("the shell's ➕").
- `launchTab` needs the deferred-call port that `invokePlugin` builds only when it is handed a `disable` callback. `TabPluginHost` passes one for commands, openers, intents and selection or menu actions, but the notification and host-state channels (`subscribeHostChannels` in `host.ts`) invoke without one. A `launchTab` call from a `notify` or `hostState` handler therefore throws `used "launchTab" outside a guarded call`, which disables the plugin with a reason that misdescribes the problem. Neither the reference nor the `launchTab` doc comment says so.

## Goal

The developer reference, the API doc comment and the spec describe both behaviors, and the thrown message names the real condition.

## Approach

1. `documentation/developer-documentation/tab-plugins.md`:
   - Extend the `openOrFocusTab(instanceKey, factory)` capability bullet: called from an intent or from a selection action on one of the plugin's own tabs, the new tab is sourced from that answering tab (the tab `originTab()` reports), takes its group, and opens even when the tab that created the answering tab has closed.
   - Extend the `launchTab` capability bullet: available from commands, openers, intents and selection or menu actions; calling it from a `notify` or `hostState` handler is a failure that disables the plugin.
   - Add a v1 changelog bullet beside the `launchTab` and confinement bullets explaining the answering-tab source and why it stays v1 (no signature changes; it only changes which open tab a new tab is placed beside).
2. `src/plugins/api.ts`: add the handler restriction to the `launchTab` doc comment on `TabPluginServerCapabilities`.
3. `src/plugins/launch-tab.ts`: reword the thrown message to `"launchTab" is not available from a notification or host-state handler`. No existing test asserts the old wording.
4. `product/specs/tab-plugins.md`: generalize the answering-tab placement paragraph so it holds for every plugin, keeping the shell's ➕ as the example, and add that a launch cannot be made from a notification or host-state handler.

## Tests

Add one case to `src/plugins/launch-tab.test.ts` that builds the capabilities with `launchCapabilities` and no deferred port, and expects `launchTab` to throw the new message.

## Out of scope

- Giving notification and host-state handlers a deferred port so `launchTab` works there.
- Any change to `openOrFocusTab`'s behavior.
