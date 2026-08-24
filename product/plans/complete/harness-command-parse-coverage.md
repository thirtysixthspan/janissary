# Harness command-parse coverage

Complexity: 2/10

## Goal

Give `src/harness/command-parse.ts` the colocated test file its 11 sibling modules in `src/harness/` already have, covering `parseHarnessCommand` and the branches of its helpers `findFlagValue`, `splitWithClause`, `parseHarnessFlags`, and `parseLabelSubcommand`.

## Approach

The helpers are module-private, so exercise them through the single exported entry point `parseHarnessCommand`. Each helper branch is reachable from a distinct input string: a missing flag value, a bare `with`, an unsupported `-y` harness, a dangling `as`, and the `capture`/`transcript` subcommand forms. Assert on the returned `HarnessParsed` variant rather than on internals, so the tests stay behavioral.

## Implementation steps

1. Add `src/harness/command-parse.test.ts` in the style of `src/harness/auto-approve.test.ts` (vitest `describe`/`it`, `.js` import extension).
2. Run `./scripts/run.mjs check-diff` and fix anything it reports.

## Tests

- Launch form: bare harness name; `-w`/`--workspace`; `--offline`; `-y`/`--yes` on a supporting harness; `--model` and `--effort` values; `as <label>`; combinations.
- Error paths: empty argument string; unknown harness name; `-y` on an unsupported harness; `--model`/`--effort` with no following value; `as` with no following label; `with` with no following prompt.
- `with <prompt>` clause: prompt captured verbatim with internal spaces; flag-like words inside the prompt not parsed as options.
- Subcommands: `capture <label>` and `transcript <label>`, plus each with a missing label.

## Out of scope

Do not change any parsing behavior, error strings, or the `HarnessParsed` type. Tests only.
