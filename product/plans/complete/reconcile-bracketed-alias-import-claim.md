# Reconcile the bracketed ssh alias claim across the description, plan, and tests

**Complexity: 1/10** — no production code or files edited, 8 requirements, 1 new test scenario (p=3.38)

## Goal

The pull request description's edge-case 10 and the completed plan's verification step 6 claim that a bracketed `Host [::1]` alias takes its own stored values after Import. The shipped code does not do that: `readEffectiveAliases` resolves the bracketed alias's own `HostName`, `User` and `Port`, but `importSshHosts` then rejects the alias because its name and destination fail the saved-host rules, so Import skips it and writes no row. This fix keeps that behavior and corrects the two prose claims, pins the skip with a test, and leaves the reader's escaping and complexity caps alone, so a reader following the documented verification no longer expects a row the code cannot produce.

## Requirements

1. A bracketed `Host [::1]` alias is resolved by the reader with its own `HostName`, `User` and `Port` ("the reader resolves the bracketed alias's own HostName, User and Port").
2. Import skips that alias because its name and destination fail the saved-host rules ("Import skips it because its name and destination fail the saved-host rules").
3. The pull request description's edge-case 10 states both the reader resolution and the Import skip ("rewrite that description example ... to say the reader resolves ... but Import skips it ...").
4. The canonical plan's verification step 6 states both the reader resolution and the Import skip ("rewrite ... the plan's verification step to say ...").
5. A case in `src/plugins/hosts/import-ssh.test.ts` pins the skip with the incremented skipped count ("add a case in src/plugins/hosts/import-ssh.test.ts pinning that skip with the incremented skipped count").
6. The escaping in `src/plugins/hosts/ssh-config/parse.ts` stays unchanged ("Leave the escaping ... unchanged").
7. The complexity caps in `src/plugins/hosts/ssh-config/pattern-limits.ts` stay unchanged ("Leave the ... complexity caps ... unchanged").
8. Saved-host validation is not changed and accepted names are not broadened (decision: "keep the current behavior ... Do not change validation or broaden accepted names").

## Design decisions

- Keep the current behavior: a bracketed name is not a valid saved-host name, so Import skips it rather than broadening `NAME_PATTERN`. The reviewer's proposal offered two paths; the settled decision keeps the skip and corrects the prose.
- The reader behavior is already correct and already tested; only the description's and plan's wording are wrong, so no production code is changed.
- The bracketed alias's destination also fails the saved-host name rules, so naming both the alias and its destination in the corrected wording is accurate.
- The canonical completed plan is edited only at verification step 6, under the orchestrator's explicit extension of the allowed-edit list; no other completed plan is touched.
- The pull request description is a live GitHub artifact. It is corrected only after the commit is pushed, and every other paragraph of the body is preserved byte for byte.
- No command, flag, or key binding changes, so no `help/` page is edited, and no `documentation/user-documentation/` or `documentation/developer-documentation/` page is edited.
- The functional spec already describes the reader correctly; a short clarification there ties the reader's resolution to Import's skip so the spec reflects the settled behavior.

## Preserved behavior

1. The reader still resolves a bracketed alias's own `HostName`, `User` and `Port` from its block. The correction must not change `parse.ts` escaping or `pattern-limits.ts` caps. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › `matches a bracketed IPv6-style alias to its own block`.
2. An over-long or star-heavy `Host` pattern still contributes no settings and cannot throw out of the reader. The corrected wording must keep that claim. Pinned by `src/plugins/hosts/ssh-config/parse.test.ts` › `refuses an over-long Host pattern without applying its settings`.
3. Import still writes every accepted alias in one catalog write and counts each skip. The new test must not change the import operation itself. Pinned by `src/plugins/hosts/import-ssh.test.ts` › `adds the importable aliases in one write and leaves a clashing saved host unchanged`.

## Assumptions

1. Saved-host names admit only letters, digits, dot, underscore and hyphen: `src/plugins/hosts/hosts-values.ts:14` `const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;`. A bracketed name and a colon-bearing destination both fail it.
2. Import routes each alias through that validation: `src/plugins/hosts/import-ssh.ts:23` `const validated = validateHostFields(`, whose failure makes `acceptedHost` return `undefined` and increments the skip count at `src/plugins/hosts/import-ssh.ts:56`.
3. The reader's bracketed-name resolution is already proved: `src/plugins/hosts/ssh-config/parse.test.ts:263` `matches a bracketed IPv6-style alias to its own block`.
4. The literal-name escaping that must stay unchanged is `src/plugins/hosts/ssh-config/parse.ts:92` `function escapeLiteralMetacharacters(`.
5. The complexity caps that must stay unchanged are in `src/plugins/hosts/ssh-config/pattern-limits.ts:1` `export function isHostPatternTooComplex(`.
6. The named work item is the first entry in the branch backlog, so that entry is removed on resolution per the task's Step 7.

## Existing functionality

1. Effective alias resolution already exists: `src/plugins/hosts/ssh-config/parse.ts:182` `export function readEffectiveAliases(`.
2. Saved-host field validation already exists: `src/plugins/hosts/hosts-values.ts:60` `export function validateHostFields(`.
3. Import already counts skipped aliases and builds the summary clause: `src/plugins/hosts/import-ssh.ts:32` `function importSummary(`.
4. The canonical plan's verification step is at `product/plans/complete/import-openssh-aliases-into-the-hosts-tab.md:217`, and the description's edge-case 10 is in the live pull request body.
5. The functional spec's literal-metacharacter section is at `product/specs/ssh-config-host-patterns.md:8`.

## Implementation steps

1. Add one case to `src/plugins/hosts/import-ssh.test.ts` that feeds a bracketed `Host [::1]` alias with its own `HostName`, `User` and `Port` alongside one ordinary importable alias, and asserts the ordinary host is written, the bracketed alias is absent, the skipped count is incremented to 1, and the summary carries `; skipped 1.`. Use the file's existing temp-directory helpers and mocked writes. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Rewrite verification step 6 of `product/plans/complete/import-openssh-aliases-into-the-hosts-tab.md` so it says the reader resolves the bracketed alias's own `HostName`, `User` and `Port`, but Import skips it because its name and destination fail the saved-host rules, so the skipped count rises and no row is written for it; keep the over-long-name sentence. Touch no other line of that plan. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. Add one sentence to `product/specs/ssh-config-host-patterns.md` § Literal names with metacharacters, recording that a bracketed alias whose values the reader resolves is still skipped by Import because its name and destination are not valid saved-host values. Build and check with `$janissary/scripts/run.mjs check-diff`.
4. Move this plan from `./product/plans/ready/` to `./product/plans/complete/` and remove the resolved first entry from `./product/backlog/pull-request.md`, leaving the second entry byte for byte. Build and check with `$janissary/scripts/run.mjs check-diff`.
5. Commit and push to the existing head branch, then correct edge-case 10 in the live pull request body with `gh pr edit --body-file`, preserving every other paragraph exactly. Verify the PR is still open on the same head after the push.

## UI design

None. No user interface surface is added or changed: the two existing buttons, their labels, their placement, and their empty-state visibility are untouched.

## Tests

- `src/plugins/hosts/import-ssh.test.ts`: one new case (Requirement 5) pins that a bracketed `Host [::1]` alias with its own settings is skipped while an ordinary alias imports, asserting the incremented skipped count and the `; skipped 1.` summary clause. Requirement 1's reader resolution stays covered by the existing `parse.test.ts` bracketed cases and is not duplicated here. Requirements 6 and 7 stay covered by the existing over-long, star-heavy, negated and bracketed cases in `parse.test.ts`.

## Out of scope

- Changing `validateHostFields`, `NAME_PATTERN`, or the set of accepted saved-host names.
- Editing the escaping in `src/plugins/hosts/ssh-config/parse.ts` or the caps in `src/plugins/hosts/ssh-config/pattern-limits.ts`.
- Editing any completed plan other than verification step 6 of `product/plans/complete/import-openssh-aliases-into-the-hosts-tab.md`.
- Editing `documentation/user-documentation/` or `documentation/developer-documentation/`, or any `help/` page.
- Changing the pull request title or any pull request body paragraph other than edge-case 10.
- Merging, closing, or replacing the pull request, or force-pushing its branch.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then perform this reading-based check, since the change adds no application behavior:

1. Read edge-case 10 in the live body with `gh pr view https://github.com/thirtysixthspan/janissary/pull/2242 --json body`, verification step 6 of `product/plans/complete/import-openssh-aliases-into-the-hosts-tab.md`, the new case in `src/plugins/hosts/import-ssh.test.ts`, and § Literal names with metacharacters of `product/specs/ssh-config-host-patterns.md`. Each should say the reader resolves the bracketed alias's own `HostName`, `User` and `Port` but Import skips it because its name and destination fail the saved-host rules, with no row written and the skip counted. A failure is any remaining claim that the bracketed alias takes its own stored values after Import.
2. Run `git diff -- src/plugins/hosts/ssh-config/parse.ts src/plugins/hosts/ssh-config/pattern-limits.ts` and `git diff -- src/plugins/hosts/hosts-values.ts`. Each should be empty, showing the escaping, complexity caps, and validation were left unchanged.
