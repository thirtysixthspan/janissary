<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's raw heading fallback for every unlisted OpenCode provider prefix.

Existing Issue: `OPEN_CODE_HEADINGS` in `src/models/groups.ts` is a normal object, so looking up unlisted prefixes such as `constructor`, `toString`, or `__proto__` returns inherited properties instead of the raw prefix, allowing `groupModelCatalog` to produce a non-string heading. Severity: 5/10

Existing Risk: 4/10 - A configured OpenCode provider with one of these names can pass a function or object as a group heading to the models view and cause that group, or the view rendering it, to fail.

Proposal Risk: 1/10 - An own-key-safe lookup returns the configured heading only for the four declared prefixes and keeps every other heading as its raw string.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1935 "preserve raw headings for prototype-named OpenCode prefixes". Change the `OPEN_CODE_HEADINGS` lookup in `src/models/groups.ts` to use a `Map` or an own-property check so inherited object properties fall through to the raw prefix. Add cases to `src/models/groups.test.ts` for `constructor`, `toString`, and `__proto__`, asserting each heading is exactly the prefix string, and preserve the current tests for known provider headings and first-appearance ordering.
