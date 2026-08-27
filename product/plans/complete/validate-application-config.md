# Validate and transactionally update application configuration

**Complexity: 7/10** — the behavior is contained to application configuration, but correctness requires per-field runtime validation, nested defaults, unknown-key preservation, atomic replacement, and rollback when persistence fails.

## Goal

An invalid configuration value must not enter the typed runtime configuration or crash a consumer. Missing nested notification values inherit defaults, and a failed runtime update leaves both the file and live configuration at their prior values.

## Approach

Extract configuration decoding into a focused module that accepts unknown JSON, validates each supported field, and overlays valid values onto independent defaults. Preserve unknown on-disk keys when runtime commands update a setting. Serialize updates to a same-directory uniquely named temporary file and rename it over the configuration only after the write succeeds; update the in-memory configuration last.

## Implementation steps

1. Add a configuration decoder that validates supported scalar, array, map, and nested notification fields while filling missing or invalid values from fresh defaults.
2. Update `src/config.ts` to use the decoder on load and perform same-directory atomic replacement before publishing runtime changes.
3. Add focused `src/config.test.ts` coverage for invalid field types, partial notification defaults, failed-update rollback, unknown-key preservation, and the absence of temporary artifacts after successful replacement.
4. Update `product/specs/application-config.md` to describe invalid-value fallback, nested defaults, and transactional runtime updates.

## Tests

- Invalid scalar, list, and map values fall back independently without reaching consumers.
- A partial notifications block retains defaults for omitted or invalid event toggles.
- A failed update leaves the previous in-memory setting unchanged.
- Successful updates preserve unknown keys and leave no temporary sibling behind.
- Run `./scripts/run.mjs check-diff` after every implementation, test, spec, and backlog change.

## Out of scope

- Rejecting the entire application startup because one setting is invalid.
- Adding a configuration migration framework or JSON schema dependency.
- Changing configuration keys, defaults, commands, or public file locations.
