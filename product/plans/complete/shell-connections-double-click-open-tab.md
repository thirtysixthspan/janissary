# Shell connections icon: double click opens the connections tab

**Complexity: 2/10** — web-only. One optional client capability, one prop on the shared status-window button, and one handler in the shell's metadata row. It reuses the existing bare `connections` command, so no protocol or server change.

## Goal

Double-clicking the connections icon in a shell tab's metadata row opens or focuses the app-wide connections tab. A single click keeps its current behavior: it exposes and pins the connections popup.

## Design decisions

- **Double click opens the list tab, single click keeps the popup.** The gesture is deliberately different from clicking a popup row: a row opens that record's connection tab, while the icon's double click opens the app-wide `connections` list. Single click still toggles the popup's pinned state, so nothing about hover, auto-show, or pinning changes.
- **Reuse the command, not a new RPC.** Bare `connections` already opens or focuses the list tab (`src/commands/connections.ts` via the connections plugin). The client capability sends that command exactly as `openScheduleLaunch` sends bare `schedule`; the server already answers it, so nothing server-side changes.
- **A client capability, not an intent or a raw client.** A plugin's `intent` runs on its own server activation, which cannot open another plugin's tab, and a plugin body is deliberately withheld the raw client. An additive optional capability that sends a fixed command follows the established `openScheduleLaunch` pattern and needs no API version bump.
- **The double-click prop lives on the shared button.** `StatusWindowButton` is the one component that renders the connections and schedule icons across shell, harness, and editor tabs. Adding an optional `onDoubleClick` there lets the shell opt in without forking markup; the other consumers keep passing nothing and behave exactly as before. Like `onClick`, it is wired only when the window has content, so the empty/inert button stays inert.
- **Optional capability.** `openConnections` is optional so the capability fixtures that build a `TabPluginClientCapabilities` object need no change, the same reason `openDiffHere` and `openTranscript` are optional.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Bare `connections` opens or focuses the list tab | `src/commands/connections.ts`, `src/plugins/connections/command.ts` | The double click sends this command; no server change |
| Command-sending plugin capability | `openScheduleLaunch` in `web/src/plugins/plugin-client-capabilities.ts:87` | `openConnections` is the same shape, built from the same `client` |
| The shell's connections icon | `StatusWindowButton` in `web/src/plugins/shell/ShellTabMeta.tsx:105` | Add one prop rather than new markup |
| Shared status-window button | `web/src/shared/status-windows/StatusWindowButton.tsx` | Add the optional double-click prop here |
| Existing click/row tests | `web/src/plugins/shell/ShellTabMeta.test.tsx`, `web/src/shared/status-windows/StatusWindowButton.test.tsx` | Extend these helpers with a spy and a double-click case |

## Implementation steps

1. In `web/src/plugins/api.ts`, add optional `openConnections?(): void;` to `TabPluginClientCapabilities` beside `openScheduleLaunch`, with a comment in the file's style saying it opens or focuses the connections tab by sending the bare `connections` command.
2. In `web/src/plugins/plugin-client-capabilities.ts`, implement `openConnections: () => { client.send({ method: 'command', params: { text: 'connections' } }); },` beside `openScheduleLaunch`.
3. In `web/src/shared/status-windows/StatusWindowButton.tsx`, add an optional `onDoubleClick?: () => void;` to `Properties` and destructure it. Wire it as `onDoubleClick={hasContent ? onDoubleClick : undefined}` on the button, so the empty button stays inert. Existing callers pass nothing and are unaffected.
4. In `web/src/plugins/shell/ShellTabMeta.tsx`, pass `onDoubleClick={() => { capabilities.openConnections?.(); }}` to the connections `StatusWindowButton` only (not the schedule one), after the `statusButton(...)` spread.

## Tests

- `web/src/plugins/plugin-client-capabilities.test.ts`: a case that calls `capabilities.openConnections?.()` and expects `send` to have been called with `{ method: 'command', params: { text: 'connections' } }`.
- `web/src/shared/status-windows/StatusWindowButton.test.tsx`: a case where `onDoubleClick` fires once on a double click when the button has content; a case where it is not wired when the button has no content (mirroring the existing `onClick` case).
- `web/src/plugins/shell/ShellTabMeta.test.tsx`: with a payload that has a connection row and an `openConnections` spy, firing a double click on the `.tab-connections` button calls `openConnections` once; a companion case asserts a single click still drives the popup's `onButtonClick` handler and does not call `openConnections`.

Every test extends the referenced files' existing helpers (`setup`, the `render` calls, `fireEvent`) and asserts on spies, with no new test infrastructure.

## Spec updates

- `product/specs/connection.md` — in the metadata-connections-button paragraph, add that on a shell tab a double click opens or focuses the connections tab while a single click still pins the window.
- `product/specs/shell-tab.md` — in the metadata-row section, add that double-clicking the connections button opens or focuses the connections tab, and that a single click still shows the popup.

## Docs

- `documentation/user-documentation/command-bar/connections.md` — in "The connections window", extend the sentence about the link icon's click behavior: a double click on a shell tab's icon opens the connections tab, while a single click still pins the panel. Do not add documentation for behavior that was not already described; this paragraph already documents the icon.

## Out of scope

- No change to the harness or editor tab's connections icon; they keep single-click behavior only.
- No change to popup rows, the schedule button, or the pinning/hover/auto-show behavior.
- No new server RPC, intent, or protocol type, and no plugin API version bump.
- No keyboard shortcut for opening the connections tab from the shell.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each step. All lint, typecheck, and diff-scoped tests must pass before shipping. Do not run `npm run check`; that is the human's end-of-work gate.
