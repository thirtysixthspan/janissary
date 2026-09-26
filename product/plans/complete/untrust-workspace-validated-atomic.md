# Untrust a workspace through the same validated, atomic path that trusts it

**Complexity: 3/10** — two source files (`src/workspace/index.ts`, `src/launch-name/leftover.ts`) and their tests. The helpers the fix needs (`readClaudeConfig`, `isRecord`, `writeJsonAtomically`) already exist beside `trustWorkspace`; the work is reusing them, threading the injected configuration path through two callers, and guarding one call. No new architecture and no wire change.

Trusting a workspace validates `~/.claude.json` and replaces it atomically. Untrusting one does neither: `untrustWorkspace` casts the parsed file with `as`, reads `projects` through a second `as`, and rewrites the file in place with `writeFileSync`. Its callers also ignore the configuration path provisioning was given. `initWorkspaceDir` stores an injected `workspaceClaudeConfig` that `finishProvisioning` trusts through, but `removeWorkspace` and `removeLeftoverWorkspace` both call `untrustWorkspace(dir)` with the default home-directory path. And because `removeWorkspace` calls it unguarded, a configuration holding `null` (whose `projects` lookup throws a `TypeError`) escapes before the clone is deleted, which stops `WorkspaceManager.removeAll` at shutdown and leaves every later clone on disk.

## Goal

`untrustWorkspace` reads through `readClaudeConfig`, validates with `isRecord`, and writes through `writeJsonAtomically`, with no `as` casts. It returns quietly, without touching the file, when the file is missing, cannot be read or parsed, is not an object, has a `projects` value that is not an object, or has no entry for the workspace. Both removal paths untrust against the configuration path `initWorkspaceDir` was given. `removeWorkspace` never lets an untrust failure skip the removal of the clone and its `.tmp` sibling.

## Approach

1. **`untrustWorkspace`** in `src/workspace/index.ts`: wrap `readClaudeConfig(claudeJson)` in a `try` and return on any error. That keeps today's quiet handling of an unreadable or malformed file, which `removeLeftoverWorkspace` relies on so that a broken configuration does not block every later launch. `readClaudeConfig` already returns `{}` for a missing file and throws for a non-object root. Then read `data['projects']` and return unless `isRecord(projects) && Object.hasOwn(projects, workspaceDir)`. Delete the entry and write with `writeJsonAtomically(claudeJson, data)`. A write failure still throws, as it does today, so `removeLeftoverWorkspace` keeps reporting it and leaving the folder untouched.

2. **Expose the injected path.** Add an exported `workspaceClaudeConfigPath()` beside `workspaceProjectDir()` that returns `workspaceClaudeConfig`, falling back to `~/.claude.json` when `initWorkspaceDir` has not run. Without the fallback, `removeWorkspace` in an uninitialized process would read an empty path. `removeWorkspace` passes it to `untrustWorkspace`. `removeLeftoverWorkspace` in `src/launch-name/leftover.ts` imports it and does the same.

3. **Guard the call in `removeWorkspace`** with `try { … } catch { /* ignore */ }`, matching the two `rmSync` guards below it. The `removeLeftoverWorkspace` comment already says `removeWorkspace` swallows every error, and now it does.

`ConversationStore.delete` in `src/conversations/store.ts` passes its own path and needs no change. Production calls `initWorkspaceDir(projectDir)` with the default, so the injected path equals `~/.claude.json` there. The path threading matters for correctness of the seam and for keeping tests off the real home-directory configuration.

## Implementation steps

1. Rewrite `untrustWorkspace` per Approach 1 and drop the now-unused imports if any.
2. Add `workspaceClaudeConfigPath()` and pass it from `removeWorkspace`, wrapping that call in a try/catch.
3. Pass `workspaceClaudeConfigPath()` from `removeLeftoverWorkspace`.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

`src/workspace/index.test.ts`, in the existing `untrustWorkspace` block, one table-driven case covering four shapes: a `null` root, an array `projects`, a string `projects`, and malformed JSON. Each file is left byte-for-byte unchanged, and the call does not throw.

In the `removeWorkspace` block:

- `removeWorkspace` removes the clone's trust entry from the path given to `initWorkspaceDir` (the test's `tmpDir/.claude.json`).
- When the rewrite fails (the configuration's directory is made read-only, so the atomic temp file cannot be created), `removeWorkspace` does not throw and still deletes the clone directory and its `.tmp` sibling. With `untrustWorkspace` now returning quietly on every read or shape problem, a write failure is the one error left for the guard to catch, so this is the case that pins it.

`src/launch-name/leftover.test.ts`: assert `untrustWorkspace` (already mocked) is called with the workspace folder and the injected `root/.claude.json` path.

`src/workspace/manager.test.ts` must keep passing unchanged.

## Spec

`product/specs/workspaced-agent.md`: after the provisioning-trust paragraph, describe removal. Removing a workspace drops its trust entry from the same configuration provisioning wrote. A configuration that is missing, unreadable, malformed, or not in the expected shape is left untouched. The update is atomic. When a workspace is removed on tab close or shutdown, a configuration problem never stops the clone and its scratch folder from being deleted.

## Out of scope

- The read-modify-write race against a concurrent Claude Code save, which the trust path already shares.
- `ConversationStore.delete` and any other caller that passes its own configuration path.
- Changing `trustWorkspace`'s strict failure behavior.
