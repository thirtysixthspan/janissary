# Shell tab text transcript 06: pushed `transcript` path and the shell branch of `openTranscriptFileFor`

**Complexity: 3/10** — a new optional wire field copied from the tab record onto `PluginTabView`, and a one-expression widening of an existing controller function, each with a test; small, but it crosses the protocol boundary.

## Goal

Push a shell tab's transcript path to the client on its plugin envelope, and let the renamed RPC open it, so subplan 07 can draw a working button.

Source plan: implementation-order step 7 (the `Tab.transcript` field itself landed in subplan 05).

## Design decisions carried from the source plan

- **Decision 16** (widening half) — `openTranscriptFileFor(managers, label)` resolves `managers.harness.transcriptTailer(label)?.transcriptFile() ?? managers.tab.byLabel(label)?.transcript`, opening whichever it finds in an editor tab named `transcript <label>`, silently no-opping otherwise. The path has one source, the tab record.
- **Decision 17** (wire half) — `buildTabView` copies `tab.transcript` onto `PluginTabView.transcript`; under `recordShellTabs: false` the field is never set, so it is never sent.
- **Decision 8** (server half) — pressing the button opens the file as it stands in an editor tab named `transcript <label>`.

## Dependencies

- Subplan 02 — the RPC is already named `openTranscriptFileFor`.
- Subplan 05 — `Tab.transcript` exists and is set by the manager.

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| `PluginTabView.recording` and its comment | `src/protocol/plugin.ts:14-17` | Precedent for `transcript` |
| `buildTabView`'s `recording` read and plugin-envelope spread | `src/tab/view.ts:86-89`, `:145` | Copy `transcript` the same way |
| `openTranscriptFileFor` (renamed in subplan 02) | `src/controller/transcript.ts` | Widen the resolution |
| `managers.tab.byLabel(label)` | `src/tab/manager.ts` | Shell-tab lookup |
| `managers.openFile.edit(name, file, label)` | `src/controller/transcript.ts` | Opening the editor tab |

## Proposed changes

- `src/protocol/plugin.ts` — `transcript?: string` on `PluginTabView`, commented like `recording`: this tab's text transcript, mirrored from the server's record of it, present only for a recorded terminal and only once the transcript file has opened.
- `src/tab/view.ts` — `buildTabView` reads `tab.transcript` beside `tab.recording` and spreads `...(transcript !== undefined && { transcript })` into the plugin envelope beside `recording`, with a short comment explaining it is read from the tab rather than the writer (released on exit). Keep under the 200-line limit (150 counted lines today).
- `src/controller/transcript.ts` — `openTranscriptFileFor` resolves the harness tailer file first and `managers.tab.byLabel(label)?.transcript` second; comment updated to describe both sources and the silent no-op.

## Tests

- `src/controller/transcript.test.ts` — `openTranscriptFileFor` opens a harness tab's tailer file, opens a shell tab's `tab.transcript` in `transcript <label>`, and no-ops for a label with neither (keep the existing harness and no-op cases, add the shell case).
- `src/tab/view.test.ts` — beside the existing recording cases (around `:566-590`): a plugin tab with `tab.transcript` set carries `plugin.transcript`; one without it omits the key (`'transcript' in plugin` is false). This test is supplementary to the source plan's list, guarding decision 17's "never set, never sent".

## Verification

- `./scripts/run.mjs check-diff`.
- No manual UI check yet (no button until subplan 07); the controller test covers the open path.

## Out of scope

- Client capabilities, `PluginBody`, the icon re-export and the `ShellTabMeta` button — subplan 07.
- Specs and docs — subplan 08.
