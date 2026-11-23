# Move ACP temporary directories into a `.janissary` subdirectory

**Complexity: 3/10** — ~8 added lines in one production file, 7 requirements and 9 test scenarios around a single path change (p=4.67).

## Goal

ACP sessions outside a workspace allocate a private scratch directory to hold the OpenCode OAuth data home. Those directories are currently named `acp-*` and created directly in the project's `.janissary/`, so they accumulate beside the project's other runtime files. The feature text is: "acp- directories are accumulating in `.janissary/`. move the location where these are maintained into a subdirectory `.janissary/`." The fix groups them under a dedicated `.janissary/acp/` subdirectory while keeping the same private, owner-only, symlink-refusing, disposable behavior.

## Requirements

1. "acp- directories are accumulating in `.janissary/`." No `acp-*` directory is created directly under the project's `.janissary/` by ACP credential provisioning.
2. "move the location where these are maintained into a subdirectory `.janissary/`." Each allocated scratch directory is created under a `.janissary/acp/` subdirectory, keeping its `acp-` name prefix.
3. The `.janissary/acp/` subdirectory is created on demand with owner-only (`0700`) permissions, and the scratch directory inside it keeps the same owner-only creation it has today.
4. A `.janissary/` path, or the new `.janissary/acp/` path, that is a symbolic link rather than a real directory is refused with the existing `Unsafe ACP runtime directory.` error before any scratch directory is allocated.
5. Disposal removes only the allocated scratch directory and leaves the `.janissary/acp/` subdirectory in place for later sessions.
6. Workspaced sessions still delegate credential provisioning to the workspace owner and allocate nothing in `.janissary/acp/`.
7. The OAuth seed, `XDG_DATA_HOME` override, and ambient-data-location fallback behave exactly as before at the new location.

## Design decisions

- Add one grouping level in `acpCredentials` in `src/acp/credentials.ts`: the runtime root becomes `path.join(cwd, '.janissary', 'acp')` and the scratch directory remains a `mkdtempSync` child with the `acp-` prefix. No caller changes, because callers consume the returned `tmpDir` and `env` only.
- Keep the existing safety check on `.janissary/` itself and apply the same check to the new subdirectory, in creation order, so a symlinked parent is still refused before a nested directory can be created through it. This extends the existing `lstatSync(runtime).isDirectory()` guard rather than replacing it.
- Use `mkdirSync(..., { recursive: true, mode: 0o700 })` for both levels, matching the current owner-only creation of `.janissary/`.
- Keep the `.janissary/acp/` subdirectory after `dispose`; removing only the per-session scratch directory matches the current disposal contract and avoids a race with a concurrently starting session.
- Do not add cleanup of scratch directories left by earlier runs; the issue asks only to relocate where new ones are maintained.

## Preserved behavior

1. A non-workspaced session still receives seeded owner-only OpenCode credentials at its scratch directory's `opencode-data` home, with the auth file at mode `0600` and its parent at `0700`, and disposal removes the scratch directory — pinned by `src/acp/credentials.test.ts` ("seeds owner-only OpenCode credentials and removes them on disposal").
2. A workspaced session still allocates no local credential directory and returns an empty environment — pinned by `src/acp/credentials.test.ts` ("leaves workspace credential provisioning to its owner").
3. With no saved login, the returned environment still carries no `XDG_DATA_HOME` while a scratch directory is still allocated — pinned by `src/acp/credentials.test.ts` ("preserves the ambient data location when there is no saved login"), updated for the new path.
4. A symlinked `.janissary/` is still refused with `Unsafe ACP runtime directory.` — pinned by `src/acp/credentials.test.ts` ("refuses symlinked runtime storage").
5. A non-workspaced ACP connection still passes a private `tmpDir` into the sandbox options — pinned by `src/acp/index.test.ts` ("uses launch tokens for an unworkspaced connection"), updated for the new path.

## Assumptions

1. `acpCredentials` is the only producer of these scratch directories: `src/acp/index.ts:40` calls `const credentials = acpCredentials(options.cwd, options.workspaceDir);`.
2. Callers use the returned path opaquely: `src/acp/index.ts:40` passes `credentials.tmpDir` on to the sandbox through `sandboxCalls.options`, and `src/acp/credentials.ts:13` passes the directory to `prepareOpencodeDataHome`.
3. The whole `.janissary/` tree is already gitignored (`.gitignore:6` — `.janissary/`), so a new subdirectory needs no ignore rule.
4. The sandbox accepts any real directory as `tmpDir`: `src/sandbox/harness-spawn.ts:156` resolves it with `resolvePath(options.tmpDir ?? ...)` and exports it as `TMPDIR`, so an extra path segment is transparent.
5. ACP config files such as `.janissary/roles.json` live directly in `.janissary/` (`product/specs/acp.md:31`), so the new `acp/` subdirectory cannot collide with them.

## Existing functionality

1. `acpCredentials` in `src/acp/credentials.ts` already allocates, guards, seeds, and disposes the private scratch directory the fix relocates.
2. `prepareOpencodeDataHome` in `src/sandbox/opencode-data.ts` already creates the owner-only `opencode-data` home and auth file inside any supplied scratch directory.
3. `lstatSync(...).isDirectory()` in `src/acp/credentials.ts` is the existing symlink guard reused for the new subdirectory.
4. The `credentials.tmpDir` field is already threaded into sandbox options by `src/acp/index.ts`, so no new plumbing is needed.

## Implementation steps

1. In `src/acp/credentials.ts`, derive the runtime path as `.janissary/acp` under `cwd`, create `.janissary/` and then `.janissary/acp/` in order with the existing owner-only recursive `mkdirSync`, apply the existing `lstatSync(...).isDirectory()` guard to each level in that same order, and allocate the scratch directory with `mkdtempSync` under the new runtime path keeping the `acp-` prefix. Leave the `dispose` function and the `prepareOpencodeDataHome` call unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Update the path expectation in `src/acp/credentials.test.ts` ("preserves the ambient data location when there is no saved login") to the new `.janissary/acp/acp-` location, and add a new case asserting no `acp-*` entry appears at the top level of `.janissary/`. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Update the `tmpDir` path expectation in `src/acp/index.test.ts` ("uses launch tokens for an unworkspaced connection") to the new `.janissary/acp/acp-` location. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Update `product/specs/acp.md` in the credential paragraph so it says the private scratch directory for a non-workspaced agent is allocated under `.janissary/acp/`, not directly in `.janissary/`. No `help/` page or `documentation/user-documentation/` page describes this internal location, so none changes. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user interface surface changes: the scratch directory is an internal filesystem location with no command, flag, key binding, CSS, or component attached to it.
2. A user inspecting the project sees one `.janissary/acp/` directory holding the `acp-*` scratch directories instead of those directories at the top level of `.janissary/`.

## Tests

1. In `src/acp/credentials.test.ts`, update "preserves the ambient data location when there is no saved login" to assert the scratch directory path contains `.janissary/acp/acp-` and that the `.janissary/acp/` directory exists (Requirement 2).
2. Add a case in `src/acp/credentials.test.ts` that provisions credentials, reads the entries of `.janissary/`, and asserts none starts with `acp-`; assert the `.janissary/acp/` directory itself is owner-only `0700` (Requirements 1, 3).
3. Add a case in `src/acp/credentials.test.ts` that replaces `.janissary/acp/` with a symlink to another directory and asserts `Unsafe ACP runtime directory.` is thrown before any scratch directory is allocated (Requirement 4).
4. Keep "refuses symlinked runtime storage" and "seeds owner-only OpenCode credentials and removes them on disposal" passing unchanged; extend the disposal assertion so the scratch directory is gone while `.janissary/acp/` remains (Requirements 4, 5).
5. Keep "leaves workspace credential provisioning to its owner" passing unchanged, and assert no `.janissary/acp/` directory is created when a workspace is supplied (Requirement 6).
6. Update the `tmpDir` assertion in `src/acp/index.test.ts` ("uses launch tokens for an unworkspaced connection") to the new location so the connection-level plumbing remains covered (Requirement 7).

## Out of scope

- No migration, deletion, or rehoming of `acp-*` directories left behind by earlier runs.
- No change to the OAuth token format, file modes, `XDG_DATA_HOME` value shape, or the ambient-data fallback.
- No change to workspace credential provisioning, which keeps its own scratch directory beside the clone.
- No new cleanup scheduler, retention policy, or log entry for scratch directories.
- No `help/` or user-documentation changes; the relocated directory is an internal runtime detail those pages do not describe.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. Manual check against the running app:

1. Start Janissary in a scratch project, open a tab with no workspace, and send an `ask` prompt to an `opencode` role so a non-workspaced ACP session starts. Inspect `<project>/.janissary/`: the `acp-*` scratch directory must appear inside `.janissary/acp/`, and no `acp-*` entry may appear at the top level of `.janissary/`. A failure looks like an `acp-*` directory directly under `.janissary/` or no private credential home under `.janissary/acp/`.
2. After the agent answers and the session is disposed, list `.janissary/acp/` again: the per-session `acp-*` directory must be gone while the `.janissary/acp/` directory remains and keeps mode `0700`.
