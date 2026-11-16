# File patch help: document the section-failure reasons beyond the page's closed list

**Complexity: 1/10** — 2 requirements and 1 test scenario drive a prose correction with no production lines or files (p=2.61)

## Goal

The **Patching several files** section of `help/file.md` claims a section failure's `<reason>` is one of a fixed list that ends with the `Filesystem error ENOTDIR` case. The patch runner also reports the other reasons `fileOperationReason` produces, such as `Permission denied; check file and folder permissions, then try again` when a section's path cannot be read, so the page states a closed set that is not closed. The page should present the named reasons as examples and say that any other filesystem failure also appears as the reason, naming a permission failure and a vanished path as examples, mirroring the catch-all in **Writing and editing** on the same page.

## Approach

Edit only the help page, the spec paragraph that describes what the page documents, its rendered-output assertion, the plan, and the backlog. Leave the runner, its messages, and every patch behavior test untouched.

The reasons reach the line through `sectionFailureLine` in `src/file-patch/messages.ts`, which passes a section failure's `reason` through `escapedReason`. `src/file-patch/view.ts` wraps path resolution and content reads in `runFileOperation`, so an `EACCES`, `EPERM`, `ENOENT`, `ENOSPC`, or other filesystem error becomes one of the `ERROR_REASONS` strings in `src/file-navigator/file-operation-result.ts` or its `Filesystem error <code>` fallback. The page must therefore describe a category, not an exhaustive list.

## Implementation

1. `help/file.md`, line 179: replace the paragraph opening "The `<reason>` in a section failure is one of" so it says the reason names either the patch rule that refused the section or the filesystem failure behind it, and that the listed reasons are examples. Keep every existing patch-specific reason, the `No matching text for hunk starting "<line>"` clause, and the `Filesystem error ENOTDIR; check the item and destination, then try again` example. Then add: "Any other filesystem failure also appears as the reason, such as `Permission denied; check file and folder permissions, then try again` when a path cannot be read or written, or `The source or destination no longer exists; refresh the file navigator, then try again` when a path vanishes while the patch runs." Follow the page's existing prose style; no file paths or function names.
2. `src/commands.test.ts`, the "documents the file patch section and usage line" case: assert the rendered `help file` output contains the new catch-all sentence and both named example reasons, so a later edit cannot restore the closed-set claim unnoticed.
3. `product/specs/application-commands.md`, `### help`: beside the existing page-specific statements for `help schedule` and `help db`, state that the `help file` page's **Patching several files** section gives the patch-specific section-failure reasons as examples and says any other filesystem failure, such as a permission error or a vanished path, also appears as the reason.

## Tests

- The updated `src/commands.test.ts` case above, in the `server` vitest project.
- Run the existing `src/file-patch/` server tests unchanged; they pin the runner's reasons and output lines and must stay green. No new patch behavior test is needed because no behavior changes.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Render `help file` and read the **Patching several files** paragraph to confirm the catch-all sentence and both examples appear.

## Out of scope

- Changing the patch runner, `fileOperationReason`, `sectionFailureLine`, or any message text.
- Re-listing every `ERROR_REASONS` entry as its own named example; the catch-all covers them.
- `help/commands.md`, `help/keys.md`, and `documentation/user-documentation/`, none of which describe this paragraph.
