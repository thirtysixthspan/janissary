# Correct the description's Review follow-ups section and its inventories

**Complexity: 3/10** — the pull request's own description and nothing else. No source, no test, no spec, no documentation. The work is entirely in checking each claim against the branch as it now stands, because the finding that asked for this was itself written two commits ago and several of its specifics have since gone stale.

## Goal

PR #975's description should describe the branch it is attached to. Three things in it are wrong today:

The **Review follow-ups** section reports the browser's private-transport bypass as deferred and calls it the most severe outstanding problem, while two commits have since closed it. It sends the reader to `product/plans/deferred/browser-private-transport-boundary.md`, a path that resolves to nothing, and it ends by saying `product/specs/sandbox.md` overstates its containment claim, which was rewritten in the same commit that fixed the boundary.

The **Files changed** and **Tests** inventories are missing everything the last four commits added, and several of the case counts they do give have moved.

The **How to verify** list never mentions `npm run test:sandbox`, which is where the new port boundary is exercised against a real Seatbelt profile.

## Approach

Verify every claim against the branch before writing, rather than transcribing what the backlog entry says. The entry was recorded before the port-band commit, so its own account of the fix — "a parameterized `network-outbound` deny on the browser's own loopback port, applied to confined workspaced harness spawns only" — no longer describes the code. The deny is now static and covers a whole reserved band on every confined workspaced spawn. Two of the entry's other specifics have expired the same way: it asks for `src/pseudoterminal-manager.ts` to be added to Files changed, and that file is back to its master state; and it asks for the two browser profile variants in `src/sandbox/profile.ts` to be named, and those variants no longer exist.

The counts come from running the suites rather than from counting `it(` calls, since several of these files use `it.each` tables where the two numbers differ by a factor of three.

## Design decisions

1. **The opening sentence stops doing arithmetic about one review.** "A review of this branch recorded ten findings. Nine are fixed here" cannot survive a second review and a changing backlog, and reconstructing which review recorded what would be guesswork. Replace it with what a reader can check on the branch: two reviews have recorded findings, twelve are fixed here with a plan each in `product/plans/complete/`, and six remain recorded in `product/backlog/pull-request.md`.

2. **The transport boundary gets two table rows, not one.** It was closed in two steps that are separate findings and separate commits: the parameterized per-port deny, then the reserved band that generalizes it to every browser from every confined spawn. Collapsing them would hide that the first fix held only for a single tab, which is the part a reviewer of a security boundary most needs to see.

3. **The replacement paragraph states what the boundary does not cover, in the description itself.** The deferred paragraph's value was that it named a limit out loud. Deleting it and saying "fixed" would lose that. The remaining single-layer cases — a host without Seatbelt, `sandboxWorkspaces` off, and a `--no-workspace` launch, where there is no confined harness to apply the deny to — belong in the description rather than left for a reader to derive from the spec.

4. **The sentence about `product/specs/sandbox.md` overstating its position is deleted rather than softened.** That text was rewritten in the same commit that fixed the boundary and now names the asymmetry itself, so there is nothing left to caveat.

5. **The `test:sandbox` verify step says out loud that it cannot run inside a workspace.** The description already carries an "On the Seatbelt profile" paragraph explaining that nested `sandbox_apply` is refused in a janissary workspace. The new step is subject to exactly that, and a step that looks runnable but silently cannot run is worse than no step.

6. **Nothing outside the description changes.** No file under `src/`, `product/specs/`, or `documentation/`. The description is the only thing wrong, and this plan file plus the backlog entry's removal are the only files the commit carries.

## Implementation steps

The description is edited with `gh pr edit 975 --body-file`, after the commit is pushed, per the task's ordering rule. Every paragraph the steps below do not name is preserved exactly as the author wrote it.

1. **Review follow-ups, opening sentence.** Replace the ten-findings-nine-fixed sentence with the two-reviews, twelve-fixed, six-remaining form from decision 1.

2. **Review follow-ups, the table.** Add three rows to the nine already there:
   - *Trust boundary in reviewed material* — the operating manual and the description read as instructions by an automated reviewer, now addressed to a person deciding whether to merge (commit `cc206e21`).
   - *Private transport boundary* — Playwright's unauthenticated discovery route on the browser's own port, denied to the confined harness that owns it (commit `9d4f757b`).
   - *Every browser's port, not only its own* — the same deny generalized to a statically reserved band, applied to every confined workspaced spawn whether or not it has a browser, so a second tab and a browserless tab are both refused (commit `29ada73a`).

3. **Review follow-ups, the deferred paragraph.** Replace it wholesale with a paragraph reporting the boundary as fixed: what the deny is now (a static `network-outbound` deny on a reserved 256-port band at the top of the dynamic range, on every confined workspaced spawn), and what it is not (a host without Seatbelt, `sandboxWorkspaces` off, and `--no-workspace`, where the protocol guard remains the only layer). Remove the `product/plans/deferred/browser-private-transport-boundary.md` reference; the plan is in `product/plans/complete/`. Drop the closing sentence about the specification overstating its position.

4. **Files changed.** Under *New — `src/sandbox/`*, add `browser-ports.ts`: the reserved band and the profile clause that denies it. Under *Modified — `src/sandbox/`*, add `paths.ts` for `BROWSER_ENV_ALLOW`, and rewrite the `profile.ts` line — it now carries the Playwright read carve-in *and* the band deny, and no longer has browser profile variants. In the one-line list of the five smaller `src/browser/` modules, extend the `e2e-ports.ts` phrase so it says the browser's port comes from the denied band. Do not add `src/pseudoterminal-manager.ts`: the port-band commit removed the threading that had changed it, and it is identical to master again.

5. **Tests.** Add the five new test files the list omits — `e2e-child-command.test.ts` (7), `e2e-child.test.ts` (12), `e2e-ports.test.ts` (11), `e2e-scratch.test.ts` (15), and `browser-port.sandbox.test.ts` (1, in the `sandbox` project) — and add `pseudoterminal-manager.test.ts` to the extended list. Correct the counts that moved: `e2e-guard.test.ts` is 10, `e2e-frame-filter.test.ts` 42, `e2e-server.test.ts` 36, `browser-profile.test.ts` 25, `scratch-dir.test.ts` 11.

6. **How to verify.** Add a step for `npm run test:sandbox`, naming `browser-port.sandbox.test.ts` as the only place the port boundary meets a real Seatbelt profile, and stating that it cannot run inside a janissary workspace for the reason the "On the Seatbelt profile" paragraph already gives.

## Tests

No automated tests. The deliverable is a pull request description on GitHub, which no suite reads. `./scripts/run.mjs check-diff` sees only a new plan file and an edited backlog file, so it assembles an empty tool list and exits 0 — the expected result, not a gap.

The check that matters is the one under Verification: every claim the edited description makes is re-derivable from the branch.

## Out of scope

- Any file under `src/`, `product/specs/`, or `documentation/`. The code, the specification, and the documentation are right; the description is what is wrong.
- The pull request's **title**, which has to match the commit subject under this repo's Conventional Commits rules.
- The five other paragraphs of the description — What, Behavior examples, the design-decision paragraphs, and the "On the Seatbelt profile" note. They are the author's statement of intent and remain accurate.
- The `--no-workspace` grouping in `product/specs/sandbox.md` and the harness documentation page, which is a separate entry in the backlog. This description states the limit in its own words rather than pre-empting that fix.
- The description drifting again as the remaining backlog entries land. It is accurate as of the commit that carries this plan.

## Verification

`./scripts/run.mjs check-diff` — expected to run no tools and exit 0.

Re-derive each new claim from the branch: `git log --oneline origin/master..HEAD` for the three added table rows and their commits, `ls product/plans/complete/` for the twelve fixes, `grep -c '^\* ' product/backlog/pull-request.md` for the six that remain, `git diff --stat origin/master...HEAD -- src/` for the Files changed additions and for `src/pseudoterminal-manager.ts` being absent from it, and a run of each named suite for the case counts.

Read the rendered description on GitHub afterwards and confirm the table renders with twelve rows, that no `product/plans/deferred/` path appears anywhere in the body, and that every paragraph this plan did not name is byte-identical to what was there before.
