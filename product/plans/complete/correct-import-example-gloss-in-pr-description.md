# Correct the hosts import example gloss in the PR description

**Complexity: 1/10** — 0 production lines and files, 6 requirements, 0 scenarios (p=2.95)

## Goal

The pull request body's "Behavior examples" block glosses the `hosts import` transcript as `web1 added, bad and db* skipped`. That is misleading: `db*` is a Host pattern the reader never lists as an alias, and the second counted skip is `web2`, the saved host that import refuses to replace. The goal is to correct that one comment so it names the two records the fixture actually skips and says plainly that `db*` is a pattern, never an alias. Nothing in the code, tests, or other description paragraphs changes.

## Requirements

1. The gloss names `bad` as skipped for its invalid user, per "bad for the invalid user".
2. The gloss names `web2` as skipped for clashing with the saved host, per "web2 for the clash with the saved host".
3. The gloss notes that `db*` is a pattern and never an alias, per "while noting that `db*` is a pattern and never an alias".
4. The transcript lines, their anchors, and every other description paragraph stay byte for byte, per "Keep the transcript lines, their anchors, and every other description paragraph byte for byte".
5. The body edit is applied only after the branch commit is pushed, per "apply the body edit only after any branch commit is pushed".
6. No source file or test changes, per "no source file needs to change and the existing test must keep passing untouched".

## Design decisions

- The correction targets a live GitHub PR body, not a file in the tree, so it is applied with `gh pr edit --body-file` after the commit is pushed (requirement 5).
- `gh pr edit` replaces the body wholesale, so the full current body is read first and written to `./temp/pr-body.md` with only the comment line changed (requirement 4).
- The plan file and the removed backlog entry are the tracked changes that give Step 8 something to ship; the correction itself is not a commit.
- The existing import test already pins both skips, so no new test is added (requirement 6).
- The PR title is left alone and the PR stays open.

## Preserved behavior

1. Import still adds `web1`, skips `bad` and `web2`, and reports `Imported 1 host from ~/.ssh/config; skipped 2.`; it must not start importing the pattern `db*` or change the summary, and the case `adds the importable aliases in one write and leaves a clashing saved host unchanged` in `src/plugins/hosts/import-ssh.test.ts` must keep passing.
2. The alias reader still lists only literal Host names and treats `db*` and `*` as patterns; it must not start returning them as aliases, and the case `lists only literal names from Host lines` in `src/plugins/hosts/ssh-config/parse.test.ts` must keep passing.

## Assumptions

- The fixture in the body matches the test fixture at `src/plugins/hosts/import-ssh.test.ts:53-61`: `Host bad` with `User a@b`, `Host web1 web2` with `HostName %h.corp.example` and `Port 2222`, `Host db*` with `User dba`, and `Host *` with `User ops`.
- `readEffectiveAliases` drops non literal names at `src/plugins/hosts/ssh-config/parse.ts:190`, on the guard `if (!isLiteralName(name) || seen.has(key)) continue`.
- `isLiteralName` rejects `*`, `?`, and `!` names at `src/plugins/hosts/ssh-config/parse.ts:86-88`, so `db*` cannot be an alias.
- `web2` is saved before import at `src/plugins/hosts/import-ssh.test.ts:55`, which is why it is skipped rather than replaced.
- The PR remains OPEN with head branch `feat/hosts-ssh-alias-import-export` through Step 8.

## Existing functionality

- `gh pr view <url> --json body` reads the live body and `gh pr edit <url> --body-file` replaces it.
- The case `adds the importable aliases in one write and leaves a clashing saved host unchanged` at `src/plugins/hosts/import-ssh.test.ts:53` already pins the two skips and the summary text quoted in the transcript.
- `readEffectiveAliases` at `src/plugins/hosts/ssh-config/parse.ts:182` already separates literal aliases from patterns.

## Implementation steps

1. Confirm the exact comment line and its replacement against the reader and the import test, and make no source or test edit. Build command: `$janissary/scripts/run.mjs check-diff`, which stays green because nothing under `src/` or `web/src/` changed.
2. Remove the resolved entry from `./product/backlog/pull-request.md`, keeping its leading comment and `# pull-request` heading, and restore the exact skeleton when no entries remain. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Promote the plan from `./product/plans/ready/` to `./product/plans/complete/` with plain `mv`. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Commit the plan and backlog change with a Conventional Commits subject, then push to the existing head branch without rewriting history. Build command: `$janissary/scripts/run.mjs check-diff` before the commit.
5. After the push succeeds, read the current body, copy it into `./temp/pr-body.md`, change only the comment above the `hosts import` transcript to `web1 added; bad skipped for its invalid user and web2 skipped for clashing with the saved host; db* is a pattern and never an alias`, and apply it with `gh pr edit --body-file`. Build command: `$janissary/scripts/run.mjs check-diff` is not needed here because `temp/` is gitignored and no tracked file changes.

## UI design

1. The surface is the fenced "Behavior examples" block of the PR description, not any screen in the app.
2. One comment line changes from `# After — import every usable alias from ~/.ssh/config (web1 added, bad and db* skipped)` to a gloss naming `bad` and `web2` as the two skips and stating that `db*` is a pattern and never an alias.
3. The `$ hosts import` line, the `Imported 1 host from ~/.ssh/config; skipped 2.` line, and the two anchor lines beneath them are copied verbatim.
4. Every other paragraph of the body, including the export examples, the refusals, and the "How to verify" section, is copied verbatim.

## Tests

This plan changes no application behavior and adds no code, so no new tests are introduced, and tests of documentation are not introduced. The existing case `adds the importable aliases in one write and leaves a clashing saved host unchanged` in `src/plugins/hosts/import-ssh.test.ts` and the case `lists only literal names from Host lines` in `src/plugins/hosts/ssh-config/parse.test.ts` must keep passing untouched.

## Out of scope

- No source, test, CSS, spec, help page, or user and developer documentation change.
- No change to the transcript lines, their anchors, or any other description paragraph.
- No change to the PR title, no merge, no close, no replacement PR, and no force push.
- No new test and no change to how import counts skips.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and require it green. Then read the body with `gh pr view <url> --json body` and confirm the `hosts import` comment names `bad` for its invalid user and `web2` for the clash with the saved host and says `db*` is a pattern and never an alias; confirm the `$ hosts import` transcript, its `Imported 1 host from ~/.ssh/config; skipped 2.` line, and its anchor lines are unchanged; and confirm every other paragraph matches the pre edit body byte for byte. Run `git diff` to confirm no source or test file was touched. Finish with `gh pr view <url> --json state,headRefName,headRefOid,url` and confirm the PR is OPEN, the head branch is `feat/hosts-ssh-alias-import-export`, and `headRefOid` equals `git rev-parse HEAD`. A wrong gloss, a changed transcript line, a source diff, or a mismatched OID means the work is not done.
