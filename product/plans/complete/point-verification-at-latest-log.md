# Point the base-branch testing instructions at the latest log

**Complexity: 1/10** — a PR-description correction that adds no code and changes no application behavior; the six acceptance criteria are the only counted work (p=2.95).

## Goal

Make the **How to verify** section of pull request #2203 tell a tester who follows the base-branch copies of the start/stop tasks and the sandbox browser manual to read the app address from `<project-dir>/.janissary/logs/server/latest.log`, the path this branch actually maintains. The three base-branch copies on `origin/master` still name `.janissary/log/server.log`, which this launcher never writes, and a tester who follows them reports a start failure for a launcher that works. Those copies cannot be edited from this branch and this PR already carries the corrected versions, so the correction belongs in the description's verification guidance. No source, test, spec, config, help, or user/developer documentation file changes.

## Requirements

1. The added instruction tells a verifier to read the `__JANUS_URL__` line and app address from `<project-dir>/.janissary/logs/server/latest.log` and to pass that same path to the e2e driver's `--log` ("read the address from the app's own log" — `scripts/e2e-driver.mjs:1-5`; `scripts/e2e/session.mjs:41-51`).
2. The instruction notes that the per-run logs are `localhost-<stamp>.log` beside the link and that a legacy `.janissary/logs/server.log` is left untouched ("An existing `.janissary/logs/server.log` left by an earlier version is never written, moved, or reaped" — `product/specs/cli.md:68`).
3. The instruction states that the branch's own `ai/tasks/workspace/start-application.md` and `stop-application.md` already carry these corrected instructions ("`--log <project-dir>/.janissary/logs/server/latest.log` is how a driver finds the address of the instance currently running" — `ai/tasks/workspace/start-application.md:117`).
4. The instruction is anchored to `product/specs/cli.md:52-72` and to the driver's comment and `readAppUrl` behavior, and does not describe an unwritten path as the active log ("`.janissary/logs/server/latest.log` is a symbolic link to the current run's log" — `product/specs/cli.md:70`).
5. Every other paragraph of the PR body, its section headings, and the `### Additional test cases` section are preserved byte-for-byte; the PR title is untouched.
6. The sole, explicitly named backlog entry is removed whole and `product/backlog/pull-request.md` is restored to the exact master comment-and-heading skeleton.

## Design decisions

- The PR description is the artifact corrected, not the base-branch files. The stale log path lives in three files on `origin/master`, which cannot be edited from this branch; this PR already contains the corrected copies of those files (subplan 4), so they become the base-branch copies on merge. The only stale text a tester reads while verifying this branch is in the description.
- A short, self-contained note is added at the head of **How to verify** rather than rewriting any existing numbered step, so no step number or other paragraph changes. It names the stable link as the read path and the legacy path as untouched, so no path this branch does not write is described as the active log.
- The body edit is applied after the push with `gh pr edit --body-file`, because a description is live on GitHub while a file edit is not published until pushed (Step 8.5 of `work-pull-request-issue.md`). The full body is reconstructed from `gh pr view --json body` with only this insertion, since `gh pr edit` replaces the body wholesale.

## Preserved behavior

1. The driver reads the `__JANUS_URL__` line from the log path given to `--log` and never from a hard-coded location; it must not start reading a different path. Test: `scripts/server-log.test.mjs` "names a log localhost followed by the ISO timestamp" pins the per-run name behind `latest.log`.
2. The launcher writes per-run logs under `.janissary/logs/server/` and leaves an existing legacy `.janissary/logs/server.log` alone; it must not write or reap that legacy file. Test: `scripts/janus-launcher.test.mjs` "writes a failed launch's log under .janissary/logs/server and relays its tail".
3. `latest.log` stays a symbolic link to the current run's bare filename, repointed only after readiness. Test: `scripts/janus-launcher-per-run.test.mjs` "keeps latest.log on the earlier run until the new server prints its readiness marker".

## Assumptions

1. `product/specs/cli.md:52` states the launcher redirects output to "a new `.janissary/logs/server/localhost-<stamp>.log`" and `:70` states "`latest.log` is a symbolic link to the current run's log", so the link is the stable read path.
2. `scripts/e2e-driver.mjs:4` shows `--log <project-dir>/.janissary/logs/server/latest.log` and `scripts/e2e/session.mjs:44-51` `readAppUrl` scans the supplied log for the URL marker, anchoring the driver half of the instruction.
3. `ai/tasks/workspace/start-application.md:117` already says "`--log <project-dir>/.janissary/logs/server/latest.log` is how a driver finds the address", so the branch's own start and stop tasks need no edit.
4. `gh pr view ... --json body` returns the current body verbatim and `gh pr edit --body-file` replaces it wholesale, so the revised body must be written in full with every other character unchanged (Step 8.5).
5. `git show origin/master:product/backlog/pull-request.md` is the exact skeleton the drained file must be restored to, and it is the sole entry in this branch's backlog.

## Existing functionality

1. The per-run server log and `latest.log` link the launcher maintains (`bin/janus.mjs:103-128`; `bin/server-log.mjs:9-29`).
2. The driver's `--log` option and the URL-marker reader (`scripts/e2e-driver.mjs:4`, `scripts/e2e/session.mjs:44-51`).
3. The spec sentences naming the per-run log, the link, and the untouched legacy log (`product/specs/cli.md:52`, `:68`, `:70`).
4. The branch's corrected start and stop tasks in `ai/tasks/workspace/start-application.md:62-69` and `:115-117`.
5. The `### Additional test cases` section already present in the PR body, which must be preserved verbatim.

## Implementation steps

1. **PR description, applied after the push.** Add one short paragraph at the head of the **How to verify** section of pull request #2203, immediately after its heading and before `**Setup**`: "**Read the address from `latest.log`, not the old shared log.** The base copies of `ai/tasks/workspace/start-application.md`, `ai/tasks/workspace/stop-application.md`, and `ai/guidelines/sandbox-e2e-browser.md` name `.janissary/log/server.log` as the launcher log and the driver's `--log` source; this branch never writes that path. While verifying this branch, read the `__JANUS_URL__` line and app address from `<project-dir>/.janissary/logs/server/latest.log` and pass that same path to the e2e driver's `--log` (`scripts/e2e-driver.mjs:4`; `scripts/e2e/session.mjs:44-51`, where `readAppUrl` scans the given log). The per-run logs are `localhost-<stamp>.log` beside it, and a legacy `.janissary/logs/server.log` is left untouched (`product/specs/cli.md:52-72`). The branch's own `ai/tasks/workspace/start-application.md` and `ai/tasks/workspace/stop-application.md` already carry these corrected instructions." Write the full revised body to `./temp/pr-body.md` and apply it with `gh pr edit https://github.com/thirtysixthspan/janissary/pull/2203 --body-file ./temp/pr-body.md` after the push; leave the title and every other paragraph untouched. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Plan and backlog.** Move this plan from `draft/` to `ready/`, then to `complete/`, and remove the sole, explicitly named entry whole from `product/backlog/pull-request.md`, restoring the file to the exact master comment-and-heading skeleton. Commit and push both files to `feat/server-log-per-run`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. Only PR prose and plan/backlog files change; no command, flag, key binding, or UI surface is affected.

## Tests

No tests added. This plan changes no application behavior and introduces no code, so there is nothing to unit-test. The behavior the added note describes is already pinned by `scripts/janus-launcher-per-run.test.mjs` "keeps latest.log on the earlier run until the new server prints its readiness marker" and `scripts/janus-launcher.test.mjs` "writes a failed launch's log under .janissary/logs/server and relays its tail", and `$janissary/scripts/run.mjs check-diff` runs those suites to confirm no regression.

## Out of scope

- Any source, test, spec, config, help, or user/developer documentation change.
- Editing the base-branch copies of `start-application.md`, `stop-application.md`, or `sandbox-e2e-browser.md` on `origin/master`, and editing this branch's already-correct copies.
- The PR title and every PR body paragraph other than the added verification note, including the `### Additional test cases` section.
- Merging or closing the pull request, or force-pushing.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **Reading check.** Run `gh pr view https://github.com/thirtysixthspan/janissary/pull/2203 --json body` and confirm the **How to verify** section opens with a note directing the verifier to `<project-dir>/.janissary/logs/server/latest.log` for the address and the driver's `--log`, naming the `localhost-<stamp>.log` per-run logs and the untouched legacy `.janissary/logs/server.log`, and pointing at the branch's own corrected start/stop tasks. Confirm every other paragraph, the section headings, and the `### Additional test cases` section are unchanged, and that the repo diff contains only this plan file and the removal of the sole backlog entry, with the backlog restored to its exact comment-and-heading skeleton.
