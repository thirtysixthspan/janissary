# Correct the sweep-scope verification step to state the post-readiness latest.log repoint

**Complexity: 1/10** — a PR-description correction that adds no code and changes no application behavior; the six acceptance criteria are the only counted work (p=2.95).

## Goal

Make the **How to verify** section of pull request #2203 describe the launcher's actual `latest.log` contract in the sweep-scope check: after a successful launch the seeded symlink still exists but names the new run's `localhost-<stamp>.log`, because the launcher repoints it after readiness. The completed plan `product/plans/complete/server-log-per-run.md` stays untouched as a historical record, and no source, test, spec, config, help, or documentation file changes.

## Requirements

1. The corrected sweep-scope step states that after a successful launch `latest.log` is still a symlink but now names the new run's `localhost-<stamp>.log`, because the launcher repoints it after readiness ("The launcher repoints it only after the new server's `__JANUS_URL__` line appears" — `product/specs/cli.md:70`).
2. The step keeps the assertion that the backdated `old.log` is swept by the launch sweep ("For server logs the sweep looks only at regular `.log` files directly inside `.janissary/logs/server/`" — `product/specs/cli.md:60`).
3. The step keeps the assertions that the fresh `current.log`, `notes.txt`, `nested/old.log`, `notifications.json`, and the legacy `server.log` are byte-for-byte unchanged ("the `latest.log` symlink, subdirectories, and files elsewhere are left alone" — `product/specs/cli.md:60`).
4. The step keeps the assertion that startup does not wait for the sweep ("Startup does not wait for it." — `product/specs/cli.md:60`).
5. The step is anchored to `bin/janus.mjs:125` (the post-readiness `pointLatestLog` call), `scripts/janus-launcher-per-run.test.mjs` "keeps latest.log on the earlier run until the new server prints its readiness marker", and `product/specs/cli.md:70` — the sources named in the recorded entry's Proposal.
6. Every other paragraph of the PR body, its four section headings, and the `### Additional test cases` section are preserved byte-for-byte; the PR title is untouched; `product/plans/complete/server-log-per-run.md` is not edited.

## Design decisions

- The description is the artifact corrected, not the completed plan. The wrong "the symlink ... unchanged" expectation lives in a completed plan's Verification section, which is a historical record; `work-pull-request-issue.md` may edit the PR description's **How to verify** but not another plan's text (work item; `ai/tasks/feature/test-pull-request.md` Step 9).
- A self-contained sweep-scope step is added rather than rewriting any existing step, so no other step's number or wording changes. It carries its own full seed — `{"logEnabled": false, "logRetentionInDays": 0}`, backdated `old.log`, fresh `current.log`, `notes.txt`, `nested/old.log`, a `latest.log` symlink to `current.log`, plus `notifications.json` and the legacy `server.log` in the parent `logs` directory — and all sweep assertions stay intact.
- The body edit is applied after the push with `gh pr edit --body-file`, because a description is live on GitHub while a file edit is not published until pushed (Step 8.5 of `work-pull-request-issue.md`). The full body is reconstructed from `gh pr view --json body` with only this change, since `gh pr edit` replaces the body wholesale.

## Preserved behavior

1. The launcher repoints `latest.log` to the new run's bare filename only after the new server's `__JANUS_URL__` line appears; it must not repoint before readiness or on a refused launch. Test: `scripts/janus-launcher-per-run.test.mjs` "keeps latest.log on the earlier run until the new server prints its readiness marker".
2. The launch sweep deletes only backdated regular `.log` files directly inside `.janissary/logs/server/` and leaves symlinks, subdirectories, other extensions, and files outside that directory alone; it must not sweep the fresh log or the link. Test: `src/state/reaper.test.ts` "keeps symbolic links and their targets".
3. Startup does not wait for the background sweep. Test: `src/launch-sweeps.test.ts` "returns without waiting for a sweep to finish".

## Assumptions

1. `bin/janus.mjs:123-125` calls `pointLatestLog` only after `awaitReady` resolves, so readiness precedes the repoint and a successful launch leaves the link naming the new run's log.
2. `scripts/janus-launcher-per-run.test.mjs:169-177` asserts the link still names the earlier file before the readiness gate opens and equals the new file's bare name after the launch succeeds.
3. `product/specs/cli.md:70` states "The launcher repoints it only after the new server's `__JANUS_URL__` line appears", supplying the true value the corrected step must state.
4. `ai/tasks/feature/test-pull-request.md` Step 9 gives this task permission to correct a wrong completed-plan step in the description's **How to verify** but not in another plan's text.
5. `gh pr edit --body-file` replaces the body wholesale, so the revised body must be written in full with every other character unchanged (Step 8.5).

## Existing functionality

1. The launcher's post-readiness `pointLatestLog` call and its bare-name target (`bin/janus.mjs:125`; `bin/server-log.mjs:14-29`).
2. The readiness-gating launcher test (`scripts/janus-launcher-per-run.test.mjs:160` "keeps latest.log on the earlier run until the new server prints its readiness marker").
3. The spec sentence that states the repoint timing (`product/specs/cli.md:70`) and the spec sentence that states the sweep scope (`product/specs/cli.md:60`).
4. The symlink-preserving sweep test (`src/state/reaper.test.ts` "keeps symbolic links and their targets") and the non-blocking sweep test (`src/launch-sweeps.test.ts` "returns without waiting for a sweep to finish").
5. The `### Additional test cases` section already present in the PR body, added by the test task, which must be preserved verbatim.

## Implementation steps

1. **PR description, applied after the push.** Add one self-contained step to the **How to verify** section of pull request #2203: "In a scratch project with `{"logEnabled": false, "logRetentionInDays": 0}`, create `.janissary/logs/server/old.log` backdated two hours, a fresh `.janissary/logs/server/current.log`, `.janissary/logs/server/notes.txt`, `.janissary/logs/server/nested/old.log`, and a `latest.log` symlink to `current.log`; in the parent `.janissary/logs` directory create `notifications.json` and the old `server.log`. Launch with `node bin/janus.mjs --no-open <project-dir>` and let the background sweep run. Expect `old.log` is gone; `current.log`, `notes.txt`, `nested/old.log`, `notifications.json`, and the legacy `server.log` are byte-for-byte unchanged; `latest.log` is still a symlink but now names the new run's `localhost-<stamp>.log` because the launcher repoints it after readiness; and startup does not wait for the sweep." Anchor it to `bin/janus.mjs:123-128`, `scripts/janus-launcher-per-run.test.mjs` "keeps latest.log on the earlier run until the new server prints its readiness marker", `product/specs/cli.md:70`, and `product/specs/cli.md:60`. Write the full revised body to `./temp/pr-body.md` and apply it with `gh pr edit https://github.com/thirtysixthspan/janissary/pull/2203 --body-file ./temp/pr-body.md` after the push; leave the title and every other paragraph untouched. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Plan and backlog.** Move this plan from `draft/` to `ready/`, then to `complete/`, and remove the resolved entry (the first one, the sweep-scope step correction) whole from `product/backlog/pull-request.md`, leaving the second entry about base-branch testing instructions byte-for-byte untouched and the file's comment-and-heading skeleton intact. Commit and push both files to `feat/server-log-per-run`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. Only PR prose and plan/backlog files change; no command, flag, key binding, or UI surface is affected.

## Tests

No tests added. This plan changes no application behavior and introduces no code, so there is nothing to unit-test. The behavior the corrected step describes is already pinned by `scripts/janus-launcher-per-run.test.mjs` "keeps latest.log on the earlier run until the new server prints its readiness marker" and `src/state/reaper.test.ts` "keeps symbolic links and their targets", and `$janissary/scripts/run.mjs check-diff` runs those suites to confirm no regression.

## Out of scope

- Any source, test, spec, config, help, or user/developer documentation change.
- Any edit to `product/plans/complete/server-log-per-run.md`, a completed historical record.
- The PR title and every PR body paragraph other than the added sweep-scope step, including the `### Additional test cases` section.
- The second backlog entry about base-branch testing instructions.
- Merging or closing the pull request, or force-pushing.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **Reading check.** Run `gh pr view https://github.com/thirtysixthspan/janissary/pull/2203 --json body` and confirm the How to verify section carries a sweep-scope step stating that after a successful launch `latest.log` is still a symlink but names the new run's `localhost-<stamp>.log` because the launcher repoints it after readiness, with all other sweep assertions present. Confirm every other paragraph, the four section headings, and the `### Additional test cases` section are unchanged, and that the repo diff contains only this plan file and the removal of the first backlog entry, with the second entry untouched.
