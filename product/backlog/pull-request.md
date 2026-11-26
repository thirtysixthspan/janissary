<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the plan's export verification step, which expects one exported host where the documented fixture produces two skips.

Existing Issue: Verification step 3 of product/plans/complete/import-openssh-aliases-into-the-hosts-tab.md says Export reports `Exported 1 host to ~/.ssh/config; skipped 1.` and writes a section holding web1, but the step-1 fixture leaves `Host web1 web2` outside the section, so requirement 27's clash rule skips both saved hosts. Severity: 6/10

Existing Risk: 5/10 - The canonical plan's walkthrough cannot be performed as written, so the next implementer or reviewer treats the clash rule as misimplemented and may change correct code to make the scenario pass.

Proposal Risk: 2/10 - The step then describes the behavior the code has, with no production change; a later edit to the clash rule could stale the step again, which a test of the exact scenario would catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "correct verification step 3 of the hosts import/export plan to match the clash rule". Edit only verification step 3 of product/plans/complete/import-openssh-aliases-into-the-hosts-tab.md and touch no other line of that plan. Resolve it the same way as the description's How-to-verify step 3: either change the step-1 fixture so only web2 is a literal alias outside the managed section, matching the cited case `skips a literal alias outside the section but writes one that appears only inside` in src/plugins/hosts/export-ssh.test.ts, or keep the fixture and change the expected report to `No hosts to export; skipped 2.` with a header-only section. Derive the wording by tracing `exportedHosts` and `exportSummary` in src/plugins/hosts/export-ssh.ts and `outsideLiteralAliases` in src/plugins/hosts/ssh-config/section.ts, and add no production change. Verify by re-reading the plan step alongside those two modules and the test; the existing cases in src/plugins/hosts/export-ssh.test.ts cover the behavior and must keep passing untouched.


* Correct the pull request description's import example gloss, which names db* as a skipped alias.

Existing Issue: The "Behavior examples" comment says `web1 added, bad and db* skipped`, but `db*` is a Host pattern that the reader never lists as an alias, and the second skip counted in `Imported 1 host ...; skipped 2.` is the clashing saved host web2. Severity: 2/10

Existing Risk: 2/10 - A reader can take the gloss as proof that patterns increment the skipped count and misread how the summary number is produced.

Proposal Risk: 1/10 - The transcript and its anchors stay correct and only the gloss changes, so no code or behavior is at risk; the only residual risk is a future example drifting again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "correct the import example gloss so it names the clashing alias instead of the db* pattern". In the pull request body's "Behavior examples" block, change the comment on the `hosts import` transcript to name the two records the fixture actually skips: bad for the invalid user and web2 for the clash with the saved host, while noting that `db*` is a pattern and never an alias. Keep the transcript lines, their anchors, and every other description paragraph byte for byte, and apply the body edit only after any branch commit is pushed. Verify against `readEffectiveAliases` in src/plugins/hosts/ssh-config/parse.ts and the case `adds the importable aliases in one write and leaves a clashing saved host unchanged` in src/plugins/hosts/import-ssh.test.ts; no source file needs to change and the existing test must keep passing untouched.
