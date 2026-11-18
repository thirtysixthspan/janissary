# Add max tool turns configuration to config.json

**Complexity: 4/10** — ~15 added lines across 2 production files, 8 behavioral requirements and 7 test scenarios (p=5.00); the work is one config field, one decoder helper, and one backfill composition in the existing load path.

## Goal

Give `.janissary/config.json` a `maxToolTurns` setting with a default of 20. A fresh config writes the key out, and an existing config that predates it gains the key the next time Janissary loads config, so a project's file shows the setting explicitly instead of only holding it by omission.

## Approach

- Add `maxToolTurns: number` to the `Config` type and initialize it to `DEFAULT_MAX_TOOL_TURNS = 20` in `DEFAULT_CONFIG`, so the first-launch write in `loadConfig` includes it.
- Decode it with the existing `positiveIntegerValue` helper against the `defaults` argument. A wrong-typed, zero, negative, or fractional value falls back to 20 without disturbing valid neighbors. "How many turns" has no meaningful zero or fraction, the same reasoning the decoder already applies to `clipboardHistoryMaxEntries`.
- Add a small pure helper in `src/config-decode.ts` that returns a raw config record with `maxToolTurns` added when the key is absent. It uses the existing `configRecord` guard and `Object.hasOwn`, so a key present with a bad value is left as written for the decoder to fall back on, and a non-object file is left alone.
- In `loadConfig`'s existing-file branch, compose that helper with the existing notification-alert backfill and write the result through the same `atomicWriteFile` call. The write stays inside its own silent `try`, so a failure never changes the decoded config or prints a warning. A file with nothing missing is left byte-for-byte untouched.
- Do not wire the value into the tool loop or any runtime behavior. This change adds and persists the setting only.

## Implementation steps

1. `src/config.ts` — declare `DEFAULT_MAX_TOOL_TURNS = 20`, add `maxToolTurns: number` to `Config`, set it in `DEFAULT_CONFIG`, and compose the new backfill into `loadConfig`'s existing write path.
2. `src/config-decode.ts` — decode `maxToolTurns` with `positiveIntegerValue(record.maxToolTurns, defaults.maxToolTurns)` and add the pure `backfillMaxToolTurns(parsed, defaults)` helper.
3. `src/config.test.ts` — cover the fresh-file write, backfill on an existing file, an honored custom value, invalid values falling back, and `updateConfig` round-trip.
4. `product/specs/application-config.md` — add the settings-table row and extend the decoding and backfill paragraph.
5. `documentation/user-documentation/getting-started/configuration.md` — add the setting to the settings table and update the missing-defaults paragraph, because that page already lists config keys.

## Tests

- `src/config.test.ts`:
  - a fresh config.json contains `"maxToolTurns": 20` and `loadConfig` reports 20;
  - an existing config missing the key loads with 20 and gains the key on disk while every existing key, including an unknown hand-added key, survives;
  - an explicit positive integer is honored and the file is not rewritten;
  - invalid values (`0`, `-3`, `2.5`, `"20"`, `null`) decode to 20 while a neighboring valid setting stays;
  - `updateConfig` preserves the value and it survives a reload;
  - an invalid-JSON file is still left untouched;
  - a failed backfill write leaves the decoded config intact and prints nothing.
- Run `$janissary/scripts/run.mjs check-diff` after the source step and again after the tests.

## Spec and documentation

- `product/specs/application-config.md`: add the `maxToolTurns` row (number, default `20`) to the settings table, and extend the decoding paragraph with its count-style fallback and the new backfill exception alongside the notification-alert one.
- `documentation/user-documentation/getting-started/configuration.md`: add the row to the settings table and extend the "Editing and validation" paragraph so the missing-default behavior matches the spec. This page already documents the config keys, so it must stay in sync.
- No `help/` change: no command, flag, or key binding changes.

## Out of scope

- Wiring `maxToolTurns` into `driveToolLoop`, `CORE_MAX_STEPS`, or any tool-loop behavior; changing the effective step limit.
- Adding a runtime command or settings UI.
- Backfilling any other missing config key or changing how notification defaults are backfilled.
- Adding the setting to the client state snapshot; the client has no use for it.
