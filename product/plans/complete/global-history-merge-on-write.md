# Merge the global command history with the file on disk before each write

**Complexity: 3/10** — one module (`src/global-history.ts`) and its test file, plus the persistence paragraph of the history spec. No new architecture, no wire or caller changes: `initGlobalHistory`, `recordGlobalHistory`, and `globalCommands` keep their signatures.

The global history file (`~/.janissary/history.json`) is shared by every janus process, but each process loads it once at startup and then rewrites it wholesale from its own in-memory snapshot on every recorded command. Two instances running at once therefore erase each other's entries on every write. A file that fails to load (bad JSON, not an array, unreadable) is treated as empty, so the next command replaces it with a single entry — contradicting the spec's promise that a failed update leaves the previous valid history intact.

## Goal

- Every write starts from what is on disk at that moment, not from the startup snapshot, so concurrent instances keep each other's commands (short of two writes racing within the same few milliseconds).
- The in-memory buffer is refreshed from each successful write, so ghost text sees commands other instances recorded.
- A history file that exists but could not be loaded — at startup or at a later re-read — is never overwritten for the rest of the process. Commands are still recorded in memory, and the existing one-shot stderr warning still fires.
- A file that simply does not exist is still created, as today.

## Approach

In `src/global-history.ts`:

1. Extract a `readHistoryFile()` helper returning a discriminated result: `{ kind: 'missing' }` when the file is absent (`ENOENT`), `{ kind: 'ok', entries }` when it parses to an array (filtered through `isHistoryEntry`), and `{ kind: 'error', message }` for anything else (parse error, non-array, `EISDIR`, permission error).
2. Add a module flag `writesSuppressed`, reset by `initGlobalHistory`. `initGlobalHistory` uses `readHistoryFile`: `missing` creates the file as today; `ok` loads the entries; `error` sets `entries = []`, sets `writesSuppressed`, and reports the existing `could not read history.json (...)` warning.
3. Extract a pure `appendEntry(list, entry)` that returns `list` unchanged when its last command equals the new command, and otherwise appends and caps at `MAX_ENTRIES`.
4. `recordGlobalHistory`:
   - When writes are suppressed, apply `appendEntry` to the in-memory buffer and return.
   - Otherwise re-read the file. On `error`, suppress writes, report the failure, and record in memory only. On `missing`, the base is empty; on `ok`, the base is the on-disk entries.
   - Compute `next = appendEntry(base, entry)`, write it with `atomicWriteFile`. On success, `entries = next`. On a write failure, keep the previous behavior of growing the in-memory buffer (`entries = appendEntry(entries, entry)`) so commands typed while the disk is failing still ghost-complete.
5. `writeEntries` takes the list to write rather than reading the module variable.

## Implementation steps

1. Restructure `src/global-history.ts` per the approach.
2. Add the new test cases to `src/global-history.test.ts`.
3. Update the "Global history" section of `product/specs/history.md`.
4. Run `./scripts/run.mjs check-diff`.

## Tests

In `src/global-history.test.ts` (existing cases stay as they are):

- A corrupt `history.json` is left byte-for-byte unchanged after `recordGlobalHistory`, while `globalCommands()` still returns the recorded command.
- An entry written to the file behind the module's back (simulating another instance) survives the next `recordGlobalHistory`, and appears in `globalCommands()` alongside the new command.
- A file that becomes unreadable after a successful start (overwritten with invalid JSON by another process) is not overwritten by the next record.
- A consecutive duplicate is judged against the last on-disk command: when another instance's entry is last on disk, re-recording this process's previous command appends it again.

## Spec

`product/specs/history.md`, "Global history": describe that each update merges with the current file contents so concurrent instances keep each other's commands, and that a history file which exists but cannot be read is never overwritten for the rest of the run (commands are still available in memory).

## Out of scope

- File locking to close the remaining window between one process's re-read and its rename.
- Per-tab history persistence in `.janissary/state/`.
- Any change to how ghost text, the `hist` picker, or ArrowUp recall consume the buffer.
