# Hand plugin intents the tab's payload as it stands when they run

**Complexity: 3/10** — The host reads a plugin tab's payload when an intent request arrives, then awaits activation before calling the plugin, and hands the plugin that earlier read. Two intents for the same tab that arrive in the same tick both read the payload before either runs, so the second one merges its change into a payload that no longer exists and writes the first one's change away. The shell tab hits this on every command: zsh reports "finished" and its working directory in the same burst, so the `command-state` and `cwd` intents arrive together, and the `cwd` intent writes back the `commandRunning: true` it read before the finish was applied. The tab's dot then blinks until the next command finishes. Whether two requests land in one tick depends on timing, which is why it shows up with two shell tabs open and not with one.

## Goal

A shell tab's dot stops blinking as soon as its command finishes, however many shell tabs are open, and any plugin intent that merges into its tab's payload merges into the current one.

## Approach

In `runPluginIntent`, read the tab's payload inside the guarded call rather than before the activation await, looking the tab up again by label so a tab rebuilt by a close or a reorder is still found. The handler and the `updateTab` it calls run synchronously inside that call, so no other intent can change the payload between the read and the write. When the tab has gone in the meantime, the payload read on arrival is used, as today.

## Implementation

1. In `src/plugins/requests.ts`, resolve `tabPayload` at call time from the live tab with the request's label, falling back to the payload read on arrival.
2. Add a sentence to the shell-tab spec's command status behavior stating that the dot stops blinking when a command finishes, with any number of shell tabs open.

## Tests

- `src/plugins/intent.test.ts`: two intents for the same tab issued in the same tick, each merging its own field into the payload it is handed, leave the payload with both fields.
- The same file: an intent whose tab payload changed between the request arriving and the handler running is handed the changed payload.

## Out of scope

- Changing the shell plugin's handlers, which already merge into the payload they are handed.
- Serializing intents per tab, or any change to how the client sends them.
