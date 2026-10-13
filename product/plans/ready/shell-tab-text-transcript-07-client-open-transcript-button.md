# Shell tab text transcript 07: client capability and the **Open transcript** button

**Complexity: 3/10** — an additive optional pair on the plugin client capabilities that copies the `recording` / `openRecording` precedent, one new positional parameter threaded through the single production caller (`PluginBody`), an icon re-export on the plugin api barrel, and one conditional button in `ShellTabMeta`; web-only, but correctness depends on the docked path and on retiring a now-false shell test.

## Goal

Give the shell tab's metadata row an **Open transcript** button that appears when the server has pushed a transcript path and opens it through `openTranscriptFileFor`, docked shells included.

Source plan: `product/plans/ready/shell-tab-text-transcript.md`, implementation-order step 8 and § Client (decisions 8, 17).

## Design decisions carried from the source plan

- **Decision 8** — a `tab-open-transcript` button drawn with `viewCaptureIcon` (regular-weight `faClipboard`), tooltip and accessible name `Open transcript`, behaving like the harness tab's; not drawn under `recordShellTabs: false`.
- **Decision 17** (client half) — `transcript?: string` and `openTranscript?()` on the plugin client capabilities, supplied together or not at all, exactly as `recording` / `openRecording`. The button appears as soon as the file opens, which in practice is as the shell starts.
- **Decision 16** (client half) — `openTranscript` sends the existing `openTranscriptFileFor` with the tab's label; no new protocol method.

## Decisions made in this subplan

- **The client never reads `recordShellTabs`.** The opt-out is enforced entirely by the server not setting the field (`src/protocol/plugin.ts:18-21`, `transcript?: string`, and `src/tab/view.ts:149`, `...(transcript !== undefined && { transcript })`). The button's presence keys on `capabilities.openTranscript` alone.
- **The button is not disabled while the workspace provisions.** Unlike the diff and launch buttons it does not depend on the workspace; it is drawn or not, never inert — the same as the harness button (`web/src/harness/HarnessTabMeta.tsx:116`, which takes no `disabled`).
- **The new parameter is positional, directly after `recording`.** `createPluginClientCapabilities` is called positionally from exactly one production site (`web/src/plugins/PluginBody.tsx:196`); the 20-odd calls in `web/src/plugins/api.test.ts` pass only the first seven arguments and are untouched. Do not convert the signature to an options object in this subplan.
- **No CSS change.** `.tab-open-transcript` is styled globally in `web/src/theme.css:319-323` (the same file styles `.tab-open-diff`, which the shell row already uses unchanged), so the shell row picks it up as is.
- **No `TAB_PLUGIN_API_VERSION` bump** (`src/plugins/api-capabilities.ts:6`). Both additions are optional and additive, which `ai/guidelines/plugins.md` classes as a minor change and the barrel's own comments treat the same way.

## Dependencies

Both have landed on this branch; verified in the repo:

- Subplan 02 — `openTranscriptFileFor` is the client protocol method (`src/protocol/core-rpc.ts:58`, `{ method: 'openTranscriptFileFor'; params: { label: string } }`), already sent by the harness tab (`web/src/harness/HarnessTab.tsx:64`).
- Subplan 06 — `PluginTabView.transcript` is pushed (`src/protocol/plugin.ts:21`, `src/tab/view.ts:92,149`).

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| `recording?` / `openRecording?()` fields and their comments on `TabPluginClientCapabilities` | `web/src/plugins/api.ts:264-271` | Precedent for the field pair and its comment |
| `recording?: string` parameter of `createPluginClientCapabilities` | `web/src/plugins/api.ts:298` | Add `transcript?: string` directly after it |
| Together-or-not-at-all spread `...(recording !== undefined && { recording, openRecording: … 'openRecordingFor' … })` | `web/src/plugins/api.ts:352-358` | Same shape for `transcript` / `openTranscript`, sending `openTranscriptFileFor` |
| Icon re-export `export { detachSessionIcon, … plusMinusIcon } from '../shared/icons'` | `web/src/plugins/api.ts:94` | Append `viewCaptureIcon` |
| `viewCaptureIcon` | `web/src/shared/icons.ts:42` (`faClipboard as viewCaptureIcon`, regular weight) | The glyph |
| `PluginBody` reading `const recording = plugin.recording` and memoizing capabilities | `web/src/plugins/PluginBody.tsx:181-184`, `useMemo` at `:195-202` | Read `plugin.transcript` beside it; pass and add to deps |
| Harness **Open transcript** button markup | `web/src/harness/HarnessTabMeta.tsx:116-126` | Same `type`, `className`, `title`, `aria-label`, icon |
| Docked recording test and its counting fixture | `web/src/plugins/DockedPluginBody.test.tsx:38-60` (fixture), `:190-217` (two cases) | Extend for the docked transcript case |
| Existing shell row test file and its `capabilities(overrides)` helper | `web/src/plugins/shell/ShellTabMeta.test.tsx:18-23` | Add the button cases here |
| Order assertion over `.tab-meta-actions` children | `web/src/harness/HarnessTab.test.tsx:425-426` | Pattern for the shell order assertion |

## Proposed changes

Land in this order so typecheck stays green at each step: `api.ts`, then `PluginBody.tsx`, then `ShellTabMeta.tsx`, then tests.

### `web/src/plugins/api.ts` (179 counted lines today; about 186 after)

- On `TabPluginClientCapabilities`, directly after `openRecording?(): void;`, add `transcript?: string` and `openTranscript?(): void`. Comment them like the recording pair: `transcript` is this tab's plain-text transcript path, absent until the transcript file has opened and always absent under `recordShellTabs: false`; `openTranscript` opens it in an editor tab, supplied together with `transcript` and absent without it.
- Add `transcript?: string` as a new positional parameter immediately after `recording?: string` (line 298) and before `remoteCapabilities`.
- In the returned object, directly after the recording spread (lines 352-358), add a spread of the same shape guarded on `transcript !== undefined` that supplies `transcript` and `openTranscript`, the latter calling `client.send({ method: 'openTranscriptFileFor', params: { label } })` — the same send-and-forget the `openRecordingFor`, `openDiffFor` and `openFileNavigatorFor` capabilities use. Reuse the existing "supplied together or not at all" comment by widening it to cover both pairs rather than duplicating it.
- Append `viewCaptureIcon` to the icon re-export at line 94. The shell plugin must import it from `'../api'`, never from `'../../shared/icons'` — `ai/guidelines/plugins-tabs.md:74,122` forbids a concrete client plugin from importing host UI internals, and ESLint enforces it.
- No extraction is needed at ~186 counted lines. If the count lands above 195, move the together-or-not-at-all file-opener spreads into a helper in a new sibling module `web/src/plugins/tab-file-openers.ts` rather than compacting.

### `web/src/plugins/PluginBody.tsx` (182 counted lines today; about 183 after)

- Directly after `const recording = plugin.recording;` (line 184), add `const transcript = plugin.transcript;` and widen the preceding comment to say both paths are read off the envelope.
- Pass `transcript` to `createPluginClientCapabilities` between `recording` and `remoteCapabilities` (line 198), and add `transcript` to the `useMemo` dependency list beside `recording` (line 201). It is a string, so a re-broadcast with the same path does not rebuild the capabilities.
- `DockedPluginBody` renders through `PluginBody`, so this one change covers the docked shell; no change in `DockedPluginBody.tsx`.

### `web/src/plugins/shell/ShellTabMeta.tsx` (114 counted lines today)

- Import `viewCaptureIcon` from `'../api'` alongside the other icons.
- In `.tab-meta-actions`, insert the button **after the diff button block** (`{payload.workspace && (<button … className="tab-open-diff" …>)}`, the `plusMinusIcon` button at lines 79-90) and **before** the JSX comment and the connections `StatusWindowButton` (line 91-100). This matches `HarnessTabMeta`'s order: files, launch, diff, transcript, connections, schedule. Note: `plusMinusIcon` is the diff button, not the split control — the shell's split control is `{capabilities.splitAction}` near the end of the row (line 108) and stays where it is.
- Render it only when `capabilities.openTranscript` is defined, with the harness button's attributes: `type="button"`, `className="tab-open-transcript"`, `title="Open transcript"`, `aria-label="Open transcript"`, `viewCaptureIcon`, and `onClick` calling `capabilities.openTranscript`.
- In the component comment (lines 17-23), keep the first paragraph's "same structure and the same class names" explanation and replace the sentence "The control it omits is **Open transcript**, which would open nothing — the terminal replaced the transcript, so there is no longer one to open." with one saying the **Open transcript** button is drawn only once the host supplies `openTranscript`, i.e. once the shell's text transcript file exists.

## Tests

- `web/src/plugins/api.test.ts` — in the `createPluginClientCapabilities` describe, two cases built by passing `undefined` for the positional arguments between `onClose` and `transcript` (`splitAction`, `onDirtyHandle`, `claimedChords`, `dotColor`, `recording`):
  - given a transcript path, `capabilities.transcript` equals it and `openTranscript()` sends `{ method: 'openTranscriptFileFor', params: { label: 'shell-1' } }`;
  - given none, both `transcript` and `openTranscript` are `undefined`.
- `web/src/plugins/shell/ShellTabMeta.test.tsx` (exists; add a `describe('ShellTabMeta transcript button')` using its `capabilities(overrides)` helper):
  - with `openTranscript: vi.fn()` the button found by role name `Open transcript` has title `Open transcript` and class `tab-open-transcript`, and clicking it calls `openTranscript` once;
  - without `openTranscript` no such button is rendered;
  - with a workspaced payload (`{ ...payload, workspace: true }`) and `openTranscript` supplied, the button's `previousElementSibling` has class `tab-open-diff` and its `nextElementSibling` has class `tab-connections` (use `toHaveClass`; `StatusWindowButton` appends `status-window-button-empty` when it has no rows).
- `web/src/plugins/DockedPluginBody.test.tsx` — extend `registerCountingPlugin`'s capability type and rendered `data-` attributes with `transcript` / `openTranscript` (as `data-transcript` and `data-can-open-transcript`, mirroring lines 44 and 53-54), and add the docked case mirroring `'hands a docked plugin the recording its envelope carries'` (`:193`): setting `tab.plugin!.transcript` reaches the docked body with `data-can-open-transcript="true"`; extend the existing "neither" case at `:207` to assert the transcript attributes are empty/`false` too. This is the regression guard for "docked shells included".
- `web/src/plugins/shell/ShellTab.test.tsx:723` — the test `'renders no transcript control, because the terminal replaced the transcript'` becomes false in its rationale. Rename it to say no transcript control is drawn while the host has supplied no transcript; keep its assertion (the `makeCapabilities` fixture at `:115-174` supplies no `openTranscript`, so it still passes). Do not add a `transcript` override to that fixture; the positive case lives in `ShellTabMeta.test.tsx`.
- `web/src/plugins/PluginBody.test.tsx` — no change; the docked test above exercises `PluginBody`'s envelope read end to end.

## Verification

- `./scripts/run.mjs check-diff` (web tests run, since `web/src/` changes); confirm `max-lines` is clean on `api.ts` and `PluginBody.tsx`.
- Manual: launch the app, open a shell tab, confirm the clipboard **Open transcript** button appears on its metadata row (after the diff button on a workspaced shell, before the connections button), hover shows `Open transcript`, and pressing it opens an editor tab `transcript <label>` with the session text. Dock the shell to a sidebar and confirm the button still opens it. The full end-to-end pass, including the `recordShellTabs: false` opt-out, is subplan 08.

## Out of scope

- Specs, user documentation, and the full end-to-end verification — subplan 08.
- Any server or protocol change — subplans 01–06.
- Any change to the harness tab's own button (already uses `openTranscriptFileFor` after subplan 02).
- Converting `createPluginClientCapabilities` to an options-object signature.
