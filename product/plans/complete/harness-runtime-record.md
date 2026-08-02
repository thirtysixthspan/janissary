# Harness PTY runtime record

**Complexity: 6/10** — a localized lifecycle refactor across the harness manager and its existing observer tests, with one focused runtime owner and no wire or persistence changes.

## Goal

Replace `HarnessManager`'s independent PTY-keyed observer maps with one runtime record per PTY. The record owns the screen reader, recorder, optional transcript tailer, and auto-approver callback state so PTY exit and manager disposal use the same cleanup path when another harness resource is added later.

## Approach

Create a small `HarnessRuntime` owner that holds the observers associated with one PTY and disposes every disposable observer exactly once. `HarnessManager` will keep one `Map<string, HarnessRuntime>`, use the record for screen captures and transcript lookup, and remove the record after PTY exit. SSH's externally spawned PTY will use the same record with only a screen reader.

## Implementation steps

1. Add the `HarnessRuntime` owner and its idempotent disposal method.
2. Replace the four observer maps in `HarnessManager` with the runtime map and route launch, SSH registration, lookup, PTY-exit, and manager-disposal paths through it.
3. Add a manager lifecycle regression test proving one PTY exit disposes all resources owned by its runtime record.
4. Update the harness lifecycle spec to state that live observers end with the PTY and do not survive a closed harness tab.

## Tests

- Extend `src/harness/manager.test.ts` with one test covering reader, recorder, and transcript tailer disposal together on PTY exit.
- Run `./scripts/run.mjs check-diff` after each implementation step and after the spec update.

## Documentation

No `help.md` or `documentation/user-documentation/` page documents this internal lifecycle ownership, so neither needs an update.

## Out of scope

- Changing harness launch flags, screen capture timing, recording format, transcript extraction, or tab behavior.
- Changing any manager beyond `HarnessManager` or introducing persisted runtime state.
