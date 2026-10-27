# Complete file paths after quoted directory names

**Complexity: 4/10** — the fix is contained to `files` command completion, but it must separate the shell token's raw replacement range from its decoded filesystem path without changing open-quote behavior.

## Goal

Allow Tab to complete a child path after a directory name containing spaces has been completed in quotes, for example `files expand "my dir"/ne`, while preserving clause completion, ordinary unquoted paths, and the no-match behavior inside an open quote.

## Approach

Scan the command prefix to find the active token boundary while respecting single and double quotes. Decode that token with the existing quoted-token reader, and use a completion cursor whose replacement range starts before the opening quote. Leave an unfinished quoted token unchanged with no matches. When building path candidates, quote the full decoded path if any part of it requires quoting, so a spaced parent remains valid after replacing the active token.

## Implementation steps

1. Update `src/completion/files.ts` to identify the active token from the full command prefix, parse earlier words using that boundary, and pass the decoded token and correct replacement start through existing completion paths.
2. Build filesystem candidate strings from the full path prefix and matched entry, quoting the whole path when needed while preserving directory slashes and existing root-aware, unquoted fallback behavior.
3. Add regressions in `src/completion/files.test.ts` for a child directory under `my dir`, clause completion after the completed quoted path, and the existing open-quote no-match behavior. Keep the current unquoted root fallback coverage.
4. Update `product/specs/tab-completion.md` and `product/specs/file-navigator-tab.md` to describe quoted nested-path completion. Update `help/keys.md` and `documentation/user-documentation/command-bar/tab-completion.md`, which already describe `files` path completion and quoted names.

## Tests

- `src/completion/files.test.ts`: `files expand "my dir"/ne` completes the matching child and replaces the token from its opening quote with a correctly quoted full path.
- `src/completion/files.test.ts`: after `files expand "my dir"/ `, clause candidates such as `in`, `on`, and `with` are available again.
- `src/completion/files.test.ts`: a quote still open at the cursor returns the original input with no matches; existing unquoted root fallback remains covered.
- Diff-scoped checks were run after each implementation step and again after the tests and documentation updates; all passed.

## Out of scope

- Changing completion behavior for commands other than `files`.
- Completing within an unfinished quote or changing how ordinary unquoted paths are matched.
- Changing file-navigator command parsing or adding new help pages.
