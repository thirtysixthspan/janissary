<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Stop the diff tab from disabling itself on its first refresh, which the intent's missing return value does today.

Existing Issue: The `refresh` intent handler in `src/plugins/diff/activate.ts` returns `session.refresh(...)`, an async function whose resolved value is `undefined`, and the host validates every intent's result with `isJsonCompatible` — which answers false for `undefined` — and then disables the plugin with "produced an invalid intent result", so the whole tab dies on the first refresh instead of repainting. Severity: 9/10

Existing Risk: 9/10 - The tab is opened and then dies within a second, because the client's refresh loop, the whitespace toggle, and the Refresh button all send this intent, so the feature cannot be used at all in the running application and the failure looks like a broken plugin load rather than a wrong return value.

Proposal Risk: 2/10 - The handler answers `null` and starts the recompute outside the guarded call, so the intent's contract is satisfied and a slow recompute cannot time the plugin's handler budget out; what remains is that the answer no longer carries the outcome, so a caller wanting to know the diff landed has to wait for the tab's own repaint.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1621 "stop the diff tab from disabling itself on its first refresh". In `src/plugins/diff/activate.ts`, change the `refresh` entry so it starts the recompute without returning it and answers `null`: `run: (_tab, payload: RefreshIntent, capabilities) => { void sessionFor(capabilities).refresh(payload.hideWhitespace); return null; }`. Keep the recompute itself unchanged — `DiffSession.refresh` already guards against one already in flight and drops a result whose root moved on. Add a regression test in `src/plugins/diff/activate.test.ts` that drives the intent through `defineIntents` and asserts the resolved value is exactly `null`, not merely that the recompute ran, because the unit tests' fake capabilities return the handler's value without the host's JSON check and so cannot catch this on their own. Point the test at the host's own rule rather than a local copy of it: the contract is in `src/plugins/context.ts` (`isJsonCompatible`) and the disabling path is in `src/plugins/requests.ts`, and a comment naming both keeps the next reader from reintroducing it.


* Answer a real line number for a double-click inside a deleted file's hunk, and make that file's hunks inert.

Existing Issue: The jump fallback in `hunkLines` in `src/plugins/diff/parse-diff.ts` uses the hunk's last new-side number, which for a pure deletion — a hunk whose `@@` header reads `-1,2 +0,0` — is `newStart - 1`, so the parser answers `jump: -1` for every removed line and a double-click emits an open intent for line -1. Severity: 6/10

Existing Risk: 6/10 - A double-click on any line of a deleted file asks the editor to open a path that no longer exists at line -1, which lands the user in a new-file buffer for a deleted file or a cursor off the top of the window, and the tab that promised to take you to that position instead takes you somewhere meaningless.

Proposal Risk: 3/10 - The jump becomes the nearest line that does exist — the next added or context line, else the previous one, else the line above the hunk clamped to 1 — so a double-click always lands on a real line, but the choice for a trailing run of removed lines is a judgment call the payload now encodes rather than something the user sees.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1621 "answer a real line for a double-click in a deleted file's hunk". Two changes. First, in `src/plugins/diff/parse-diff.ts`, replace the fallback in the jump pass: a removed line borrows the next added or context line's number; when there is none it borrows the previous added or context line's number; and when the hunk holds no added or context line at all it uses `Math.max(1, oldStart - 1)`, so a hunk that deletes from the start of a file answers line 1. Add cases to `src/plugins/diff/parse-diff.test.ts` for a hunk that ends in removed lines, one that begins with them, and one that holds nothing else — pinning the exact numbers rather than only that they are non-negative. Second, in `web/src/plugins/diff/FileEntry.tsx`, stop a deleted file's hunks answering a double-click at all, because there is no file to open: pass the hunk components an `onOpenLine` that does nothing when the file's `deleted` is set, and cover it in `web/src/plugins/diff/DiffTab.test.tsx` by double-clicking a line in a deleted entry and asserting no `open` intent is emitted. Finally, correct the pull request description's Files-changed sentence, which promises that clicking a file's name opens it without naming the deleted-file exception the implementation and the spec both carry.


* Show a mode-only change, which the parser drops today because it has no paths to read.

Existing Issue: A file whose only change is its mode prints `old mode` and `new mode` and no `---`/`+++` lines, so `finish` in `src/plugins/diff/parse-diff.ts` finds no path and drops the record, leaving a `chmod` invisible in a tab that shows every change. Severity: 3/10

Existing Risk: 4/10 - A script whose executable bit is the whole change reads as a clean tree, so the one change a reviewer of a build or install fix cares about is the one the tab hides, and nothing in the tab hints that something was dropped.

Proposal Risk: 4/10 - Naming the file means reading it from the `diff --git a/<old> b/<new>` line, which is the line the parser deliberately avoids because git does not quote a spaced path there, so the fallback trades one known gap for a rarer one and needs its own comment saying which is which.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1621 "show a mode-only change in the diff tab". In `src/plugins/diff/parse-diff.ts`, remember the two paths from the `diff --git` line when a record opens, and use them in `finish` only when the record has no `---`/`+++` lines to name itself with — the mode-only case, and nothing else, since every other record carries them. Resolve the two paths by stripping the leading `a/` and `b/` and splitting on the last ` b/`, and say in a comment that a path containing a space is ambiguous there and that the `---`/`+++` lines are the primary source. Give the record no hunks and let the entry render its header with zero counts, the way a binary entry does, so the file is at least named. Add a test to `src/plugins/diff/parse-diff.test.ts` for a mode-only change and one for a rename-with-no-content-change, which is the other record with no `---`/`+++` lines and already works through `rename to`.


* Refuse a `diff` path that does not exist instead of reporting a non-repository.

Existing Issue: `rootFor` in `src/plugins/diff/activate.ts` resolves a path argument against the origin tab's root without checking that it exists, so `diff nosuchdir` opens the tab on a directory that is not there, and `git rev-parse --show-prefix` fails there for the same reason it fails outside a repository, so the body reports "This directory is not a git repository" for what is really a typo. Severity: 4/10

Existing Risk: 5/10 - The message sends a user looking for their change set to doubt whether the project is a repository at all, which is the one conclusion the message must not invite, and the wrong state is indistinguishable from the real one the tab is designed to report.

Proposal Risk: 3/10 - The command refuses the path before opening the tab, which is one more thing a caller can get wrong and one more message to read, but a misspelled directory never reaches the tab and the not-a-repository state stays specific to repositories.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1621 "refuse a diff path that does not exist". In `src/plugins/diff/activate.ts`, have `rootFor` answer a rejection when the resolved path is not an existing directory — `Cannot diff <${trimmed}>: no such directory.` — using the same `existsSync` check `src/plugins/diff/change-set.ts` already imports for the unborn-repository route, so the refusal surfaces on the originating transcript as a rejection and the tab never opens. Keep the not-a-repository payload state as it is for a root that does exist and is not inside a repository. Extend `src/plugins/diff/activate.test.ts` with a case for a missing path asserting the rejection and that no tab opened, and a case for a path that exists and is not a repository asserting the payload state, so the two remain distinct.
