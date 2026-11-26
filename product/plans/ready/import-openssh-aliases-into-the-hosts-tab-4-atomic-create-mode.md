# Give atomic writes an optional create mode
**Complexity: 3/10** — 8 production lines across 2 files, 4 requirements, 6 test scenarios (p=4.38)

## Goal

Let an atomic replacement choose the mode of a file it creates, without changing the mode of a file that already exists. It is the fourth piece of `import-openssh-aliases-into-the-hosts-tab.md`. `import-openssh-aliases-into-the-hosts-tab-6-ssh-config-file-access.md` passes `0600` through it when creating an ssh config; this change only adds the capability.

## Requirements

1. `atomicWriteFile` accepts an optional create mode (source plan Requirement 35: "Create it"; Implementation step 3).
2. The create mode is applied only when the target file does not already exist (source plan Requirement 35: "Create it"; Implementation step 3, "applied only when the target does not exist").
3. `replaceFileAtomically` accepts an optional third argument and forwards it to `atomicWriteFile` (source plan Implementation step 3, "Pass it through an optional third parameter").
4. Every existing caller of `atomicWriteFile` and `replaceFileAtomically` keeps its current argument count, so no call site needs an edit and no caller is left mismatched (source plan Implementation step 3, "Every existing caller passes nothing and is unchanged").

## Design decisions

Depends on nothing earlier. `import-openssh-aliases-into-the-hosts-tab-6-ssh-config-file-access.md` calls the new parameter, so it lands after this one.

- The change stays in two existing production modules. `src/atomic-write.ts:8` `atomicWriteFile` already computes an existing file's mode and sets the temporary file's mode from it; the optional create mode is the fallback used only when that lookup finds no file. The temp-file-and-rename sequence, its error cleanup, and its existing-mode behavior do not change.
- The parameter is named `createMode` in both helpers so subplan 6 can name the same argument when it passes `0600`. When an existing file supplies a mode that mode always wins; when no file exists and no `createMode` is passed, no `mode` option is set and the write keeps today's default permissions.
- `src/plugins/files.ts:92` `replaceFileAtomically` is the one host module a concrete plugin may reach for file replacement, so the new parameter is exposed there rather than by a new module or a re-export.
- Both parameters are optional, so existing call sites need no edits and the payload schema and plugin contract stay untouched.
- No new module and no new state: this is a parameter addition on a helper that already owns the write.

## Preserved behavior

1. An atomic replace keeps an existing file's mode, and a create mode must not change the mode of a file that already exists. It must not chmod, reopen, or otherwise touch the mode of an existing target on the way to replacing it. Pinned by `src/atomic-write.test.ts:35` `it('preserves an existing file mode', ...)`.

## Assumptions

1. The host's atomic write is temp-file-and-rename and keeps only an existing file's mode: `src/atomic-write.ts:8` `export function atomicWriteFile(` and `src/atomic-write.ts:4` `function existingMode(`.
2. Plugins replace files atomically through the allowlisted host module: `src/plugins/files.ts:92` `export function replaceFileAtomically(` and the boundary allowlist at `eslint.plugin-boundaries.mjs:36` `api\.js|files\.js`.

## Existing functionality

1. Atomic temp-file-and-rename writing with existing-mode preservation: `src/atomic-write.ts:8` `export function atomicWriteFile(`.
2. The plugin-facing pass-through used by every file-backed plugin: `src/plugins/files.ts:92` `export function replaceFileAtomically(`.
3. The existing-mode test that pins preserved behavior 1: `src/atomic-write.test.ts:35` `it('preserves an existing file mode', ...)`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`. This subplan changes three files, all named below; every consumer already calls the two functions with the old arity (for example `src/global-history.ts:29` and `src/plugins/image/edit.ts:7`), so no call site is left mismatched and no later work is needed to compile. All three files are far below the 200-line `max-lines` limit (20, 125 and 69 lines), so no extraction or new import is needed.

1. In `src/atomic-write.ts`, add an optional `createMode` parameter to `atomicWriteFile`, defaulting to undefined. Keep the existing `existingMode` lookup as the first choice for the temporary file's mode and use `createMode` only when no existing file supplied one; when neither supplies a mode, set no `mode` option so the write keeps today's default permissions. Leave the rename and cleanup path as it is. Build with `$janissary/scripts/run.mjs check-diff`.
2. In `src/plugins/files.ts`, add an optional third `createMode` parameter to `replaceFileAtomically` and pass it through as `atomicWriteFile`'s third argument. Leave `writeJsonConfigFile` (`src/plugins/files.ts:88`) and every other caller unchanged. Build with `$janissary/scripts/run.mjs check-diff`.
3. In `src/atomic-write.test.ts`, add one case beside the existing ones: a new file written with an explicit create mode gets that mode, and a second write to the same path with a different create mode keeps the first mode. Leave the `preserves an existing file mode` case untouched. Build with `$janissary/scripts/run.mjs check-diff` and confirm the whole server test project passes, since every other consumer of these helpers still compiles and runs.

## UI design

1. No user interface surface changes. The parameter is internal to the server's file helpers.

## Tests

In `src/atomic-write.test.ts`:

- A new target written through `atomicWriteFile` with an explicit create mode ends with exactly that mode (Requirement 1).
- A second write to the same path with a different create mode leaves the original mode in place (Requirements 2 and 4, and preserved behavior 1).
- The existing `preserves an existing file mode`, binary-data, directory-target, and failed-rename cases keep passing unchanged (Requirement 4 and preserved behavior 1).
- Verify by reading the diff of `src/plugins/files.ts` that `replaceFileAtomically` forwards the argument and that no other caller was edited (Requirement 3).

## Out of scope

- No symlink resolution, no parent directory creation, and no specific mode value chosen here.
- No ssh config reader, section splice, path resolution, import or export operation, command, intent, or button.
- No change to `writeJsonConfigFile`, the hosts catalog writer, or the plugin payload and its schema version.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck of both projects, and the changed-file server tests must pass with only these three files changed.

Then run `npx vitest run --project server src/atomic-write.test.ts` and read its new case. Confirm a fresh temporary file reports `0o600` from `statSync(...).mode & 0o777` when created with that mode (the value subplan 6 will pass), and a file first created `0o600` then rewritten with a different mode still reports `0o600`. A failure looks like the second mode winning, or an existing file being chmodded.
