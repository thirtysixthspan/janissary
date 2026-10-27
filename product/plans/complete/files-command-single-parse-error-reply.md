# Keep `files` parse errors to one transcript reply

**Complexity: 2/10** — the command already parses the arguments, and the manager already owns the error text; the fix avoids recording an open entry when parsing has failed.

## Goal

Malformed `files` commands produce one transcript entry containing the parser error, while valid opens and `files print` retain their current behavior.

## Approach

Handle `parsed.kind === 'error'` in `src/commands/files.ts` before appending the empty entry for an open operation. Append the parser's error as the command output using the existing invocation-aware helper, then return. This also handles malformed `files print` requests, which currently fall through to `FileNavigatorManager.open` and append the error after the blank entry.

## Implementation steps

1. Update `src/commands/files.ts` to append and return on parse errors before the empty open entry is recorded.
2. Extend `src/commands/files.test.ts` to cover a malformed view clause and malformed print request, asserting one transcript result with the expected error. Retain and assert the existing valid open and print cases.
3. Update `product/specs/file-navigator-tab.md` to describe the single error reply for malformed commands.

## Tests

- `src/commands/files.test.ts`: malformed view clause yields exactly one entry containing `files: unterminated quote`.
- `src/commands/files.test.ts`: malformed `files print` yields exactly one entry containing `Usage: files print <tab>.`.
- `src/commands/files.test.ts`: valid opens and prints each continue to yield one entry.

## Out of scope

- Changing parsing rules, error wording, or `FileNavigatorManager.open` behavior.
- Updating help or user documentation; this corrects behavior not previously described there.
