# Correct the reading-status verification step

**Complexity: 4/10** — a one-step correction to the pull request's own description, made after the push. No code, no tests, no spec, and no documentation. The care is in confirming that the tab must be closed and reopened before the observed `Cmd+F`, and in preserving every other paragraph of the body.

## Goal

Step 16 of the pull request's "How to verify" section tells the reviewer to open `fixtures/pdf-find-long.pdf` and then press `Cmd+F` and type `filler` before the find read of the forty pages finishes. By that point Step 11 has already opened the same document, pressed `Cmd+F`, and typed `filler`, so the read has already run and the tab's one-per-tab read will not start again. Reopening the document focuses the existing tab, so Step 16 can never show `Reading pages…`. The fix is to make the tab fresh first: close the `pdf-find-long.pdf` tab and reopen it, then press `Cmd+F` and type `filler` before the read finishes. The expected states stay exactly as written.

## Why the tab must be fresh

- `web/src/plugins/pdf/usePdfFind.ts` holds a `started` ref and returns early from `open()` once it is true, so the document's text is read only on the first `Cmd+F` in a tab.
- Step 11 already opened `pdf-find-long.pdf`, pressed `Cmd+F`, and typed `filler`, which sets `started` and completes or starts the forty-page read.
- The `open` command focuses an already-open tab instead of creating a new one, so running Step 16's `open fixtures/pdf-find-long.pdf` does not reset the hook's state and does not start a read.
- Closing the tab unmounts its PDF tab component and discards the hook with it. Reopening creates a new tab whose `started` ref is false, so the `Cmd+F` that Step 16 observes begins the read and shows `Reading pages…` until the last page resolves.
- Step 23 of the same body already closes and reopens this tab the same way, so the corrected Step 16 follows an existing phrasing in the author's text.
- `product/specs/pdf-tab.md` § Find already documents that the text is read once per tab on the first open and kept until the tab closes. `web/src/plugins/pdf/PdfTab.test.tsx`'s "shows the reading status until the last page is read" already pins the status behavior.

## Implementation steps

1. After the push, read the current body with `gh pr view 1958 --json body` and write the revised body to `./temp/pr-body.md`.
2. In the "How to verify" edge-case Step 16, replace the `Do:` sentence with one that closes the `pdf-find-long.pdf` tab, reopens it with `open fixtures/pdf-find-long.pdf` from an agent tab, then presses `Cmd+F` and types `filler` before the forty-page read finishes.
3. Leave Step 16's `Expect:` sentence byte-for-byte unchanged: while reading is unfinished, `Reading pages…` appears below the rows, or in place of `No matching lines` when no result has been found yet; rows fill in as pages are read; the status disappears when the last page has been read.
4. Leave every other paragraph, heading, and the title unchanged.
5. Apply the body with `gh pr edit 1958 --body-file ./temp/pr-body.md` and confirm the PR is still `OPEN` on `feature/pdf-tab-find`.

## Tests

None, and none possible: the artifact is prose in a pull request body, and the behavior the step exercises is already pinned by `web/src/plugins/pdf/PdfTab.test.tsx` and `web/src/plugins/pdf/usePdfFind.test.ts`. `$janissary/scripts/run.mjs check-diff` must still pass so the push carries no unintended change.

## Specs and documentation

No spec change: `product/specs/pdf-tab.md` § Find already says the text is read once per tab on the first open and that `Reading pages…` shows while reading is unfinished. No help or user-documentation change: neither describes this verification recipe.

## Out of scope

- Changing any code or test.
- Changing any other verification step, including Steps 11, 13, 14, 15, 18, and 23.
- Changing the behavior examples, screenshots note, summary, or title.
- The other two entries in `product/backlog/pull-request.md`.

## Verification

- Confirm the one-per-tab read by reading the `started` ref in `web/src/plugins/pdf/usePdfFind.ts` and the reading-status case in `web/src/plugins/pdf/PdfTab.test.tsx`.
- Run `$janissary/scripts/run.mjs check-diff` before the commit.
- After the push, read the applied body and confirm Step 16 closes and reopens the tab before its `Cmd+F`, its expected states are unchanged, and every other paragraph matches the author's text.
