# Preserve `in` as a trailing file-navigator tab label

**Complexity: 2/10** — a precedence correction in the pure argument parser, parser and manager regressions, and concise behavior documentation. No new parsing machinery or API.

## Goal

Allow `files src in in` to open `src` relative to the tab whose literal label is `in`. Keep `files src in` as the missing-label case, and preserve quoted labels and ordinary path-before-label parsing.

## Approach

`readTrailingIn` currently classifies a final bare `in` as a missing label before checking whether the preceding bare `in` introduces that final token as its label. Check the two-token clause first, then retain the existing missing-label fallback for a lone final `in`. The existing token and quote handling can remain unchanged.

## Implementation steps

1. In `src/file-navigator/args.ts`, recognize a final token as the label when it follows a bare trailing `in` clause before checking for a missing label. In `src/file-navigator/args.test.ts`, cover `src in in` and `src in`; keep the existing quoted-label and path-before-label cases.
2. In `src/file-navigator/manager.test.ts`, add an open tab named `in` with a distinct working directory and verify `files src in in` opens `src` beneath that directory.
3. Update `product/specs/file-navigator-tab.md` with the literal-`in` label case and retained missing-label error. Add a `files src in in` example to `help/files.md` and clarify the same behavior in `documentation/user-documentation/tab-types/file-navigator.md`.

The diff-scoped check passed after each implementation step and after the tests and documentation were complete.

## Tests

- `src/file-navigator/args.test.ts` — `src in in` returns target `src` and label `in`; `src in` sets `missingInLabel` and retains target `src`. Existing quoted labels and ordinary path-before-label cases continue to pass.
- `src/file-navigator/manager.test.ts` — the command resolves a tab literally named `in` and opens the relative path under its working directory.
- Diff-scoped lint, typecheck, and related server tests passed.

## Spec and docs

- `product/specs/file-navigator-tab.md` — specify the literal-`in` label case and the exact unchanged missing-label error.
- `help/files.md` and `documentation/user-documentation/tab-types/file-navigator.md` — show that the final `in` can be a one-word label while a lone trailing `in` remains incomplete.
- `help/commands.md` and `help/keys.md` already describe the generic label syntax and completion behavior; neither needs correction.

## Out of scope

- Changing quoted-label parsing, other clause rules, or how paths are resolved.
- Changing the command summary or adding behavior beyond trailing `in` labels.
