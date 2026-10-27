# Preserve safe profile paths ending in a backslash

**Complexity: 2/10** — a focused change to profile command serialization, with regression coverage for the serializer and its parser.

## Goal

Restore a profile file-navigator root whose single-token path ends in a backslash, without changing how paths that require quoting or resemble `files` clauses are interpreted.

## Approach

`filesCommand` currently wraps every profile path in double quotes. The shared token reader treats a backslash immediately before the closing double quote as an escaped quote, so the final path character is lost from the token and the quote remains unterminated.

Emit a trimmed path without quotes when it is one non-empty token, contains no quote characters, and is not a `files` clause, view keyword, `print` command, or bare side word. Quote other paths using the existing escaping behavior. This lets the parser preserve a trailing backslash on a safe token while retaining protection for spaces, quotes, and command syntax. Quoted paths that also end in a backslash remain outside this fix because the token reader cannot currently represent that combination.

## Implementation steps

1. Update `src/profile/files.ts` to emit safe single-token profile paths unquoted and retain quoting for paths that need it.
2. Update `src/profile/files.test.ts` for unquoted ordinary paths, a simple path ending in a backslash, and paths that still require quoting, including clause-like and escaped-quote paths.
3. Update the changed serializer expectation in `src/profile/agent-opener.test.ts`.
4. Update `src/file-navigator/args.test.ts` to verify the parser returns a single-token trailing-backslash path exactly, including after a leading clause.
5. Update `product/specs/profiles.md` to describe when profile file-navigator paths are quoted and record the remaining quoted trailing-backslash limitation.
6. Check existing help and user documentation for descriptions of this quoting behavior; update only if they describe it.

## Tests

- `src/profile/files.test.ts`: safe simple paths, including a trailing backslash, are passed to the navigator without quotes; clause-like, whitespace-containing, and escaped-quote paths retain quoting.
- `src/profile/agent-opener.test.ts`: profile opening still builds the expected command when a safe path is emitted without quotes.
- `src/file-navigator/args.test.ts`: an unquoted trailing-backslash target parses exactly, both alone and after `on left`.

## Out of scope

- Changing token-reader escaping or making a path that both needs quotes and ends in a backslash round-trip.
- Changing how file-navigator commands parse clauses or how profile paths are expanded.
- Adding new user documentation where no existing page describes this quoting behavior.
