# Route caught errors through the shared error-text helper

**Complexity: 3/10** — the selected server and web call sites already have a shared formatter; this replaces duplicated conversions while preserving their visible strings.

## Goal

Use `errorText` from `src/error-text.ts` at the call sites named by the technical-debt entry, leaving intentional first-line trimming local.

## Approach

Import `errorText` directly from `src/error-text.ts` in server modules and through `@shared/error-text` in web modules. Replace the caught-error ternaries and the SQL plugin's local formatter without changing any message formatting. Keep the remote plugin terminal's first-line trim unchanged.

The plugin import-boundary rule rejects these shared formatter imports, so the lint boundary was extended for this specific leaf helper and its focused test was updated. No user-visible behavior changes.

## Tests

Run the existing colocated call-site tests and `./scripts/run.mjs check-diff` to verify lint, typechecking, and affected server and web suites.

## Specs and documentation

No spec or user documentation changes are needed because no observable behavior changes.

## Out of scope

- Changing how non-`Error` values are rendered.
- Changing the terminal's first-line message trimming.
- Updating unrelated plugin import boundaries or call sites.
