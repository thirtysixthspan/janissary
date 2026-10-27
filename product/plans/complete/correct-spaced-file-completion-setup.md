# Correct the spaced-file completion setup

**Complexity: 1/10** — correct one setup command in the pull request description. The application behavior is already covered by the existing specification and tests.

## Goal

Make verification step D8 open the fixture file named `space name.txt`, so the subsequent completion check can run against its tab.

## Approach

Use `open space name.txt` without shell-style quotes. `parseOpen` preserves the target text, and `runOpenCommand` treats a path without wildcard characters as one literal target. The surrounding D8 instructions and expected completion results stay unchanged.

## Implementation steps

1. Verify the existing path behavior in `src/commands/open.ts`, `src/open/file-command.ts`, and `product/specs/open.md`.
2. Update only D8 in the PR description after pushing the local plan, backlog removal, and implementation record, as required by the publication workflow.
3. Confirm the published D8 instruction uses the literal unquoted path and retains the rest of its completion actions and expectations.

## Tests

- No new test is needed because this corrects a verification instruction without changing application behavior.
- Run the existing `src/controller.test.ts` case that opens `space name.txt` and completes its displayed title, plus the `src/commands/open.test.ts` cases that preserve spaced targets as literal paths.
- Inspect the updated PR description to confirm D8 contains `open space name.txt` and the completion assertion remains intact.

## Spec and documentation

`product/specs/open.md` already specifies that a path without wildcards is a single literal target and that spaces are preserved. No spec or user-documentation update is needed.

## Out of scope

- Changing `open` parsing or file-opening behavior.
- Changing any other PR-description text or verification step.
- Adding or changing tests for already-covered application behavior.
