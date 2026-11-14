# Pin the command-bar wiring that filters a disabled file glob subcommand

**Complexity: 1/10** — no production code changes, 2 test requirements, 3 test scenarios (p=2.86)

`completeCommandLine` in `src/completion/index.ts` forwards its completion policy to `completeFileReadCommand`, which filters `file` subcommands by that policy. The parameter defaults to `ALL_ENABLED_POLICY`, and only the tests in `src/completion/file-read.test.ts` that call `completeFileReadCommand` directly check the filter. A refactor that dropped the third argument in `completeCommandLine` would still compile and pass every test, and the command bar would go back to offering `glob` after `file` while the `file glob` row is disabled, contradicting `product/specs/tab-completion.md`.

## Goal

A test at the `completeCommandLine` level fails if the policy stops reaching `completeFileReadCommand`, and the prefix guard is pinned for the new `file glob` subcommand.

## Approach

Add one test to the `completeCommandLine — disabled command guard` block in `src/completion/index.test.ts`, using the file's existing `policyWith` helper to disable only `file glob`. The test first asserts that `file ` with no policy offers `glob` and `read`, so the fixture is proven to offer both, then asserts that the same line under the policy offers only `read`. A second assertion checks that `file glob * --path ` under the policy returns the line unchanged with no matches, which the existing prefix guard in `completeCommandLine` already does.

## Implementation steps

1. In `src/completion/index.test.ts`, inside `describe('completeCommandLine — disabled command guard')`, add the test "drops a disabled file glob subcommand after file" with the three assertions above.

## Tests

- `completeCommandLine('file ', 5, dir)` matches `['glob', 'read']`.
- The same call with `policyWith(['file glob'])` matches `['read']`.
- `file glob * --path ` with the same policy returns the input and cursor unchanged with no matches.

Verify by temporarily removing the policy argument from the `completeFileReadCommand` call in `src/completion/index.ts`, confirming the new test fails while the existing tests pass, and restoring it.

## Out of scope

- Changing `completeFileReadCommand`'s default policy parameter in `src/completion/file-read.ts`, which `product/plans/complete/file-glob-9-completion-and-end-to-end.md` chose so existing callers stay unchanged.
- Specs and help pages, since no user-visible behavior changes.
