# Shell tab text transcript 07: client capability and the **Open transcript** button

**Complexity: 3/10** — an additive optional pair on the plugin client capabilities following the `recording` / `openRecording` precedent exactly, a `PluginBody` dependency, an icon re-export on the plugin api barrel, and one conditional button in `ShellTabMeta`; web-only, with tests for each.

## Goal

Give the shell tab's metadata row an **Open transcript** button that appears when the server has pushed a transcript path and opens it through `openTranscriptFileFor`, docked shells included.

Source plan: implementation-order step 8.

## Design decisions carried from the source plan

- **Decision 8** — a `tab-open-transcript` button drawn with `viewCaptureIcon` (regular-weight `faClipboard`), tooltip and accessible name `Open transcript`, behaving like the harness tab's; not drawn under `recordShellTabs: false`.
- **Decision 17** (client half) — `transcript?: string` and `openTranscript?()` on the plugin client capabilities, supplied together or not at all, exactly as `recording` / `openRecording`. The button appears as soon as the file opens, which in practice is as the shell starts.
- **Decision 16** (client half) — `openTranscript` sends the existing `openTranscriptFileFor` with the tab's label; no new protocol method.

## Dependencies

- Subplan 02 — `openTranscriptFileFor` is the method name on the client protocol type.
- Subplan 06 — `PluginTabView.transcript` is pushed.

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| `recording?` / `openRecording?()` on `TabPluginClientCapabilities` and their together-or-not-at-all spread in `createPluginClientCapabilities` | `web/src/plugins/api.ts:264-271`, `:298`, `:352-357` | Exact precedent for `transcript` / `openTranscript` |
| Icon re-export line on the plugin api barrel | `web/src/plugins/api.ts:94` | Add `viewCaptureIcon` |
| `viewCaptureIcon` | `web/src/shared/icons.ts:42` | The clipboard glyph |
| `PluginBody` reading `plugin.recording` and memoizing capabilities | `web/src/plugins/PluginBody.tsx:181-201` | Read `plugin.transcript` beside it and add to dependencies |
| Harness **Open transcript** button markup and placement | `web/src/harness/HarnessTabMeta.tsx:116` | Same class, title, aria-label, icon and order |
| `ShellTabMeta` and its comment explaining the omitted control | `web/src/plugins/shell/ShellTabMeta.tsx:15-25`, split button at `:88`, connections window button at `:95` | Insert the button; replace the comment |

## Proposed changes

- `web/src/plugins/api.ts` — add `transcript?: string` and `openTranscript?(): void` to `TabPluginClientCapabilities`, commented like the recording pair. `createPluginClientCapabilities` takes the pushed transcript path (a new parameter beside `recording`) and spreads `transcript` and `openTranscript` together only when it is defined, `openTranscript` sending `{ method: 'openTranscriptFileFor', params: { label } }`. Add `viewCaptureIcon` to the `export { … } from '../shared/icons'` re-export so the plugin does not import `../../shared/icons`. Both additions are optional and additive, so `TAB_PLUGIN_API_VERSION` does not move (the same reasoning the barrel's comments give). The file is 179 counted lines; if the additions would push it past 200, extract a cohesive group (for example the capability-construction helpers) into a sibling module rather than compacting.
- `web/src/plugins/PluginBody.tsx` — read `plugin.transcript` off the envelope beside `plugin.recording`, pass it into `createPluginClientCapabilities`, and add it to the `useMemo` dependency list, so a docked shell's button works too. The file is 182 counted lines; keep the change minimal.
- `web/src/plugins/shell/ShellTabMeta.tsx` — when `capabilities.openTranscript` is present, render a `<button type="button" className="tab-open-transcript" title="Open transcript" aria-label="Open transcript">` with `viewCaptureIcon` (imported from the plugin api barrel), placed after the split (`plusMinusIcon`) button and before the connections window button — the order `HarnessTabMeta` uses — calling `capabilities.openTranscript`. Replace the component comment that says the row omits **Open transcript** with one stating the button appears when the host supplies a transcript.

## Tests

- `web/src/plugins/api.test.ts` — `transcript` and `openTranscript` are supplied together when a path is given and both absent otherwise; `openTranscript` sends `openTranscriptFileFor` with the tab's label.
- `web/src/plugins/shell/ShellTabMeta.test.tsx` — the button is drawn with title `Open transcript` when `openTranscript` is present, absent otherwise, and pressing it calls `openTranscript`; it sits after the split button and before the connections button.
- `web/src/plugins/PluginBody.test.tsx` has no recording assertion today; adding one for `plugin.transcript` reaching the capabilities is optional (the api test covers the together-or-not-at-all rule).

## Verification

- `./scripts/run.mjs check-diff` (web tests run, since `web/src/` changes).
- Manual: launch the app, open a shell tab, confirm the clipboard **Open transcript** button appears on its metadata row after the split control, hover shows `Open transcript`, and pressing it opens an editor tab `transcript <label>` with the session text. Dock the shell to a sidebar and confirm the button still works. The full end-to-end pass is subplan 08.

## Out of scope

- Specs, user documentation, and the full end-to-end verification — subplan 08.
- Any change to the harness tab's own button (already uses `openTranscriptFileFor` after subplan 02).
