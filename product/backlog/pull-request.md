<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the functionality gap in profile restores for labels that need quoting.

Existing Issue: `openProfileFiles` serializes a profile's `in` value verbatim, so a value such as `review team` reaches the command parser as label `review` plus trailing path `team` instead of one label, although `files in` now accepts a fully quoted multiword label. Severity: 5/10

Existing Risk: 5/10 - A profile can open the wrong subdirectory or report a missing-label error instead of restoring its navigator when `in` targets a label with spaces or quotes.

Proposal Risk: 2/10 - Quoted labels can still fail when a profile refers to a stale alias or a tab that is no longer open, which remains the ordinary `files in` error path.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "quote profile file-navigator in labels". Update `src/profile/files.ts` to serialize `entry.in` as one parser-compatible token, quoting labels that contain whitespace or quote characters and escaping embedded double quotes while leaving safe one-word labels unchanged. Add cases in `src/profile/files.test.ts` for labels with spaces and embedded quotes, and verify the generated command parses back to the original label. Clarify in `product/specs/profiles.md` that the profile stores the plain label and command construction quotes it as needed. Keep the existing profile path-quoting and tree-restore coverage.
