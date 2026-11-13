<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Share the positive-integer flag parser between the file read and file glob commands instead of copying it, since the technical-debt rationale for the copy does not hold.

Existing Issue: The file glob command module carries a byte-identical copy of the file read module's private positive-integer helper, justified in the subplan as a four-line function below the clone threshold, but the helper is five lines and roughly 56 tokens, which meets both the 5-line and 50-token minimums in the duplication detector's configuration. Severity: 2/10

Existing Risk: 3/10 - The duplication report gains a clone the plan said would not exist, and a later fix to the flag-value rules (for example rejecting leading zeros or capping digits) lands in one command and silently not the other, so `file read` and `file glob` drift in how they accept `--limit`.

Proposal Risk: 2/10 - One shared helper serves both parsers, so the remaining hazard is a change to it now affecting both commands at once, which both commands' existing limit tests would surface.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "share the duplicated positiveInteger helper between file read and file glob". Move the private `positiveInteger(value: string | undefined): number | undefined` function out of `src/file-read/command.ts` and `src/file-glob/command.ts` into a new top-level server module such as `src/positive-integer.ts` (alongside other small shared helpers like `src/datetime.ts`), export it, and import it with a `.js` extension from both command modules; do not place it inside either feature directory, so neither command imports the other. Keep its behavior exactly: only an all-digit token that is a safe integer of at least 1 is accepted. Add a colocated `src/positive-integer.test.ts` pinning undefined, `0`, `-3`, `1.5`, `1e3`, `007` (as 7), and a digit string beyond `Number.MAX_SAFE_INTEGER`. The existing `src/file-read/command.test.ts` and `src/file-glob/command.test.ts` limit cases (`--limit 0`, `--limit 1.5`, `--limit -3`, `--limit 007`, and the max-limit cases) must keep passing untouched. Verify with `$janissary/scripts/run.mjs check-diff` and `npm run duplication` showing no clone between the two command modules.
