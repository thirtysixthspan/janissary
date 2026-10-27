<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Honor the plan's rule that partly quoted trailing paths remain verbatim.

Existing Issue: `targetValue` in `src/file-navigator/args.ts` unwraps any single token whose raw spelling differs from its parsed value, including a token with quotes opened mid-word; the plan says only a fully quoted trailing path is unwrapped and other trailing text keeps its quote marks. Severity: 3/10

Existing Risk: 3/10 - A path such as `my"folder"` is interpreted as `myfolder`, so `files` opens a different root or reports the intended directory missing.

Proposal Risk: 1/10 - The parser still has to distinguish quote syntax from literal quotes, but tests for partly and fully quoted paths can pin that boundary and protect profile-generated commands.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "preserve partly quoted trailing paths". In `src/file-navigator/args.ts`, unwrap a trailing path only when its quote pair encloses the entire argument, allowing surrounding whitespace; otherwise return the trimmed original text unchanged. Add cases in `src/file-navigator/args.test.ts` that preserve a balanced quote opened mid-word, continue unwrapping a fully quoted path with spaces, and keep a multiword trailing path verbatim. Preserve the trailing `in <label>` behavior. In `src/profile/files.test.ts`, verify that profile-generated quoting still handles paths containing a double quote, adding a focused case if needed.
