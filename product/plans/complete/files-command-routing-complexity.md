# Reduce file navigator command routing complexity

**Complexity: 3/10** — the remote open/focus routing is extracted into a helper, with focused local and remote root coverage.

## Goal

Keep `openFilesCommand` at or below the configured cognitive-complexity limit while preserving local and remote root selection.

## Approach

Keep the existing local path expansion and remote containment resolver in their current modules. Delegate the remote open-or-focus branch to a focused helper and verify both local and remote roots through the command tests.

## Implementation steps

1. Keep the extracted remote open/focus branch in a helper so the command dispatcher stays below the lint complexity limit.
2. Add a command test confirming a local relative path roots at the local working directory; retain remote-root coverage.
3. Run the scoped lint, typecheck, and server tests.

## Tests

- A local relative path opens at the issuing tab's local working directory.
- A remote relative path continues to open at the named remote workspace path.

## Out of scope

Changing `~`/`$root` expansion, remote POSIX containment, or any file navigator command syntax.
