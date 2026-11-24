# Point the e2e playbooks and driver example at logs/server/latest.log

**Complexity: 1/10** — 1 added comment line in 1 production file, 3 requirements, 1 preserved-reader scenario, no new units (p=3.26)

## Goal

Make the agent playbooks and the e2e-driver usage example read the app address through the new stable link instead of a log file that no longer exists. The driver's `--log` option keeps taking a file path, and the reader still uses the last `__JANUS_URL__` line of whatever file it is given; no executable code changes. Source: `./product/plans/complete/server-log-per-run.md`. Depends on `./product/plans/ready/server-log-per-run-3-latest-log-symlink.md`, which makes `latest.log` exist and be repointed on readiness.

## Requirements

1. "The e2e driver's `--log` keeps taking a file" (user answer: "latest.log symlink"). [Source R13]
2. "the playbooks pass `<project-dir>/.janissary/logs/server/latest.log`" (user answer: "latest.log symlink"). [Source R13]

## Design decisions

- Replace each old server-log path in the named playbooks and in the driver's header comment with `<project-dir>/.janissary/logs/server/latest.log`. This covers `<project-dir>/.janissary/log/server.log`, `<project-dir>/.janissary/logs/server.log`, the inventory spelling `log/server.log`, and the relative driver example `./temp/find-bugs/work/.janissary/log/server.log`, which becomes `./temp/find-bugs/work/.janissary/logs/server/latest.log`. The link is a file from the reader's point of view, so the `--log` contract does not change (Assumptions 1–4).
- In `start-application.md`'s launcher description, say that the launcher redirects output to and polls the new run's `<project-dir>/.janissary/logs/server/localhost-<stamp>.log`, then repoints `latest.log` after the readiness marker. Do not describe `latest.log` as the launcher's output file or readiness input; subplans 2 and 3 own that distinction (Assumption 5).
- Leave `scripts/e2e-driver.mjs`'s argument parsing, `usage` string, and `readAppUrl(options.log)` call alone, and leave `scripts/e2e/session.mjs` alone. Only the example comment at the top of the driver changes (Assumptions 1–3).
- In `start-application.md` and `stop-application.md`, the inventories of what lives under `.janissary/` name `logs/server/` with its per-run `localhost-<stamp>.log` files and `latest.log`, rather than the old `log/server.log` entry (Assumptions 6 and 7).
- Keep `stop-application.md`'s instruction to read what the caller needs before the scratch root is removed. Name both `logs/server/latest.log` for a ready run and the per-run `localhost-<stamp>.log` files for a failed launch that never repointed the link; both remain inside the scratch root (Assumption 15).
- This is a documentation-only subplan: no application behavior changes and no executable code is added, so verification is a reading-based check.

## Preserved behavior

1. The e2e driver still reads the last `__JANUS_URL__` line of the log it is given. Negative assertion: reading through `latest.log` never returns a stale earlier marker while a newer marker is present, so a restarted app is addressed rather than its predecessor. Existing pin: `scripts/e2e/session.test.mjs:43` "reads the latest line, so a restarted app is addressed rather than the instance before it".

## Assumptions

1. `scripts/e2e-driver.mjs:43` `case '--log': { options.log = value(); break; }` stores the next argument as the log path without changing its file-path contract.
2. `scripts/e2e-driver.mjs:68` `const appUrl = options.appUrl ?? readAppUrl(options.log);` passes that path to the existing reader when no explicit URL is supplied.
3. `scripts/e2e/session.mjs:44` `export function readAppUrl(serverLogPath)` reads the caller-supplied path with `readFileSync`, so a symbolic-link path needs no reader change.
4. `scripts/e2e/session.mjs:47` `.findLast((candidate) => candidate.startsWith(URL_MARKER));` selects the newest `__JANUS_URL__` line in that file.
5. `product/plans/ready/server-log-per-run-2-per-run-launch-log.md:7` says "The launcher reads readiness and failure output only from that file", and `product/plans/ready/server-log-per-run-3-latest-log-symlink.md:7` says the link is "repointed only once the new server's own `__JANUS_URL__` line has appeared"; the launcher's per-run output file and the stable read link therefore have different roles.
6. `ai/tasks/workspace/start-application.md:46` lists `log/server.log` in the project-state inventory.
7. `ai/tasks/workspace/stop-application.md:41` lists "the server log at `log/server.log`" in the teardown inventory.
8. `scripts/e2e-driver.mjs:4` holds the `--log <project-dir>/.janissary/logs/server.log` example comment that is the only code-file edit.
9. `ai/tasks/research/find-bugs.md:79` passes `--log <project-dir>/.janissary/log/server.log` in its e2e-driver invocation.
10. `ai/tasks/fix-a-bug.md:135` passes `--log <project-dir>/.janissary/log/server.log` in its verify invocation.
11. `ai/tasks/workspace/start-application.md:42` says the launcher redirects output to and polls `<project-dir>/.janissary/log/server.log`.
12. `ai/tasks/workspace/start-application.md:66` passes the relative path `./temp/find-bugs/work/.janissary/log/server.log` to `--log`.
13. `ai/tasks/workspace/start-application.md:115` says the session token can be read from the `__JANUS_URL__` line in `<project-dir>/.janissary/log/server.log`.
14. `ai/tasks/workspace/start-application.md:117` names `--log <project-dir>/.janissary/log/server.log` as how a driver finds the current instance.
15. `ai/tasks/workspace/stop-application.md:43` says "`log/server.log` holds the server's stdout and stderr" and must be read before Step 2 removes the tree.
16. `ai/tasks/workspace/open-feature-pull-request.md:178` passes `--log <project-dir>/.janissary/log/server.log`.
17. `ai/tasks/feature/remove-an-existing-feature.md:196` passes `--log <project-dir>/.janissary/log/server.log`.
18. `ai/tasks/feature/test-pull-request.md:146` passes `--log <project-dir>/.janissary/log/server.log`.
19. `ai/guidelines/sandbox-e2e-browser.md:54` says the URL is recorded as a `__JANUS_URL__` line in `<project-dir>/.janissary/log/server.log`.
20. `scripts/e2e/session.test.mjs:43` "reads the latest line, so a restarted app is addressed rather than the instance before it" is the existing preserved-behavior pin.

## Existing functionality

1. The file-path `--log` option to reuse unchanged: `scripts/e2e-driver.mjs:43` `case '--log': { options.log = value(); break; }`.
2. The log-to-address reader to reuse unchanged: `scripts/e2e/session.mjs:44` `export function readAppUrl(serverLogPath)`.
3. The newest-marker selection to reuse unchanged: `scripts/e2e/session.mjs:47` `.findLast((candidate) => candidate.startsWith(URL_MARKER));`.
4. The preserved-behavior test: `scripts/e2e/session.test.mjs:43` "reads the latest line, so a restarted app is addressed rather than the instance before it".
5. The launcher address note to update in place: `ai/tasks/workspace/start-application.md:117` "`--log <project-dir>/.janissary/log/server.log` is how a driver finds the address of the instance currently running."
6. The teardown note to update in place: `ai/tasks/workspace/stop-application.md:43` "**Read what you need out of the log first.**"
7. The stable link delivered by required subplan 3: `product/plans/ready/server-log-per-run-3-latest-log-symlink.md:11` "`.janissary/logs/server/latest.log` is a symbolic link to the current run's server log".

## Implementation steps

Land this subplan only after subplans 2 and 3 have landed, so every documented path exists and the launcher/link distinction is real. The steps land in order and each leaves the tree green. `scripts/e2e-driver.mjs` is 96 lines and receives only a comment edit, so no extraction, import change, or lint suppression is needed.

1. **Replace the driver paths and URL-reading guidance.** In `ai/tasks/research/find-bugs.md`, `ai/tasks/fix-a-bug.md`, `ai/tasks/workspace/open-feature-pull-request.md`, `ai/tasks/feature/remove-an-existing-feature.md`, `ai/tasks/feature/test-pull-request.md`, and `ai/guidelines/sandbox-e2e-browser.md`, replace `<project-dir>/.janissary/log/server.log` with `<project-dir>/.janissary/logs/server/latest.log`. In `ai/tasks/workspace/start-application.md`, make the same replacement in the driver example at `:66`, the token/address note at `:115`, and the report note at `:117`; the relative example becomes `./temp/find-bugs/work/.janissary/logs/server/latest.log`. Leave that file's launcher description at `:42` and state inventory at `:46` for step 2. Keep the surrounding sentences, the one-connection-per-batch guidance, and the token-not-written-down rule exactly as they are (Requirement 2). Build command and green check: `$janissary/scripts/run.mjs check-diff`.
2. **Correct the launcher description, inventories, teardown note, and driver comment.** In `ai/tasks/workspace/start-application.md:42`, say that the launcher redirects stdout and stderr to `<project-dir>/.janissary/logs/server/localhost-<stamp>.log`, polls that per-run file for the `__JANUS_URL__ ` marker, and repoints `<project-dir>/.janissary/logs/server/latest.log` only after the marker appears; keep the remaining launch, timeout, and failure-relay description. In `ai/tasks/workspace/start-application.md:46` and `ai/tasks/workspace/stop-application.md:41`, replace the `log/server.log` inventory entry with `logs/server/` and describe its per-run `localhost-<stamp>.log` files plus `latest.log`; leave the activity-log entry `log/<YYYY-MM-DD>.json` unchanged. In `ai/tasks/workspace/stop-application.md:43`, keep the read-before-delete instruction and name `logs/server/latest.log` for a ready run plus the per-run files for a failed launch that never repointed the link. In `scripts/e2e-driver.mjs:4`, change only the `--log` example path to `<project-dir>/.janissary/logs/server/latest.log`, leaving the parser, `usage` string, `readAppUrl(options.log)` call, and `scripts/e2e/session.mjs` untouched (Requirements 1 and 2; Preserved behavior 1). Build command and green check: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user interface surface changes: this edits agent instruction files and one comment, with no component, CSS, key binding, or tab involved.
2. A reader following a playbook sees `--log <project-dir>/.janissary/logs/server/latest.log` in every e2e-driver invocation and sees `logs/server/` named in the `.janissary/` inventories.

## Tests

- No application tests are introduced or edited. These are instruction files and a comment, and the template says tests of documentation should not be introduced.
- The preserved behavior is pinned by the unchanged `scripts/e2e/session.test.mjs` "reads the latest line, so a restarted app is addressed rather than the instance before it"; `scripts/e2e-driver.test.mjs`, if present, is not changed because the driver's code is not changed.
- Verification is the reading-based check below.

## Out of scope

- No source code change to the e2e driver or session reader; `--log` still takes a file, and `readAppUrl` is untouched.
- No spec edits; subplan 5 owns those.
- No update to user documentation pages, which are owned by the documentation workflow rather than a feature plan.
- No change to how the app starts, stops, or names its logs.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. Read the eight named `ai/` files and the header comment of `scripts/e2e-driver.mjs`. Confirm no `.janissary/log/server.log` or `.janissary/logs/server.log` spelling remains in them, that each e2e-driver example passes `<project-dir>/.janissary/logs/server/latest.log`, that the two state inventories name `logs/server/` with per-run logs and `latest.log`, and that `stop-application.md` still tells the reader to take what it needs from the log before deleting the scratch root. A miss looks like an old path in a driver invocation or a teardown note that no longer mentions reading the log first. Also confirm `scripts/e2e/session.mjs` is byte-for-byte unchanged and that `scripts/e2e/session.test.mjs` still carries the "reads the latest line" case.
