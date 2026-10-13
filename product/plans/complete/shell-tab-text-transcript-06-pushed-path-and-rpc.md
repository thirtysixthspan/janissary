# Shell tab text transcript 06: pushed `transcript` path and the shell branch of `openTranscriptFileFor`

**Complexity: 3/10** — a new optional wire field copied from the tab record onto `PluginTabView`, and a one-expression widening of an existing controller function, each with a test; small, but it crosses the protocol boundary and its delivery relies on the existing broadcast cadence rather than a push of its own.

## Goal

Push a shell tab's transcript path to the client on its plugin envelope, and let the renamed RPC open it, so subplan 07 can draw a working button.

Source plan: implementation-order step 7 (the `Tab.transcript` field itself landed in subplan 05).

## Design decisions carried from the source plan

- **Decision 16** (widening half) — `openTranscriptFileFor(managers, label)` resolves `managers.harness.transcriptTailer(label)?.transcriptFile() ?? managers.tab.byLabel(label)?.transcript`, opening whichever it finds in an editor tab named `transcript <label>`, silently no-opping otherwise. The path has one source, the tab record; `ShellTranscriptManager` exposes no lookup of its own and none is added.
- **Decision 17** (wire half) — `buildTabView` copies `tab.transcript` onto `PluginTabView.transcript`; under `recordShellTabs: false` the field is never set, so it is never sent.
- **Decision 8** (server half) — pressing the button opens the file as it stands in an editor tab named `transcript <label>`.

## Decisions made in this subplan

- **The manager broadcasts once when the path is set, rather than waiting for the next `state: dirty` as `recording` does.** Without it, the field would ride the next broadcast: `ShellTranscriptManager.install`'s `onOpened` callback (`src/shell/transcript/manager.ts`, `if (tab) tab.transcript = path;`) assigns the field and emits nothing, the same as `rememberRecording` in `src/harness/observers.ts` (`if (tab) tab.recording = path;`). Neither is a bug to fix here: the file opens on the shell's first output, and that same output carries zsh's first prompt, whose cwd hook makes the client send the shell plugin's `cwd` intent (`web/src/plugins/shell/report-shell-cwd.ts`); its handler calls `capabilities.updateTab` (`src/plugins/shell/activate.ts`, the `cwd` intent), which reaches `updatePluginTab` in `src/tab/openers.ts` and emits `messageBus.emit('state', { type: 'dirty' })`, broadcasting a view that already carries the path (the bus delivers the PTY `data` event to the writer synchronously, before any client can reply to it). That incidental path is not relied on. (Orchestrator decision, superseding the improve pass's "no push of its own".) Decision 17 promises the button "appears as the shell starts", and a cwd report is a side effect of the shell plugin's client, not a contract of the transcript, so `ShellTranscriptManager.install`'s `onOpened` emits `messageBus.emit('state', { type: 'dirty' })` immediately after assigning `tab.transcript`, and only when the tab was found — the same one-line broadcast `updatePluginTab` in `src/tab/openers.ts` uses. It fires once per opened file (the writer's `onOpened` fires once), so it adds at most one extra broadcast per shell. `rememberRecording` keeps its current behavior; `recording` is not changed here. No other change to `src/shell/transcript/`.
- **Plugin envelope only.** `transcript` is spread into the `plugin` object only. It is not mirrored onto `tab.harness` the way `recording` is (`src/tab/view.ts`, `harness: tab.harness && (recording === undefined ? …)`): `Tab.transcript` is only ever set for terminals `TabManager.recordTerminal` installs on (`src/tab/manager.ts`, `this.managers.shellTranscript.install(ptyId, label)`), which are plugin tabs, and a harness tab's transcript is the tailer's file.
- **Harness first, tab record second, falsy guard kept.** The widened function computes the `??` chain above and keeps the existing `if (!file) return;` guard, so an empty or absent path from either source is a silent no-op. A shell tab whose label is later reused by a new tab resolves to the new tab's record, which has no `transcript` until its own first output — that is the intended behavior, not a stale-path risk.
- **No wire schema or validator changes.** Nothing enumerates `PluginTabView` fields: the type is consumed by `TabView.plugin` (`src/protocol/tab.ts`, `plugin?: PluginTabView;`) and on the client through `@shared/protocol` (`web/src/shared/tab/view-guards.ts`). `src/client-params/core.ts` validates RPC params, which are unchanged (`{ label }`). The optional field is additive for the client; subplan 07 is the first reader.

## Dependencies

- Subplan 02 — the RPC is already named `openTranscriptFileFor` (`src/controller/transcript.ts`, `src/controller.ts` `openTranscriptFileFor(label: string): void`).
- Subplan 05 — `Tab.transcript` exists (`src/tab/types.ts`, `transcript?: string;` on the tab record) and is set by `ShellTranscriptManager`.

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| `PluginTabView.recording` and its comment | `src/protocol/plugin.ts` (`recording?: string;`, the last field of `PluginTabView`) | Precedent for `transcript`, declared right after it |
| `buildTabView`'s `recording` read and plugin-envelope spread | `src/tab/view.ts` (`const recording = tab.recording;` with its comment; `...(recording !== undefined && { recording }),` inside `plugin: tab.plugin ? { … }`) | Copy `transcript` the same way |
| `openTranscriptFileFor` (renamed in subplan 02) | `src/controller/transcript.ts` | Widen the resolution |
| `managers.tab.byLabel(label)` | `src/tab/manager.ts` (`byLabel(label: string): Tab \| undefined`) | Shell-tab lookup; already used in the same file by `openAcpTranscript` |
| `managers.openFile.edit(name, file, label)` | `src/controller/transcript.ts` | Opening the editor tab, unchanged |
| The recording view tests and the plugin-tab fixture | `src/tab/view.test.ts` (`it('mirrors it onto a plugin tab\'s envelope too, …')`; `describe('plugin declaration fields')`'s `pluginTab()`) | Shape of the new view tests |

## Proposed changes

Land all three files in one change: `view.ts` spreads `transcript` into an object literal typed `PluginTabView`, so it does not typecheck before the protocol field exists.

- `src/protocol/plugin.ts` — `transcript?: string` on `PluginTabView`, directly after `recording`, commented like it: this tab's plain-text transcript, mirrored from the server's record of it; present only for a plugin whose declaration asked for `recordsTerminal` while `recordShellTabs` is on, and only once the transcript file has opened on the terminal's first output. 18 counted lines today; stays far under 200.
- `src/tab/view.ts` — in `buildTabView`, read `const transcript = tab.transcript;` beside `const recording = tab.recording;`, with a short comment saying it is read from the tab rather than the writer, which is released when the PTY exits while the tab and file outlive it. Spread `...(transcript !== undefined && { transcript })` into the `plugin` envelope on the line after the `recording` spread. Nothing else in the view changes. 150 counted lines today, about 152 after; no extraction needed.
- `src/controller/transcript.ts` — `openTranscriptFileFor` resolves the harness tailer's file first and `managers.tab.byLabel(label)?.transcript` second, guard and `managers.openFile.edit(\`transcript ${label}\`, file, label)` unchanged. Rewrite the function's comment: it now serves both the harness tab's clipboard button (`HarnessTabMeta.tsx`) and the shell tab's (subplan 07); a harness tab's file comes from its tailer, a shell tab's from the path its transcript writer remembered on the tab; it silently no-ops when neither exists, because neither caller has a transcript to print an error into. Drop the old "a harness tab has no transcript of its own" wording, which is no longer accurate. 25 counted lines today.

- `src/shell/transcript/manager.ts` — in `install`'s `onOpened`, after `tab.transcript = path`, emit `state: dirty` when the tab exists (see "Decisions made in this subplan"). Import `messageBus` as the manager's other bus use already does. This is independent of the three files above and may land in the same change.

## Tests

- `src/controller/transcript.test.ts` — the existing `makeHarnessManagers` mock has no `tab` key, so after the widening every existing `openTranscriptFileFor` case that reaches the `??` fallback (both no-op cases) would throw on `managers.tab.byLabel`. Give the mock a `tab: { byLabel }` over an optional list of `{ label, transcript? }` records, defaulting to empty, as `makeAcpManagers` already does with its `tabs` list. Keep the three existing cases (tailer file opened; no tailer; tailer with no file yet) and add:
  - a shell tab: no tailer, `byLabel('shell')` returning `{ label: 'shell', transcript: '/project/.janissary/shell-transcripts/shell-now.txt' }` → `edit` called with `('transcript shell', '/project/.janissary/shell-transcripts/shell-now.txt', 'shell')`;
  - harness wins: a tailer file and a tab record with a different `transcript` → `edit` called with the tailer's file;
  - a shell tab whose transcript has not opened yet (tab record present, `transcript` unset) → `edit` not called.
- `src/tab/view.test.ts` — beside the recording cases (the `it('mirrors it onto a plugin tab\'s envelope too, …')` case), using the same plugin-tab setup (`tab.view = 'plugin'; tab.plugin = { id: 'shell', … }`):
  - a plugin tab with `tab.transcript` set carries `plugin.transcript` with that path;
  - a plugin tab without it omits the key (`'transcript' in plugin` is false). Use a real plugin tab here, not `makeTab` alone — the existing "sends no recording" case checks a non-plugin tab, where `plugin` is undefined and the assertion is vacuous;
  - a harness tab with `tab.transcript` set (use the file's `remoteTab` helper) leaves `harness` without a `transcript` key, pinning the plugin-envelope-only decision.
  This file is supplementary to the source plan's test list, guarding decision 17's "never set, never sent". Test files are exempt from `max-lines`.
- `src/shell/transcript/manager.test.ts` — extend the existing "`install` sets `tab.transcript` once the file opens" case (or add one beside it) to assert a single `state` `{ type: 'dirty' }` emit when the tab exists, and none when the tab with that label is gone by the time the file opens.
- No change is needed in `src/controller.test.ts` (`openTranscriptFileFor is a silent no-op for a harness with no session record` runs against real managers, where `byLabel('janus')` has no `transcript`) or `src/message/handler.test.ts` (mocks the controller façade); both must still pass.

## Verification

- `./scripts/run.mjs check-diff`.
- No manual UI check yet (no button until subplan 07); the controller test covers the open path, and subplan 08's end-to-end pass, which presses the button in a live shell, is where the path's real delivery to the client is first exercised.

## Out of scope

- Client capabilities, `PluginBody`, the icon re-export and the `ShellTabMeta` button — subplan 07.
- Specs and docs — subplan 08.
- Any change to `ShellTranscriptWriter` or `rememberRecording`, and any change to `ShellTranscriptManager` beyond the `state: dirty` emit in `onOpened` (see "Decisions made in this subplan").
