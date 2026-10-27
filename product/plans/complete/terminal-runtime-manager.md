# Give terminal runtimes their own manager

**Complexity: 6/10** — a bounded manager extraction across harness, SSH, shell, and controller wiring, with lifecycle ordering and recorder tests to preserve. It changes no wire contract or recording behavior.

## Goal

Move ownership of per-PTY terminal observers and their registry out of `HarnessManager`, which also serves shell and SSH tabs. Keep harness-specific screen and transcript lookups on `HarnessManager`, while a terminal runtime manager owns registration, live-recording state, terminal colors, and release.

## Approach

Add `TerminalRuntimeManager` in `src/terminal-runtime/manager.ts`. It owns the existing runtime registry and provides `install`, `get`, `closeTab`, `dispose`, SSH and shell observer registration, `liveRecordingPathOf`, and `reportTerminalColors`. Harness spawn installs its runtime through this manager. `HarnessManager` retains `latestScreenText`, `transcriptTailer`, and `recordingPathOf`, but no longer owns the registry or accepts shell/SSH observer registration.

Register the new manager immediately before constructing `HarnessManager`, so its PTY-exit subscription is established before any recorder subscribes. Add it to shutdown disposal before `shellTranscript`, `shell`, and `pty`; add its tab release after `pty`, preserving the current close sequence. Keep the registry's microtask-deferred release so recorders can write the PTY exit event before disposal.

Route shell and SSH registration, live-recording lookup, and terminal-color reporting through `terminalRuntime`. Update the registry and runtime comments to describe terminal-runtime ownership across harness, SSH, and shell tabs, while noting that only harness and SSH runtimes have screen readers. The existing recording and screen-capture behavior remains unchanged.

## Implementation steps

1. Add `TerminalRuntimeManager`, register it in `Managers` and construct it before `HarnessManager`.
2. Move runtime installation and release responsibility to the new manager, leaving harness-only lookups and idle-escalation cleanup on `HarnessManager`; correct stale ownership comments in the runtime, recorder, screen-reader, tab-spawn, registry, and runtime-access modules.
3. Repoint shell, SSH, plugin live-recording, and controller color-reporting callers to `terminalRuntime`.
4. Update manager and caller test fixtures and assertions. Preserve PTY exit ordering, tab-close cleanup, and shutdown cleanup coverage.
5. Clarify in `product/specs/harness-recording.md` that harness, SSH, and shell recordings share the same close/exit/shutdown lifecycle.

## Tests

- `src/terminal-runtime/manager.test.ts`: shell live-recording lookup, terminal color forwarding, and release after PTY exit dispatch.
- `src/harness/runtime-registry.test.ts`: retain the test that defers release until after PTY exit dispatch and covers replacement runtimes.
- Keep harness, shell, and SSH observer-registration assertions in `src/harness/manager.test.ts` against the new manager; update `src/ssh-manager.test.ts`, `src/tab/manager.test.ts`, `src/plugins/live-recordings.test.ts`, `src/plugins/asciicast/activate.test.ts`, and `src/managers.test.ts` to assert the new ownership and manager order.
- Run the diff-scoped server checks for all touched server modules and tests.

## Documentation

No public help or user-documentation change is needed: this is an ownership refactor, and existing user documentation already describes recording behavior across all three tab kinds.

## Out of scope

- Changing recording formats, capture content, recording policy, or any observable tab behavior.
- Changing the wire protocol or plugin API.
- Moving harness-specific screen and transcript lookups out of `HarnessManager`.
