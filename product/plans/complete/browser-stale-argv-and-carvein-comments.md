# Correct the comments the browser follow-up fixes left behind

**Complexity: 2/10** — comment and plan text in four files, with no behaviour to change and no assertion that can move. The care is in getting the carve-in inventory right, since the number that is wrong today was wrong because someone wrote a count instead of describing the set.

## Goal

Four places in the repository still describe the browser as it was before three of this branch's own follow-up commits landed:

`src/cli-args.ts` documents the subcommand as `janus e2e-browser --port <n> --ws-path <token> --dir <path>` and names `--ws-path` among the flags handed on verbatim. The path stopped being an argument when it moved into the environment.

`product/plans/complete/sandbox-end-to-end-browser-testing.md` repeats that invocation and says four times that the scratch directory is passed as `--user-data-dir`, which the child deliberately does not pass.

`src/sandbox/browser-profile.ts` opens by saying the profile carves in exactly three paths, and repeats "exactly three paths are carved back in" in its reads section. It carves in more than three, and it has since the commit that narrowed the installation root into named pieces. Its `file-write*` comment also calls the workspace the `--user-data-dir`.

`src/browser/e2e-child.ts` and `product/plans/complete/browser-endpoint-secret-out-of-argv.md` both cite `product/plans/deferred/browser-private-transport-boundary.md`, a path that resolves to nothing — the plan is in `product/plans/complete/`.

## Approach

Describe the sets rather than count them. The carve-in count is wrong today precisely because it was written as a number, and a number goes stale the next time a path is added. The replacement names the parameter tables the profile actually binds — six subpaths through `BROWSER_READ_PARAMS`, two exact files through `BROWSER_FILE_PARAMS`, one deny through `BROWSER_DENY_PARAMS`, and the two write paths — so a later change to any of those tables makes the header visibly disagree rather than quietly wrong by one.

For the `--user-data-dir` claims, say what the child does instead and why, since "Playwright owns that flag and rejects an invocation supplying its own" is the reason the code looks the way it does and is worth having beside it. `runE2EBrowser`'s own doc comment in `src/browser/e2e-child.ts` already states this correctly; the other places are being brought up to it rather than invented.

## Design decisions

1. **All four `--user-data-dir` claims in the plan of record are corrected, not only the one in §3.** The backlog entry names §3, but design decision 8, design decision 17, and the open-question section carry the same sentence. Fixing one occurrence of a claim and leaving three in the same file is not a fix — a reader lands on whichever one they land on.

2. **The carve-in description is structural, not numeric.** The module header and the reads-section comment both name what the tables hold rather than how many entries they have, so the next person auditing the profile compares against `BROWSER_READ_PARAMS`, `BROWSER_FILE_PARAMS`, and `BROWSER_DENY_PARAMS` rather than against an integer someone forgot to bump.

3. **`e2e-child.ts`'s note gains one clause about the band deny.** Its paragraph says the disclosure is still reachable by "anything that can reach the port", which is literally true and was the whole reason the plan it cites existed. Repointing the citation at a *completed* plan without saying what completed it would read as a dangling reference. One clause naming the port-band deny, and the fact that it is a Seatbelt boundary and so does nothing on a host without one, keeps the paragraph honest.

4. **Nothing else in those files is touched.** No behaviour, no rule, no parameter, no test assertion. `src/sandbox/browser-profile.test.ts` reads the generated profile with comment lines stripped, so no edit here can change what it asserts — which is also why running it is the check that the edits stayed inside comments.

5. **`src/cli-args.ts` says why the path is not an argument.** The flag was removed on purpose, and the next person editing the child's launch is the one this comment exists for. A bare corrected invocation would leave nothing stopping them putting it back.

## Implementation steps

1. **`src/cli-args.ts`.** In the `e2eBrowser` field's doc comment, correct the invocation to `janus e2e-browser --port <n> --dir <path>` and name `JANISSARY_E2E_WS_PATH` as where the secret path travels, with the reason: an argument vector is readable through `ps` by any user on a macOS host. In the `e2eBrowserCommand` helper's comment, replace `(--ws-path, --dir)` with `(--port, --dir)`.

2. **`src/sandbox/browser-profile.ts`, module header.** Replace "carves in exactly three paths: the Chromium app bundle it executes, the browser's own scratch workspace, and that workspace's temp sibling" with a description of the real set: eight read carve-ins — the Chromium app bundle, the Node binary's directory, and janissary's runtime as six named pieces — with the project's state directory denied back out inside them, plus writes to the browser's own workspace and its temp sibling.

3. **`src/sandbox/browser-profile.ts`, the reads-section comment.** "then exactly three paths are carved back in" becomes the six subpaths and two exact files the tables below bind.

4. **`src/sandbox/browser-profile.ts`, the `file-write*` comment.** Drop "which are also its `--user-data-dir` and `downloadsPath`" and say what actually happens: downloads are pointed at the workspace explicitly, Playwright's own profile directory lands in the temp sibling because the caller points `TMPDIR` there, and the user data directory is not passed as an argument at all.

5. **`product/plans/complete/sandbox-end-to-end-browser-testing.md`.** In §3, correct the invocation the same way as step 1 and replace the `--user-data-dir` claim. Make the matching correction in design decision 8, design decision 17, and the open-question paragraph that repeats it (decision 1).

6. **The dead plan path.** In `src/browser/e2e-child.ts` and in `product/plans/complete/browser-endpoint-secret-out-of-argv.md`, repoint `product/plans/deferred/browser-private-transport-boundary.md` at `product/plans/complete/browser-private-transport-boundary.md`. In `e2e-child.ts`, add the clause from decision 3.

## Tests

No new tests, and none change. Every edit is inside a comment or a plan file.

`npx vitest run --project server src/sandbox/browser-profile.test.ts` is the check that step 2 through step 4 stayed inside comments: that suite strips comment lines before it reads the profile, so its 25 cases pass identically if the edits are comments and fail if any of them reached a rule.

`./scripts/run.mjs check-diff` covers the rest — a comment edit that broke the syntax of either TypeScript file would fail typecheck.

## Out of scope

- Every rule, parameter, and path in `src/sandbox/browser-profile.ts`. The profile is right; its header describes it wrongly.
- The `--ws-path` flag itself, which is already gone; only its documentation survives.
- `runE2EBrowser`'s doc comment in `src/browser/e2e-child.ts`, which already describes the user data directory correctly and is the wording the other places are being brought up to.
- Any specification or user-documentation change. None of these four places is user-facing; `product/specs/` and `documentation/` describe the behaviour correctly.
- A check that would catch a stale path reference in a comment. That is a repository-wide concern, not part of correcting four of them.

## Verification

`./scripts/run.mjs check-diff`, and `npx vitest run --project server src/sandbox/browser-profile.test.ts` explicitly for the reason above.

`grep -rn 'ws-path' src/ product/` returns nothing outside a history record. `grep -rn 'plans/deferred/browser-private-transport-boundary' src/ product/` returns nothing. `grep -rn 'user-data-dir' src/ product/` returns only the places that say the flag is *not* passed.

Read the rewritten profile header against `BROWSER_READ_PARAMS`, `BROWSER_FILE_PARAMS`, and `BROWSER_DENY_PARAMS` and confirm the description matches what `browserProfileParams` binds, in the order it binds them.
