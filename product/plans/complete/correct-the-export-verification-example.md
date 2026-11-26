# Correct the export verification example to match the clash rule

**Complexity: 1/10** — no production lines added, no production files edited, no behavioral requirements, no test scenarios and no new units (p=1.578); only one paragraph of prose in the pull request body changes.

## Goal

The pull request's "How to verify" step 3 asks the reviewer to export after the setup fixture has left `Host web1 web2` as literal aliases outside any managed section while the catalog holds both `web1` and `web2`. The step claims one host is exported and one is skipped. The code skips both saved hosts and appends a header-only section, so a reviewer following the step sees a different report and can conclude the clash rule is broken. This fix rewrites that one Expect paragraph to state the outcome the code actually produces, keeping the fixture and every other paragraph of the description untouched. No application behavior changes.

## Requirements

1. The setup fixture keeps `Host web1 web2` outside any managed section and the catalog holds both `web1` and `web2` ("keep the fixture and change the expectation to the two-skip report and an empty section").
2. How-to-verify step 3 expects the report `No hosts to export; skipped 2.` ("keep the fixture and change the expectation to the two-skip report and an empty section").
3. How-to-verify step 3 expects the appended managed section to hold only its header comment, with no `Host`, `HostName`, `User` or `Port` lines ("an empty section").
4. Every other paragraph of the pull request body stays byte-for-byte as the author wrote it ("Preserve every other description paragraph byte for byte").
5. The body edit is applied only after the branch commit is pushed ("apply the body edit only after any branch commit is pushed").
6. No source file changes ("no source file needs to change").

## Design decisions

- Keep the fixture rather than change it. The cited test case `skips a literal alias outside the section but writes one that appears only inside` uses a different fixture, so rewriting step 1 would make the walk no longer match the rest of the description.
- Derive the expected report from the code, not from the cited test's one-skip string. `exportSummary` in `src/plugins/hosts/export-ssh.ts:12-17` returns `No hosts to export${skippedPart}.` when `exported === 0`, and with both catalog hosts filtered out `exportedHosts` (`:19-21`) leaves `skipped` at 2.
- Derive the empty section from `outsideLiteralAliases` in `src/plugins/hosts/ssh-config/section.ts:55-69` and `serializeManagedSection` (`:81-96`): the two saved names are literal aliases outside the markers, no host survives the filter, so the serializer writes only `BEGIN`, `HEADER` and `END`, and `spliceManagedSection` (`:98-102`) appends it because no range exists.
- Only the named Expect paragraph changes. Its Do line, the closing sentences about publishing and the button's intent that stay accurate, and every other step, example and note keep their exact wording.
- The description is a live GitHub artifact, so the edit lands after the push of the commit that records the fix.

## Preserved behavior

1. Export still skips a saved host whose name is a literal alias outside the managed section and counts it in the `; skipped N` clause. It must not start exporting such a host to satisfy the example. Test: `src/plugins/hosts/export-ssh.test.ts` "skips a literal alias outside the section but writes one that appears only inside".
2. Export still writes a header-only managed section when no saved host survives the filter. It must not insert placeholder `Host` lines. Test: `src/plugins/hosts/export-ssh.test.ts` "empties an existing section with no saved hosts and creates nothing without one".
3. The zero-host-with-skips wording is still `No hosts to export; skipped N.`. It must not be softened to the plain `No hosts to export.`. Test: `src/plugins/hosts/export-ssh.test.ts` "reports one, several, and zero hosts with the exact singular, plural, and empty wording".

## Assumptions

1. The step-1 fixture is authoritative: `Host web1 web2` stays outside any managed section and the catalog holds `web1` and `web2` (invocation: "KEEP the step-1 fixture").
2. `exportedHosts` compares each saved name against every outside alias with `sameHostName`, so the literal `web1` and `web2` outside the section clash with the two saved hosts: `src/plugins/hosts/export-ssh.ts:19-21`.
3. `outsideLiteralAliases` collects only names that pass `isLiteralName`, so `web1` and `web2` count while the `db*` and `*` patterns do not: `src/plugins/hosts/ssh-config/section.ts:55-69`.
4. `serializeManagedSection([])` produces exactly `BEGIN`, `HEADER` and `END` with no blank host blocks: `src/plugins/hosts/ssh-config/section.ts:81-96`.
5. `gh pr edit --body-file` replaces the body wholesale, so preserving every unchanged paragraph is the editor's responsibility (work-pull-request-issue.md Step 8.5).

## Existing functionality

1. The summary formatter `exportSummary` in `src/plugins/hosts/export-ssh.ts:12-17`, which owns the exact `No hosts to export; skipped 2.` wording.
2. The clash filter `exportedHosts` in `src/plugins/hosts/export-ssh.ts:19-21`.
3. The outside-alias collector `outsideLiteralAliases` in `src/plugins/hosts/ssh-config/section.ts:55-69`.
4. The header-only serializer `serializeManagedSection` in `src/plugins/hosts/ssh-config/section.ts:81-96`.
5. The existing cases in `src/plugins/hosts/export-ssh.test.ts:98-133,179-214,216-251` that pin the one-skip report, the zero-host-with-skip wording and the header-only section.

## Implementation steps

The branch carries no source change. The repository edits are this plan and the removal of the resolved backlog entry, committed and pushed first; the live description is edited only after that push.

1. **Record the fix and clear its backlog entry.** Move the rated plan from `./product/plans/ready/` to `./product/plans/complete/`, and remove the resolved entry whole from `./product/backlog/pull-request.md` while leaving the other two entries byte-for-byte. Commit with a Conventional Commits subject and push to the same head branch. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Rewrite the Expect paragraph of How-to-verify step 3 in the pull request body, after the push.** Keep the Do line and every other step, example, note and paragraph byte-for-byte. In that paragraph, replace the one-export/one-skip claim with `No hosts to export; skipped 2.`, naming both `web1` and `web2` as literal aliases outside the section and pointing at `exportedHosts` and `outsideLiteralAliases`. Replace the claim that the block holds `Host`, `HostName`, `User` and `Port` lines with the header-only block, keeping the markers, the header comment text and the "every byte above it unchanged" clause. Keep the closing sentences about publishing and the button's intent as they are. Write the complete revised body to `./temp/pr-body.md` and apply it with `gh pr edit <reference> --body-file ./temp/pr-body.md`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user interface surface changes: the two buttons, their labels and their placement stay as they are.
2. The only reader-visible change is the wording of one Expect paragraph in the pull request description.

## Tests

None, and none possible: the artifact is prose in a live pull request body, and the change introduces no code. `exportSummary`, `exportedHosts` and `outsideLiteralAliases` are already pinned by the existing cases in `src/plugins/hosts/export-ssh.test.ts`, which stay untouched and keep passing.

## Out of scope

- The step-1 fixture stays exactly as written: `Host web1 web2` remains a literal alias outside any managed section and the catalog still holds `web1` and `web2`.
- No source file, test, spec, help page, or user or developer documentation change.
- No other paragraph of the pull request body, including the Behavior examples and the import example gloss, changes.
- No change to the feature's own plan or to the other two pull request backlog entries.

## Verification

`$janissary/scripts/run.mjs check-diff` passes; with no code touched it proves no regression, not the substance of the fix. The manual check is reading-based: read How-to-verify step 3 in the pull request body alongside `exportSummary` and `exportedHosts` in `src/plugins/hosts/export-ssh.ts` and `outsideLiteralAliases` and `serializeManagedSection` in `src/plugins/hosts/ssh-config/section.ts`. Confirm the Expect paragraph states `No hosts to export; skipped 2.`, that both saved hosts are skipped by the clash filter, that the appended block holds only `# BEGIN janissary hosts`, the header comment and `# END janissary hosts`, and that every other paragraph of the body is unchanged from the author's original.
