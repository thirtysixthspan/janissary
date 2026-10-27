<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's supported file-navigator placement and targeting forms.

Existing Issue: `help/files.md` documents a path and a path targeted at another tab, but omits supported dock-placement forms, targetless `files in <label>`, and the optional `on <side>` clause. Severity: 4/10

Existing Risk: 3/10 - Users can still open the navigator using the abbreviated command row, but may miss how to target another tab's current directory or dock the navigator.

Proposal Risk: 1/10 - Listing the existing forms makes the feature discoverable, with only the usual risk that hand-maintained help can drift after a later parser change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "complete the file navigator help usage forms". Update the Usage block and examples in `help/files.md` to cover the supported bare `left`/`right` placement, `files in <label>` targeting, the `on <side>` placement clause, and the `with <name|size|modified|permissions>` details option, including a valid example that combines targeting and placement. Use `src/file-navigator/args.ts` as the grammar source and preserve the path-target behavior already described. Existing coverage in `src/file-navigator/args.test.ts` and `src/file-navigator/manager.test.ts` pins the parser and manager forms; no test currently checks help-page wording, so verify the page directly against those cases.


* Deliver the plan's fallback when the required command index is present but unreadable.

Existing Issue: `src/help-pages.ts` checks only that `commands.md` appears in the directory listing, so an unreadable `commands.md` does not yield the promised unreadable result when another page such as `profile.md` can be read. Severity: 4/10

Existing Risk: 2/10 - This affects a damaged or partially unreadable help installation, and a readable command page can still be returned, so the mismatch is limited to the specified fallback behavior.

Proposal Risk: 1/10 - Returning the generated summary whenever the required index cannot be read restores the specified fallback, with only the existing file-read failure risk remaining.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "fall back when the help command index is unreadable". In `src/help-pages.ts`, verify that the required `commands.md` can actually be read before returning a different requested page, and return `{ kind: 'unreadable' }` when that read fails so `src/commands.ts` selects `fallbackHelp`. Extend `src/help-pages.test.ts` with a listed but unreadable `commands.md` (for example, a broken symlink) alongside a readable command page, and assert that requesting the readable page still reports `unreadable`; retain the existing missing-directory, missing-index, and unreadable-requested-page cases.
