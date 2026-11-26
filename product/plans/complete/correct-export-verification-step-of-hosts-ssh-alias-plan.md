# Correct the export verification step of the hosts ssh alias plan

**Complexity: 1/10** — 0 production lines, 0 files edited, 0 new units; a single-line documentation correction (p=1.58)

## Goal

The completed plan `import-openssh-aliases-into-the-hosts-tab.md` asks a reader to verify Export with the fixture from its step 1 and promises `Exported 1 host to ~/.ssh/config; skipped 1.` with a section holding `web1`. That walkthrough cannot be performed: the fixture leaves both `web1` and `web2` as literal `Host` aliases outside the managed section, while both are saved hosts after Import, so the clash rule skips both. Correct verification step 3 so the reader sees the report and section shape the code actually produces, without changing the fixture or any application behavior.

## Requirements

1. Verification step 1's fixture and saved `web2` stay unchanged ("KEEP the step-1 fixture").
2. Verification step 3's expected feed text becomes `No hosts to export; skipped 2.` ("change verification step 3's expected result to `No hosts to export; skipped 2.`").
3. Verification step 3 describes the appended section as header-only, with the BEGIN line, the header comment, and the END line but no host entries, and says the bytes above it are unchanged ("with a header-only appended section").
4. Verification step 3 explains that both `web1` and `web2` are literal aliases outside the section, so the clash rule skips both saved hosts ("to match the clash rule").
5. No other line of `product/plans/complete/import-openssh-aliases-into-the-hosts-tab.md` and no other completed plan changes ("Touch no other line of that plan and no other completed plan").
6. No production or test file changes ("Make no production or test change").

## Design decisions

- Keep the step-1 fixture and change the expected result, rather than narrowing the fixture so only `web2` is a literal alias outside the section. The same fixture drives verification step 2, whose `Imported 1 host from ~/.ssh/config; skipped 2.` report and resulting rows are already correct; narrowing the fixture would break that step.
- Derive the step's wording from the code instead of from the plan's current prose: `exportSummary` builds the report, `exportedHosts` applies the clash filter, `outsideLiteralAliases` decides which names clash, and `serializeManagedSection` builds the header-only section.
- Introduce no new test. The behavior is already pinned by the existing export test cases, and tests of documentation are not introduced.

## Preserved behavior

1. The exact all-skipped export wording stays what the code produces. Export must keep reporting `No hosts to export; skipped <n>.` when every saved host is skipped; pinned by `src/plugins/hosts/export-ssh.test.ts` › `reports one, several, and zero hosts with the exact singular, plural, and empty wording`.
2. A clash skips only literal aliases outside the managed section. A saved host whose name is a pattern, or one whose name appears only inside the section, must still be exported; pinned by `src/plugins/hosts/export-ssh.test.ts` › `skips a literal alias outside the section but writes one that appears only inside`.

## Assumptions

1. `src/plugins/hosts/export-ssh.ts:14` ``if (exported === 0) return `No hosts to export${skippedPart}.`;`` and `:13` ``const skippedPart = skipped === 0 ? '' : `; skipped ${skipped}`;`` make two skipped saved hosts report `No hosts to export; skipped 2.`.
2. `src/plugins/hosts/export-ssh.ts:20` `catalog.filter((host) => outsideAliases.every(` skips a saved host named by any outside alias, so both `web1` and `web2` are skipped with the step-1 fixture.
3. `src/plugins/hosts/ssh-config/section.ts:61` `if (!isLiteralName(name)) continue;` means the two names on `Host web1 web2` are both outside literal aliases, while `db*` is not.
4. `src/plugins/hosts/ssh-config/section.ts:87` `const lines = [BEGIN, HEADER];` and `:94` `lines.push(END);` make an empty export serialize to a header-only section.
5. `src/plugins/hosts/export-ssh.test.ts:207` the `skipped` fixture already asserts the `; skipped 1.` form, so the existing cases cover the wording without an edit.

## Existing functionality

1. `src/plugins/hosts/export-ssh.ts:12` `exportSummary` builds the success report from exported and skipped counts.
2. `src/plugins/hosts/export-ssh.ts:19` `exportedHosts` filters the catalog against outside aliases.
3. `src/plugins/hosts/ssh-config/section.ts:55` `outsideLiteralAliases` lists literal names outside managed sections.
4. `src/plugins/hosts/ssh-config/section.ts:81` `serializeManagedSection` serializes a section, including when the host list is empty.
5. `src/plugins/hosts/ssh-config/section.ts:98` `spliceManagedSection` appends that section after the last line when no complete section exists.
6. `src/plugins/hosts/export-ssh.test.ts` holds the existing cases for the summary wording and for clash skipping.

## Implementation steps

Each step ends green under `$janissary/scripts/run.mjs check-diff`.

1. Edit only verification step 3 of `product/plans/complete/import-openssh-aliases-into-the-hosts-tab.md`. Replace the expected `Exported 1 host to ~/.ssh/config; skipped 1.` and section-holding-`web1` claim with `No hosts to export; skipped 2.` and a header-only appended section. State that both `web1` and `web2` are literal aliases outside the section, so both saved hosts are skipped, and that every byte above the section is unchanged. Adjust the follow-up delete-`web1` sentence to match: with only the clashing `web2` left, the report is `No hosts to export; skipped 1.` and the section stays header-only. Change no other line of that file and no other completed plan. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Leave every source and test file untouched. The existing cases in `src/plugins/hosts/export-ssh.test.ts` keep passing as they are. Build and check with `$janissary/scripts/run.mjs check-diff`.

## User interface

1. No user interface surface changes. This is a correction to one verification step in a completed plan; no component, style, command, flag, or key binding changes.

## Tests

The plan changes no application behavior and adds no code, so no tests are introduced. The existing `src/plugins/hosts/export-ssh.test.ts` cases `reports one, several, and zero hosts with the exact singular, plural, and empty wording` and `skips a literal alias outside the section but writes one that appears only inside` must keep passing untouched (Requirements 2 and 4, Preserved behavior 1 and 2). Tests of documentation are not introduced.

## Out of scope

- Changing verification step 1's fixture or verification step 2's expected report.
- Changing requirement 43 of the completed plan, any other line of that plan, or any other completed plan.
- Changing the pull request description; that repair is already published.
- Any production, test, spec, or help-page change.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then check by reading:

1. Open `product/plans/complete/import-openssh-aliases-into-the-hosts-tab.md` at verification step 3. The feed should read `No hosts to export; skipped 2.`, the section should be header-only, and the step should say both `web1` and `web2` are skipped because they are literal aliases outside the section. Failure looks like the old `Exported 1 host ...; skipped 1.` text, a section holding `web1`, or an altered step 1.
2. Open `src/plugins/hosts/export-ssh.ts` and confirm `exportSummary` produces `No hosts to export; skipped 2.` when zero hosts are exported and two are skipped, and that `exportedHosts` skips both saved hosts. Open `src/plugins/hosts/ssh-config/section.ts` and confirm `outsideLiteralAliases` treats both names on `Host web1 web2` as outside literal aliases and `serializeManagedSection` writes only the BEGIN, header comment, and END lines for an empty host list. Failure looks like a report or section shape that disagrees with step 3.
3. Run `git diff` and confirm the only change to the completed plan is verification step 3, and that no production, test, spec, or help file changed. Failure looks like any other edited line or file.
