# Collapse the shell plugin's recording flag onto the shared component

**Complexity: 2/10** — delete one component and its test, re-export the shared one, and move the cases that cover its behavior. No behavior changes; the rendered markup is byte-for-byte what both copies already produce.

## Summary

The recording flag exists twice. `web/src/shared/RecordingFlag.tsx` and `web/src/plugins/shell/ShellRecordingFlag.tsx` each implement the same rule — a `<button>` carrying `tab-flag tab-flag--active tab-recording` when there is something to open, a `<span>` carrying `tab-flag tab-recording` when there is not — and each derives its icon and label from the same `tabFlagDisplay.recording` entry.

The duplication was justified in the plan by the shell plugin's independence from the host's `AgentTabMeta` markup, which is real and deliberate. That reason does not reach a component this branch introduced, and the plugin api barrel already re-exports shared components the way it re-exports `PluginActionsHeader`. So the plugin can render the shared one, and the two copies become one.

## Design decisions

1. **The shared component is re-exported through the plugin api barrel**, beside the existing `tabFlagDisplay` export, rather than imported across the plugin boundary directly. `web/src/plugins/api.ts` is the sanctioned seam: it already publishes `terminalColors`, `isTextEntryElement` and `PluginActionsHeader` for exactly this reason, so adding one more export is the pattern rather than a new route.

2. **The dead `tabFlagDisplay.recording` lookup guard goes.** Both copies open with `const display = tabFlagDisplay.recording; if (!display) return null;`. The key is a literal in the same module's exported record, so the guard can never fire — it suggests to a reader that the flag is optional when it is not. The component reads the entry directly.

3. **The shell plugin's own test keeps the part that is genuinely the shell's.** Pressability and inertness are the shared component's behavior and its cases move with it; what belongs to `ShellTabMeta` is that the shell row hands the shared component its capability. So a small case stays in the plugin suite asserting that wiring, and the plugin does not end up with a test file that only re-tests the shared component.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| The component to keep | `web/src/shared/RecordingFlag.tsx` |
| The barrel export point | `web/src/plugins/api.ts`, beside `tabFlagDisplay` and `PluginActionsHeader` |
| The flag's single definition, unchanged | `web/src/shared/tab/flag-display.ts` |
| The shell row that renders it | `web/src/plugins/shell/ShellTabMeta.tsx` |

## Proposed changes

- `web/src/plugins/api.ts` — re-export `RecordingFlag` beside the existing `tabFlagDisplay` export, so the plugin reaches it the way it reaches every other shared thing.
- `web/src/plugins/shell/ShellTabMeta.tsx` — import `RecordingFlag` from the api barrel in place of `ShellRecordingFlag`, and render `<RecordingFlag onOpen={capabilities.openRecording} />`. The class names and both branches are unchanged, so the markup the browser receives does not differ.
- `web/src/shared/RecordingFlag.tsx` — drop the `if (!display) return null` guard.
- `web/src/plugins/shell/ShellRecordingFlag.tsx` — **deleted.**
- `web/src/plugins/shell/ShellRecordingFlag.test.tsx` — **deleted**, its pressability and inertness cases moving to the new shared test.
- `web/src/shared/RecordingFlag.test.tsx` (new) — the moved cases: pressable and green when `onOpen` is supplied, plain inert `span` when it is not, the `recording` tooltip and accessible name in both states, and the icon and label read from `tabFlagDisplay` rather than declared locally.

## Tests

The new `web/src/shared/RecordingFlag.test.tsx` carries the behavior cases the shared component now owns. `web/src/plugins/ShellTabMeta.test.tsx` gains one case: given a capability set with `openRecording`, the shell row's flag is a pressable button — the wiring, not the rendering.

`web/src/shared/AgentTabMeta.test.tsx` already pins the harness row's use of the shared component and must keep passing untouched, including the `.tab-recording` class assertion added when the flag's styling was corrected. `web/src/plugins/shell/ShellTabMeta.test.tsx` does not exist today; check whether the shell plugin's other suites already cover `ShellTabMeta` before creating a new file for one case, and put it in whichever file already renders the metadata row if one does.

## Out of scope

- The flag's definition in `web/src/shared/tab/flag-display.ts`. It is already shared, and it stays exactly as it is — this change unifies the rendering, not the definition.
- Any change to what the flag renders, its class names, its order in the row, its label, or its green-when-pressable rule. The markup is identical before and after; only the number of places that produce it changes.
- The shell plugin's independence from `AgentTabMeta`. Unaffected: it never imported that, and this change does not make it.
- Specs and documentation. Both already describe one flag with one behavior, which is what this makes true of the code.

## Verification

- `./scripts/run.mjs check-diff` after the change.
- Manual: open a harness tab and a shell tab and confirm the film flag is unchanged in both — same icon, same **recording** tooltip, green and pressable once each session has printed something, grey and inert before. Dock a shell tab into a sidebar and confirm the same flag there.