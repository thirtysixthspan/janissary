# Shell tab text transcript 05: `ShellTranscriptManager`, registration, and install

**Complexity: 4/10** — a new manager holding one writer per PTY with install / close-tab / exit-release / dispose paths, a new `Managers` member that the compile-time completeness checks force into three lists at once, a new optional field on the `Tab` record, and a one-line install in `TabManager.recordTerminal`; several call sites and hand-built fixtures, but every piece has a direct precedent.

## Goal

Install a `ShellTranscriptWriter` on exactly the terminals a shell recording is installed on, own those writers' lifecycles, report a failure once per tab in the notifications feed, and remember the opened file on the tab record as `tab.transcript`. After this subplan every recorded shell tab writes a transcript file; the client cannot open it yet.

Source plan: implementation-order step 6, plus the `Tab.transcript` field from step 7 (the manager's `onOpened` writes it, so it lands here; the view and RPC halves of step 7 are subplan 06).

## Design decisions carried from the source plan

- **Decision 9** (install gate) — installed on exactly the terminals a shell recording is installed on, behind the same `recordsTerminal` and `recordShellTabs` conjuncts in `TabManager.recordTerminal`; `recordShellTabs: false` installs nothing, so no file is written.
- **Decision 10** (wiring half) — the writer's `onFailure` fires `notify(managers, 'shell-transcript-failed', label)`, once per tab; the recording is independent, so either can fail without stopping the other.
- **Decision 12** — remote shells and remote siblings get a transcript on the same terms, because `recordTerminal` installs on the recorded PTY id `spawnRemotePluginTerminal` is handed; no special case.
- **Decision 14** — a separate `shellTranscript` manager in `src/shell/transcript/`, not a `HarnessRuntime` member: `install(ptyId, label)`, `closeTab(label)` (listed in `MANAGER_TAB_RELEASE`), release on the PTY's `exit`, dispose all at shutdown; key `shellTranscript` because `managers.shell` is the unrelated `ShellManager`.
- **Decision 17** (server-record half) — the writer's `onOpened(path)` sets `tab.transcript` on the tab with that label if it still exists.
- **Decision 11** (lifecycle half) — closing the tab disposes the writer, which flushes the unfinished row (subplan 04's finishing path).

## Dependencies

- Subplan 03 — the `shell-transcript-failed` notification kind.
- Subplan 04 — `ShellTranscriptWriter`.

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| `TabManager.recordTerminal` | `src/tab/manager.ts:229` | Add the install call under the same condition (file is 184 non-blank, non-comment lines; one line fits — measure before editing, extract if it would overflow) |
| `registerShellObservers` / `shellRuntime` / `rememberRecording` | `src/harness/manager.ts:100`, `src/harness/observers.ts:23`, `:94` | Lifecycle and `onOpened`-sets-tab-field model; **not** extended (decision 14) |
| `HarnessRuntimes` install/release-on-exit pattern | `src/harness/runtime-registry.ts` | Model for per-PTY map and `pty` `exit` release |
| `managers.pty.spawnDimensions()` | `src/pseudoterminal-manager.ts:143` | Writer's initial size |
| `notify(managers, kind, label)` | `src/notifications/index.ts` | Failure notification |
| `ManagerRegistry`, `MANAGER_DISPOSE_ORDER`, `MANAGER_TAB_RELEASE` and their `_IS_COMPLETE` / `_IS_TYPED` checks | `src/managers.ts` | Register the new member |
| Manager construction | `src/controller/create-managers.ts:70` (`managers.harness = new HarnessManager(managers)`) | Construct beside it |
| `Tab.recording` field and its comment | `src/tab/types.ts:325-330` | Precedent for `Tab.transcript` |

## Proposed changes

- New `src/shell/transcript/manager.ts` — `ShellTranscriptManager(managers)`:
  - `install(ptyId, label)` builds a `ShellTranscriptWriter` with `managers.pty.spawnDimensions()`, an `onFailure` that calls `notify(managers, 'shell-transcript-failed', label)`, and an `onOpened` that sets `transcript` on the tab with that label if it still exists (as `rememberRecording` does for `recording`). Keyed by PTY id, with the label remembered for `closeTab`.
  - `closeTab(label)` disposes that label's writer(s) and drops them.
  - A `pty` bus `exit` for a held id drops the writer from the map (the writer's own `exit` handling already runs its finishing path).
  - `dispose()` disposes every writer and unsubscribes the manager's own bus subscription.
  - The manager deliberately exposes no path lookup; the tab record is the single source (decision 16, consumed in subplan 06).
- `src/tab/types.ts` — optional `transcript?: string` on the `Tab` record, commented like `recording`: set once by the writer that opened it, remembered on the tab because the writer is released when the PTY exits while the tab and file outlive it.
- `src/managers.ts` — `shellTranscript: ShellTranscriptManager` in `ManagerRegistry`; `'shellTranscript'` in `MANAGER_DISPOSE_ORDER` directly after `'harness'` and before `'pty'` (group 1: it owns open file handles and must flush while the PTY manager is still up; extend the group's comment), and in `MANAGER_TAB_RELEASE`. The compile-time completeness checks fail until all three are present, which is the intended guard.
- `src/controller/create-managers.ts` — construct `managers.shellTranscript = new ShellTranscriptManager(managers)` beside `managers.harness`.
- `src/tab/manager.ts` — `recordTerminal` calls `this.managers.shellTranscript.install(ptyId, label)` beside `registerShellObservers`, under the same `declares && getConfig().recordShellTabs` condition. Update its comment to say the transcript follows the recording's gate.
- Test fixtures that build a full `Managers` object by hand will need the new member; let the typecheck name them rather than hunting in advance.

## Tests

- New `src/shell/transcript/manager.test.ts` — `install` sets `tab.transcript` once the file opens; `closeTab` releases (disposes) the writer; a `pty` `exit` releases the writer; a failure notifies `shell-transcript-failed` exactly once; `dispose()` disposes all writers.
- `src/tab/manager.test.ts` — `recordTerminal` installs the transcript beside the recorder for a `recordsTerminal` plugin, and installs neither under `recordShellTabs: false` (nor for a plugin that does not declare `recordsTerminal`).
- `src/managers.test.ts` — stays green; its "lists every registered manager exactly once" case proves the dispose-order registration. Add an assertion that `shellTranscript` precedes `pty` in the dispose order, in the style of the existing ordering cases.
- Hand-built `Managers` fixtures updated as the typecheck names them.

## Verification

- `./scripts/run.mjs check-diff`.
- Manual integration check (server-side only; no button yet): launch the app, run `echo hello` in a shell tab, and confirm a `<label>-<timestamp>.txt` file appears under `.janissary/shell-transcripts/` containing the prompt, `echo hello` and `hello` with no escape sequences; close the tab and confirm the trailing prompt row was flushed.

## Out of scope

- `PluginTabView.transcript`, `buildTabView`, and the shell branch of `openTranscriptFileFor` — subplan 06.
- The client capability and the **Open transcript** button — subplan 07.
- Spec and documentation text — subplan 08.
