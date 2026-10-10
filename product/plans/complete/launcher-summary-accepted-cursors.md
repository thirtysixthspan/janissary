# Advance launcher summary cursors only for accepted summaries

Complexity: 4/10

## Goal

Keep tabs eligible for a later summary flush when an ACP reply is empty, malformed, or omits them.

## Approach

Filter out labels that cannot be routed before choosing tabs to prompt. Parse each successful reply once, then advance only fresh tab incarnations whose nonempty summaries appear in that parsed reply. Keep existing cursor values, priming, in-flight protection, and stale-incarnation checks.

## Implementation steps

1. Restrict the requested tab set to tabs with routable labels and skip ACP entirely when it is empty.
2. Parse the reply before changing cursors and advance only the requested, still-live tabs with accepted summaries.
3. Cover partial, empty, and malformed replies, unroutable-only lists, and preserve incarnation behavior.
4. Update the launcher spec with the rule for omitted summaries.

## Tests

- Update and extend `src/plugins/launcher/summarizer.test.ts` and `src/plugins/launcher/activate.test.ts` to prove omitted tabs are asked about again and accepted tabs are skipped.
- Run `./scripts/run.mjs check-diff` after the implementation and documentation changes.

## Out of scope

- Changing summary parsing, prompt format, ACP session ownership, or published summary merging.
