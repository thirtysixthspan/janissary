<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's fallback when the required command index is present but unreadable.

Existing Issue: `src/help-pages.ts` checks only that `commands.md` appears in the directory listing, so an unreadable `commands.md` does not yield the promised unreadable result when another page such as `profile.md` can be read. Severity: 4/10

Existing Risk: 2/10 - This affects a damaged or partially unreadable help installation, and a readable command page can still be returned, so the mismatch is limited to the specified fallback behavior.

Proposal Risk: 1/10 - Returning the generated summary whenever the required index cannot be read restores the specified fallback, with only the existing file-read failure risk remaining.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "fall back when the help command index is unreadable". In `src/help-pages.ts`, verify that the required `commands.md` can actually be read before returning a different requested page, and return `{ kind: 'unreadable' }` when that read fails so `src/commands.ts` selects `fallbackHelp`. Extend `src/help-pages.test.ts` with a listed but unreadable `commands.md` (for example, a broken symlink) alongside a readable command page, and assert that requesting the readable page still reports `unreadable`; retain the existing missing-directory, missing-index, and unreadable-requested-page cases.
