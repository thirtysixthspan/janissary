# Bound the `files` command-help length exception

**Complexity: 2/10** — one focused command-table test change and a short spec clarification; the help wording and runtime behavior already exist.

## Goal

The command-table test currently exempts every description containing `files print <tab>` from its 200-character limit. The expanded `files` description is 336 characters, so it needs a fixed allowance that fits the planned wording without allowing unlimited growth. Every other row must retain the 200-character maximum.

## Approach

Identify the `files` row by its command name instead of searching its description for a substring. Keep that row's explicit maximum at 350 characters, which accommodates the current 336-character description with a small margin. Apply the existing 200-character maximum to all other rows.

## Implementation steps

1. `src/commands.test.ts` — replace the substring-based exemption with parsed command rows. Assert that exactly one `files` row exists, its description is longer than 200 and no longer than 350 characters, and all other descriptions are no longer than 200 characters. Preserve the command-page and alphabetical-order tests.
2. `product/specs/application-commands.md` — clarify that command descriptions have a 200-character limit except for the `files` row, which has a 350-character limit.

## Tests

The command-table length test in `src/commands.test.ts` covers the 350-character `files` cap and the general 200-character limit. Diff-scoped lint, typecheck, and related server tests passed.

## Documentation

No help or public documentation update is needed. The change only bounds a regression check; the existing command wording and user-visible behavior do not change.

## Out of scope

- Changing the `files` description or any other command-table wording.
- Changing command behavior, the command-page checks, or alphabetical-order checks.
- Changing the PR description or any backlog entry other than the selected one.

## Verification

- Diff-scoped lint, typecheck, and related server tests passed.
- The PR remained open on `cli/file-tree-view`, and the pushed head matched the final local commit.
