# Resolve a tab's working directory through one tab-manager method

**Complexity: 6/10** — one new `TabManager` method and one path helper, then about seventeen call sites and their test fakes migrated; the only behavior change is the fallback for a tab with no recorded cwd.

## Goal

Commands, openers, and the file navigator agree on where a relative path lands in a tab that has no recorded working directory. Every path-resolving site falls back to the project directory `janus` was started on, which `product/specs/cli.md` already names as the default root for the session.

## Approach

A tab's runtime `cwd` stays unset until its shell reports one. Today each call site picks its own fallback: `?? process.cwd()` in about twenty places and `?? managers.tab.launchDir` in six. The two differ whenever `janus <dir>` is started from another directory, because nothing changes the process directory to the project. So in such a tab `edit notes.md` resolves against the directory `janus` was launched from, while `$root/notes.md` expands against the project.

Add `TabManager.workingDirOf(label)`, returning `cwdOf(label) ?? launchDir`, and `resolveTabPath(managers, label, target)` in a new `src/tab/resolve-path.ts`, which does the `expandUserPath` step against the launch directory and resolves a still-relative result against `workingDirOf`. Migrate the path-resolving sites and the six `launchDir` sites to them.

## Implementation steps

1. Add `workingDirOf(label)` to `TabManager` in `src/tab/manager.ts`.
2. Add `resolveTabPath` in `src/tab/resolve-path.ts`.
3. Use `resolveTabPath` where the expand-then-resolve steps are written out: `src/commands/edit.ts`, `src/open/file-manager.ts` (`editResolved`, `newFile`, `newDirectory`), `src/play/run.ts`, and `src/profile/view-tabs.ts`.
4. Use `workingDirOf` for the cwd-only sites: `src/open/file-command.ts`, `src/file-navigator/open-command.ts` (two), `src/profile/agent-opener.ts`, `src/controller/completion.ts`, `src/editor-suggest/handler.ts`, and the cwd the client is shown in `src/tab/view.ts`.
5. Use `workingDirOf` for the six `launchDir` sites: `src/agent/manager.ts`, `src/command/manager.ts`, `src/file-navigator/open.ts`, `src/plugins/activity.ts`, `src/plugins/launch-tab-remote.ts`, and `src/plugins/line-capabilities.ts`.
6. Give the test fakes of the migrated sites a `workingDirOf` that mirrors the real method.

## Tests

- `src/tab/manager.test.ts`: `workingDirOf` answers the recorded cwd, and the launch directory when none is recorded.
- New `src/tab/resolve-path.test.ts`: an absolute target as written, `$root` and `~` expansion, a relative target against the recorded cwd, and a relative target against the launch directory when there is no cwd.
- `src/commands/edit.test.ts`: in a tab with no cwd and a project directory other than `process.cwd()`, a relative runscript-shaped file resolves under the project directory.
- `src/file-navigator/open-command.test.ts`: `files` in a tab with no cwd roots the navigator at the project directory, not `process.cwd()`.

## Out of scope

- The process-spawning fallbacks (`src/acp/manager.ts`, `src/shell/manager.ts`, `src/ssh-manager.ts`, `src/monitor/session.ts`, `src/harness/manager.ts`, `src/connection/catalog.ts`), left for a follow-up.
- Changing the process directory at startup.
- Spec changes: `product/specs/cli.md` already describes the project directory as the default root.
