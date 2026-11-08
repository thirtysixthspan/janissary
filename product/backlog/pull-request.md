<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the command spec's claim that a malformed individual entry makes the effective file read-only.

Existing Issue: The command spec says malformed entries make the file read-only, while the settings plan and implementation allow edits that rewrite and clean those entries. Severity: 5/10

Existing Risk: 4/10 - Contributors and users may believe an edit must be refused even though it succeeds, or later change the implementation to match the inaccurate spec and prevent intended cleanup.

Proposal Risk: 1/10 - Aligning the spec with the implemented save behavior leaves the malformed entry visible as default-enabled until a successful save cleans it, avoiding confusion without changing the protection for unusable whole files.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "correct the malformed-entry settings spec". In `product/specs/application-commands.md`, revise the malformed-entry paragraph to state that an individual malformed entry defaults both settings to true, does not make the file unusable for edits, and can be removed by a successful save; retain the read-only refusal statement only for malformed top-level files that make the effective file unusable. Check the file fallback and error-message wording against `src/native-commands/settings-file.ts` and `src/native-commands/manager.ts`; do not change the implementation, which matches `product/plans/complete/native-commands-02-settings.md`.
