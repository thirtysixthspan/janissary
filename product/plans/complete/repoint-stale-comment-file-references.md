# Repoint source comments that name files by their pre-namespacing paths

**Complexity: 3/10** — comment-only edits across roughly forty-five files in `src/` and `web/src/`, with no code, type, or behavior change. The work is wide but mechanical; the only judgment is picking the right current file when a basename now exists in several directories, which reading the sentence around each reference settles.

Every namespace move so far has rewritten import paths but left comments alone, so comments of the form "see `x.ts`" or "the same split `remote-port-git.ts` uses" now point at files that no longer exist. A reader following one either wastes the lookup or lands on an unrelated same-named file elsewhere.

## Goal

Every backtick-quoted `name.ts`/`name.tsx` reference in a comment under `src/` or `web/src/` resolves to a file that exists. A reference to a moved file names its current path; a reference to a deleted file names whatever replaced it. The one comment the backlog entry calls out as factually wrong beyond its filename, the duplicated `isSameOrDescendantPath` in `web/src/file-navigator/file/navigator-drag.ts`, gives its real reason.

## Approach

1. **Find the stale references.** Extract every backtick-quoted `*.ts`/`*.tsx` name from comment text in both trees and keep those whose basename matches no file in either tree. Also keep path-qualified references (`controller/file-navigator.ts`, `web/src/transcript/ansi.ts`) whose basename exists somewhere but whose path does not resolve. Globs (`frame-decode-*.ts`, `src/editor/*.test.ts`), bare extensions (`.ts`), and paths outside the two trees (`web/vite.config.ts`) are not file references and stay.

2. **Map each to its current file** with `git log --diff-filter=R --name-status`. The moves found:
   - `src/remote/frame-decode*.ts` → `src/remote/frame/decode*.ts`
   - `src/file-navigator/remote-port-*.ts`, `remote-file-cache.ts` → `src/file-navigator/remote/port-*.ts`, `remote/file-cache.ts`
   - `src/file-navigator/manager-*.ts` → `src/file-navigator/manager/*.ts`
   - `src/message-handler.ts` → `src/message/handler.ts` (the params guards are now re-checked in `src/message/plugin.ts`, which imports them directly; `client-message.ts` no longer re-exports them)
   - `src/interactive.ts`, `interactive-signals.ts`, `interactive-learned.ts` → `src/interactive/index.ts`, `signals.ts`, `learned.ts`
   - `src/git-sync.ts`, `git-status.ts` → `src/git/sync.ts`, `src/git/status.ts`
   - `src/sandbox/browser-ports.ts`, `browser-profile.ts`, `browser-spawn.ts` → `src/sandbox/browser/ports.ts`, `profile.ts`, `spawn.ts`
   - `src/harness/capture-file.ts`, `capture-wire.ts` → `src/harness/capture/file.ts`, `wire.ts`
   - `src/controller/file-navigator*.ts` → `src/controller/file/navigator*.ts`
   - `src/editor-save.ts` → `src/editor/save.ts`; `src/profile-file.ts` → `src/profile/file.ts`
   - `src/notifications.ts` → `src/notifications/index.ts` (two references in `src/config.ts`, whose bare `notifications.ts` basename still exists elsewhere, so the step 1 extraction does not flag them; they are fixed because the file is already being edited)
   - `src/project-tokens.ts` → `src/project/tokens.ts`, which also absorbed the deleted `github-token.ts` and `opencode-token.ts` (#834)
   - `src/remote/filesystem-refusal.ts` → `src/remote/filesystem/refusal.ts`; `src/remote/channel.test.ts` → `src/remote/channel/index.test.ts`
   - `openFileManager.ts` → `src/open/file-manager.ts`; `e2e-server.test.ts` → the three `e2e-server-*.test.ts` suites
   - `web/src/file-navigator/file-navigator-*.ts` → `web/src/file-navigator/file/navigator-*.ts`; `web/src/transcript/ansi.ts` → `web/src/shared/transcript/ansi.ts`

3. **Rewrite each reference in place.** A sibling in the same directory is named by its bare new basename; anything farther away is named by its path from the repository root, matching how the surrounding comments already refer to distant files. Where the sentence around a reference makes a claim the move also made false (a re-export that the no-barrels rule has since removed), correct that clause too, and nothing more.

4. **Correct the `navigator-drag.ts` comment.** Client and server can share a runtime module through `@shared/`; the actual reason the helper is duplicated is that the server's definition shares `src/file-navigator/index.ts` with `node:fs` directory reads, so importing it into the browser graph would pull those in. Say that instead.

## Tests

No test covers comment text. Verification is re-running the step 1 extraction and getting an empty list, plus `./scripts/run.mjs check-diff` staying clean (lint, typecheck, and the related test suites are unaffected by comment-only edits).

## Out of scope

- Amending Rule IN and the straggler check in `ai/tasks/hygiene/improve-namespacing.md` so future moves rewrite backtick-quoted comment references along with import paths. The backlog entry asks for this too, but the resolve-technical-debt playbook may not edit `ai/tasks/` files; it is left for a separate change.
- Deduplicating `isSameOrDescendantPath` / `parentPath` into an import-free shared module. The entry asks only for the comment to be corrected.
- Stale references in prose that are not backtick-quoted file names (plan names, function names).
