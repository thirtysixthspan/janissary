# Qualify the file patch restore promise in help and spec

**Complexity: 1/10** — no production lines, files, requirements, scenarios, or units; two documentation edits (p=1.58)

## Goal

The patch help page and the ACP file patch spec no longer promise unconditionally that a failed patch leaves every file untouched. A reader sees that an ordinary failure changes nothing, that a failure while applying puts back the files already changed, and that only a failed restore can leave some files changed. The existing applying-failure bullet and failure line already report both outcomes.

## Approach

`help/file.md` says under **Patching several files** that every check runs before anything is written and any failure leaves every file as it was. `product/specs/acp.md` says under **File patch tool** that a patch which fails while writing puts back every path it changed. Both overstate the guarantee: `src/file-patch/commit.ts` returns `restored: false` when `restoreChanges` cannot put a path back, and `src/file-patch/messages.ts` then prints `Some files may have been changed.` instead of `No files were changed.`. The failure-while-applying decision in `product/plans/complete/file-patch.md` already describes both outcomes, and the help page's applying-failure bullet already lists both lines, so only the two summary sentences need to catch up.

Rewrite the help sentence to say sections are checked against the in-memory view before anything is written, that a disk failure while applying restores the files already changed, and that a failed restore can leave some files changed, pointing at the applying-failure bullet. Add the same qualification to the spec sentence, naming the ordinary `No files were changed.` result and the failed-restore `Some files may have been changed.` result. Leave the runner, the restore implementation, and every other paragraph of both files unchanged.

## Implementation

1. In `help/file.md`, under **Patching several files**, replace "Every check runs before anything is written; any failure leaves every file as it was." with a passage that keeps the section-check path distinct from the applying-failure restore path, names the failed-restore exception, and points at the `Patch failed while applying` bullet below.
2. In `product/specs/acp.md`, under **File patch tool**, extend "A patch that fails while writing puts back every path it changed..." so the ordinary restore result and the failed-restore result are both named.
3. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

No new tests. This plan changes documentation and a spec only, with no behavior or output to cover. The implementation's existing tests already cover both restore outcomes: `src/file-patch/commit.test.ts` exercises a successful restore and a failed one, and `src/file-patch/messages.test.ts` pins both result lines. Running `check-diff` confirms the edits break nothing.

## Out of scope

The runner, the applying-failure implementation, the failure-line wording, and every other paragraph of the help page and spec. No PR description change.
